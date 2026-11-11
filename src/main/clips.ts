import { projectData } from './projectStorage'
import { app, ipcMain, dialog } from 'electron'
import { readFile, mkdir, mkdtemp, rm, copyFile, stat } from 'fs/promises'
import { join, basename, isAbsolute } from 'path'
import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import { resolveFfmpeg, run } from './ffmpeg'
import { parseProject, defaultProjectExports } from '../shared/schema'
import type { ClipExportJob, ClipExportOptions } from '../shared/clips'

const jobs = new Map<string, { job: ClipExportJob; root: string; folder: string; files: string[]; child?: ChildProcess }>()
export async function prepareClips(folder: string, ids: string[], resolvePath: (folder: string, path: string) => Promise<string>, options?: ClipExportOptions): Promise<ClipExportJob> {
    const doc = parseProject(await projectData(folder)).doc
    if (!doc) throw new Error('Invalid project')
    const settings = doc.settings.exports ?? defaultProjectExports()
    const opts = options ?? settings.video
    if (!['mp4', 'mov'].includes(opts.format) || !['native', '2160', '1080', '720'].includes(opts.resolution)) throw new Error('Invalid video format')
    const clips = doc.media.filter(media => ids.includes(media.id) && media.clip)
    if (!clips.length) throw new Error('No video clips selected')
    const sources = await Promise.all(clips.map(media => resolvePath(folder, media.externalPath ?? media.sourceFile)))
    const root = await mkdtemp(join(app.getPath('temp'), 'framebook-clips-'))
    const job: ClipExportJob = { id: randomUUID(), state: 'running', items: clips.map((media, index) => ({ id: media.id, name: `${String(index + 1).padStart(3, '0')}-${media.name.replace(/[\\/:*?"<>|]/g, '-').replace(/[. ]+$/, '') || 'clip'}.${opts.format}`, state: 'pending', progress: 0 })) }
    const task: { job: ClipExportJob; root: string; folder: string; files: string[]; child?: ChildProcess } = { job, root, folder, files: [] }
    jobs.set(job.id, task)
    void (async () => {
      const binary = await resolveFfmpeg()
      for (const [index, media] of clips.entries()) {
        if (job.state === 'cancelled') break
        const item = job.items[index]!
        const range = media.clip!
        item.state = 'encoding'
        const filename = item.name
        const output = join(root, filename)
        const args = ['-nostdin', '-y', '-ss', String(range.inS), '-i', sources[index]!, '-t', String(range.outS - range.inS), '-map', '0:v:0']
        if (!opts.muted) args.push('-map', '0:a:0?')
        if (opts.resolution !== 'native') {
          const size = Number(opts.resolution)
          args.push('-vf', `scale=w='trunc(iw*min(1,${size}/min(iw,ih))/2)*2':h='trunc(ih*min(1,${size}/min(iw,ih))/2)*2'`)
        } else args.push('-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2')
        args.push(...(opts.format === 'mov' ? ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le', '-c:a', 'pcm_s16le'] : ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart']))
        if (opts.muted) args.push('-an')
        args.push('-progress', 'pipe:1', output)
        try {
          await new Promise<void>((resolve, reject) => {
            const child = spawn(binary, args)
            task.child = child
            let error = ''
            child.stdout?.on('data', data => {
              for (const match of String(data).matchAll(/out_time_us=(\d+)/g)) item.progress = Math.min(99, Number(match[1]) / ((range.outS - range.inS) * 10000))
            })
            child.stderr?.on('data', data => { error = (error + String(data)).slice(-3000) })
            child.on('error', reject)
            child.on('close', code => code === 0 ? resolve() : reject(new Error(error || 'Encoding cancelled')))
          })
          item.state = 'ready'; item.progress = 100; task.files.push(output)
        } catch (error) { item.state = 'failed'; item.error = String(error) }
      }
      delete task.child
      if (job.state !== 'cancelled') job.state = 'done'
    })().catch(error => { for (const item of job.items) if (item.state !== 'ready') { item.state = 'failed'; item.error = String(error) } job.state = 'done' })
    return job
}
export async function clipUpload(folder: string, id: string, resolvePath: (folder: string, path: string) => Promise<string>): Promise<{ path: string; release(): Promise<void> }> {
  const job = await prepareClips(folder, [id], resolvePath, { format: 'mp4', resolution: 'native', muted: false })
  while (job.state === 'running') await new Promise(resolve => setTimeout(resolve, 250))
  const task = jobs.get(job.id)!
  if (!task.files[0]) { await rm(task.root, { recursive: true, force: true }); jobs.delete(job.id); throw new Error(job.items[0]?.error ?? 'Clip export failed') }
  return { path: task.files[0], release: async () => { await rm(task.root, { recursive: true, force: true }); jobs.delete(job.id) } }
}
export function setupClips(resolvePath: (folder: string, path: string) => Promise<string>): void {
  ipcMain.handle('clips:prepare', (_event, folder: string, ids: string[], options?: ClipExportOptions) => prepareClips(folder, ids, resolvePath, options))
  ipcMain.handle('clips:status', (_event, id: string) => jobs.get(id)?.job ?? null)
  ipcMain.handle('clips:read', async (_event, id: string, index: number) => {
    const task = jobs.get(id)
    if (!task || task.job.state !== 'done' || !task.files[index]) throw new Error('Preview not ready')
    let file = task.files[index]!
    if (file.endsWith('.mov')) {
      const proxy = join(task.root, `.preview-${index}.mp4`)
      if (!(await stat(proxy).catch(() => null))) {
        const result = await run(await resolveFfmpeg(), ['-nostdin', '-y', '-i', file, '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', proxy])
        if (result.code !== 0) throw new Error(result.stderr)
      }
      file = proxy
    }
    return new Uint8Array(await readFile(file))
  })
  ipcMain.handle('clips:cancel', async (_event, id: string) => {
    const task = jobs.get(id)
    if (!task) return
    task.job.state = 'cancelled'
    if (task.child) await new Promise<void>(resolve => { task.child!.once('close', () => resolve()); task.child!.kill('SIGTERM') })
    await rm(task.root, { recursive: true, force: true }); jobs.delete(id)
  })
  ipcMain.handle('clips:confirm', async (_event, id: string) => {
    const task = jobs.get(id)
    if (!task || task.job.state !== 'done' || !task.files.length) throw new Error('Preview not ready')
    const doc = parseProject(await projectData(task.folder)).doc!
    const settings = (doc.settings.exports ?? defaultProjectExports()).clips
    let directory = isAbsolute(settings.directory) ? settings.directory : join(doc.settings.archiveFolder ?? task.folder, settings.directory)
    if (settings.ask) {
      const result = await dialog.showOpenDialog({ defaultPath: directory, properties: ['openDirectory', 'createDirectory'] })
      if (result.canceled) return null
      directory = result.filePaths[0]!
    }
    await mkdir(directory, { recursive: true })
    const destination = await mkdtemp(join(directory, 'clips-'))
    try {
      for (const file of task.files) {
        if (!(await stat(file)).isFile()) throw new Error('Missing preview file')
        await copyFile(file, join(destination, basename(file)))
      }
    } catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
    await rm(task.root, { recursive: true, force: true }); jobs.delete(id)
    return destination
  })
  app.on('will-quit', () => { for (const task of jobs.values()) { task.child?.kill(); void rm(task.root, { recursive: true, force: true }) } })
}
