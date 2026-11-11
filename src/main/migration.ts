import { app, ipcMain, dialog } from 'electron'
import { readFile, writeFile, mkdir, stat, lstat, readdir, copyFile, rename, rm, mkdtemp } from 'fs/promises'
import { createReadStream } from 'fs'
import { join, resolve, relative, isAbsolute, basename, extname, sep } from 'path'
import { tmpdir } from 'os'
import { createHash, randomUUID } from 'crypto'
import { parseProject } from '../shared/schema'
import { PROJECT_VERSION, type Project } from '../shared/types'
import type { MigrationScan, MigrationOptions, MigrationJob, MigrationFile } from '../shared/migration'
import { internalFolder, savePrimary, atomicJson, syncArchive } from './projectStorage'
import { registerProject } from './workspace'
import { run } from './ffmpeg'

const scans = new Map<string, { scan: MigrationScan; raw: string; temporary?: string }>()
const jobs = new Map<string, MigrationJob>()
function within(root: string, path: string): boolean { const rel = relative(resolve(root), resolve(path)); return !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) }
async function hash(path: string): Promise<string> { const value = createHash('sha256'); for await (const chunk of createReadStream(path)) value.update(chunk); return value.digest('hex') }
async function safeSource(folder: string, value: string): Promise<string> {
  const source = resolve(folder, value)
  if (!within(folder, source)) throw new Error('Project path escapes its folder')
  let current = resolve(folder)
  for (const part of relative(current, source).split(sep)) { current = join(current, part); const info = await lstat(current).catch(() => null); if (info?.isSymbolicLink()) throw new Error('Symbolic links are not supported') }
  return source
}
async function scanFolder(folder: string, temporary?: string): Promise<MigrationScan> {
  const raw = await readFile(join(folder, 'project.json'), 'utf8')
  const doc = JSON.parse(raw) as Project
  const supported = Number(doc.version || 1) <= PROJECT_VERSION
  const result = supported ? parseProject(raw) : null
  const files: MigrationFile[] = []
  const issues = result?.issues.map(item => item.message) ?? []
  const add = async (path: string, external = false): Promise<void> => {
    const source = external ? resolve(path) : await safeSource(folder, path)
    if (files.some(file => file.source === source)) return
    const info = await stat(source).catch(() => null)
    files.push({ path, source, bytes: info?.size ?? 0, missing: !info?.isFile() })
    if (!info?.isFile()) issues.push(`Missing: ${basename(path)}`)
  }
  for (const media of doc.media ?? []) {
    await add(media.externalPath ?? media.sourceFile, !!media.externalPath)
    if (media.workingFile) await add(media.workingFile)
  }
  if (doc.settings?.audioFile) await add(doc.settings.audioFile)
  const id = randomUUID()
  const duplicate = /^[a-zA-Z0-9_-]+$/.test(doc.id) && await stat(join(internalFolder(doc.id), 'project.json')).then(() => true).catch(() => false)
  const existingRaw = duplicate ? await readFile(join(internalFolder(doc.id), 'project.json'), 'utf8') : null
  const existingDoc = existingRaw ? JSON.parse(existingRaw) as Project : null
  const existing = existingDoc ? { name: existingDoc.name, version: existingDoc.version, media: existingDoc.media.length, shots: existingDoc.storyboard.shots.length, modified: (await stat(join(internalFolder(doc.id), 'project.json'))).mtimeMs } : undefined
  const scan: MigrationScan = { id, folder, name: doc.name || 'Untitled', version: doc.version || 1, supported: supported && !!result?.doc, duplicate, existing, files, bytes: files.reduce((sum, file) => sum + file.bytes, 0), issues }
  scans.set(id, { scan, raw, temporary })
  return scan
}
export function setupMigration(): void {
  ipcMain.handle('migration:scan', async (_event, folder?: string) => {
    if (!folder) {
      const selected = await dialog.showOpenDialog({ properties: ['openFile', 'openDirectory'], filters: [{ name: 'Framebook', extensions: ['sbref', 'zip'] }] })
      if (selected.canceled) return null
      folder = selected.filePaths[0]!
    }
    if (extname(folder).toLowerCase() !== '.zip') return scanFolder(folder)
    const temporary = await mkdtemp(join(tmpdir(), 'framebook-migrate-'))
    try {
      const list = await run('/usr/bin/unzip', ['-Z', '-1', folder])
      if (list.code !== 0 || list.stdout.split('\n').some(path => path && (isAbsolute(path) || path.split(/[\\/]/).includes('..')))) throw new Error('Unsafe project package')
      const metadata = await run('/usr/bin/unzip', ['-Z', '-l', folder])
      if (/^l[rwx-]{9}/m.test(metadata.stdout)) throw new Error('Symbolic links are not supported')
      const unpack = await run('/usr/bin/ditto', ['-x', '-k', folder, temporary])
      if (unpack.code !== 0) throw new Error('Could not unpack project')
      const entries = await readdir(temporary)
      const root = entries.find(name => name.endsWith('.sbref'))
      return await scanFolder(root ? join(temporary, root) : temporary, temporary)
    } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error }
  })
  ipcMain.handle('migration:relink', async (_event, id: string, original: string) => {
    const entry = scans.get(id)
    const file = entry?.scan.files.find(file => file.source === original && file.missing)
    if (!entry || !file) throw new Error('Missing media entry not found')
    const selected = await dialog.showOpenDialog({ properties: ['openFile'] })
    if (selected.canceled) return entry.scan
    const source = selected.filePaths[0]!, info = await lstat(source)
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Choose a regular media file')
    const doc = JSON.parse(entry.raw) as Project
    for (const media of doc.media ?? []) {
      if (resolve(entry.scan.folder, media.externalPath ?? media.sourceFile) === original) media.externalPath = source
      if (media.workingFile && resolve(entry.scan.folder, media.workingFile) === original) { media.workingFile = undefined; media.externalPath = source }
    }
    if (doc.settings.audioFile && resolve(entry.scan.folder, doc.settings.audioFile) === original) { doc.settings.audioFile = source }
    entry.raw = JSON.stringify(doc)
    file.source = source; file.bytes = info.size; file.missing = false
    entry.scan.bytes = entry.scan.files.reduce((sum, item) => sum + item.bytes, 0)
    entry.scan.issues = entry.scan.issues.filter(issue => issue !== `Missing: ${basename(file.path)}`)
    return entry.scan
  })
  ipcMain.handle('migration:status', (_event, id: string) => jobs.get(id) ?? null)
  ipcMain.handle('migration:cancel', (_event, id: string) => { const job = jobs.get(id); if (job?.state === 'running') job.state = 'cancelled' })
  ipcMain.handle('migration:release', async (_event, id: string) => { const scan = scans.get(id); if (scan?.temporary) await rm(scan.temporary, { recursive: true, force: true }); scans.delete(id) })
  ipcMain.handle('migration:run', async (_event, id: string, options: MigrationOptions) => {
    const stored = scans.get(id)
    if (!stored?.scan.supported) throw new Error('Unsupported project version')
    if (!['copy', 'move', 'upgrade', 'package'].includes(options.mode)) throw new Error('Invalid migration mode')
    if (!options.allowMissing && stored.scan.files.some(file => file.missing)) throw new Error('Relink missing media or allow an incomplete project')
    const destination = resolve(options.destination)
    await stat(destination)
    if (within(stored.scan.folder, destination)) throw new Error('Destination cannot be inside the source project')
    const job: MigrationJob = { id: randomUUID(), state: 'running', completed: 0, total: stored.scan.files.length, issues: [...stored.scan.issues] }
    jobs.set(job.id, job)
    void (async () => {
      const name = stored.scan.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Project'
      const target = join(destination, `${name}-${job.id.slice(0, 6)}.sbref`)
      const stage = `${target}.migrating`
      const reportRoot = join(app.getPath('userData'), 'MigrationReports', job.id)
      let committed = false
      let rollback: { path: string; data: string | null; sync: string | null } | null = null
      try {
        await mkdir(reportRoot, { recursive: true })
        await writeFile(join(reportRoot, 'original-project.json'), stored.raw, { mode: 0o600 })
        const doc = parseProject(stored.raw).doc!
        if (stored.scan.duplicate && options.collision !== 'update' && options.mode !== 'package') doc.id = `proj_${randomUUID().replace(/-/g, '')}`
        await mkdir(stage)
        const copied = new Map<string, string>()
        for (const file of stored.scan.files) {
          if (jobs.get(job.id)?.state === 'cancelled') throw new Error('Migration cancelled')
          const external = !within(stored.scan.folder, file.source)
          const output = external ? join('media', `${createHash('sha256').update(file.source).digest('hex').slice(0, 12)}-${basename(file.source)}`) : relative(stored.scan.folder, file.source)
          if (!file.missing && (!external || options.collectExternal)) {
            if ((await lstat(file.source)).isSymbolicLink()) throw new Error('Symbolic links are not supported')
            const to = join(stage, output)
            await mkdir(resolve(to, '..'), { recursive: true }); await copyFile(file.source, to)
            if ((await stat(to)).size !== file.bytes || await hash(file.source) !== await hash(to)) throw new Error(`Copy verification failed: ${basename(file.path)}`)
            copied.set(file.source, output)
          }
          job.completed++
        }
        for (const media of doc.media) {
          if (media.externalPath && copied.has(resolve(media.externalPath))) { media.sourceFile = copied.get(resolve(media.externalPath))!; delete media.externalPath }
        }
        if (doc.settings.audioFile && copied.has(resolve(doc.settings.audioFile))) doc.settings.audioFile = copied.get(resolve(doc.settings.audioFile))!
        if (options.includeExports) {
          const copyExports = async (from: string, to: string): Promise<void> => {
            for (const entry of await readdir(from, { withFileTypes: true }).catch(() => [])) {
              if (jobs.get(job.id)?.state === 'cancelled') throw new Error('Migration cancelled')
              const source = join(from, entry.name), output = join(to, entry.name)
              if (entry.isSymbolicLink()) throw new Error('Symbolic links are not supported')
              if (entry.isDirectory()) { await mkdir(output, { recursive: true }); await copyExports(source, output) }
              else if (entry.isFile()) { await mkdir(to, { recursive: true }); await copyFile(source, output); if (await hash(source) !== await hash(output)) throw new Error('Export verification failed') }
            }
          }
          const exportDirectories = ['exports', '导出', ...Object.values(doc.settings.exports ?? {}).filter((value): value is { directory: string; ask: boolean } => !!value && typeof value === 'object' && 'directory' in value && typeof value.directory === 'string').map(value => value.directory).filter(path => path && !isAbsolute(path) && within(stored.scan.folder, resolve(stored.scan.folder, path)) && resolve(stored.scan.folder, path) !== resolve(stored.scan.folder))]
          for (const directory of [...new Set(exportDirectories)]) await copyExports(join(stored.scan.folder, directory), join(stage, directory))
        }
        doc.settings.archiveFolder = target
        if (options.mode === 'package') {
          delete doc.settings.archiveFolder
          for (const [key, value] of Object.entries(doc.settings.exports ?? {})) if (value && typeof value === 'object' && 'directory' in value && typeof value.directory === 'string' && isAbsolute(value.directory)) value.directory = `导出/${key === 'storyboard' ? '分镜本' : key === 'frames' ? '静帧' : '视频片段'}`
        }
        await writeFile(join(stage, 'project.json'), JSON.stringify(doc, null, 2))
        if (jobs.get(job.id)?.state === 'cancelled') throw new Error('Migration cancelled')
        await rename(stage, target)
        if (options.mode === 'package') {
          const zip = `${target}.zip`
          const result = await run('/usr/bin/ditto', ['-c', '-k', '--keepParent', target, zip])
          if (result.code !== 0) throw new Error('Could not create project package')
          if (jobs.get(job.id)?.state === 'cancelled') throw new Error('Migration cancelled')
          await rm(target, { recursive: true, force: true }); job.folder = zip
        } else {
          const primary = internalFolder(doc.id)
          rollback = { path: primary, data: await readFile(join(primary, 'project.json'), 'utf8').catch(() => null), sync: await readFile(join(primary, '.sync.json'), 'utf8').catch(() => null) }
          if (rollback.data) {
            await writeFile(join(reportRoot, 'previous-internal-project.json'), rollback.data, { mode: 0o600 })
            await mkdir(join(primary, '.autosave'), { recursive: true })
            await writeFile(join(primary, '.autosave', `migration-${Date.now()}.json`), rollback.data)
          }
          const saved = await savePrimary(target, JSON.stringify(doc))
          await atomicJson(join(saved.primary, 'project.json'), saved.content)
          await syncArchive(target, saved.primary, saved.content, true)
          await registerProject(target)
          job.folder = target
        }
        committed = true
        job.state = 'done'
      } catch (error) {
        if (job.state !== 'cancelled') { job.state = 'failed'; job.error = String(error) }
      } finally {
        await rm(stage, { recursive: true, force: true })
        if (!committed && rollback) {
          if (rollback.data) await atomicJson(join(rollback.path, 'project.json'), rollback.data)
          else await rm(join(rollback.path, 'project.json'), { force: true })
          if (rollback.sync) await atomicJson(join(rollback.path, '.sync.json'), rollback.sync)
          else await rm(join(rollback.path, '.sync.json'), { force: true })
        }
        if (!committed) { await rm(target, { recursive: true, force: true }); await rm(`${target}.zip`, { force: true }) }
        const report = { ...job, sourceVersion: stored.scan.version, targetVersion: PROJECT_VERSION, sourcePreserved: true }
        job.report = join(reportRoot, 'report.json')
        await writeFile(job.report, JSON.stringify(report, null, 2), { mode: 0o600 })
      }
    })()
    return job
  })
}
