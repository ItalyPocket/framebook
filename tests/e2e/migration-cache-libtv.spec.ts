import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'

test('verified migration, streamed preview, bounded cache and visual CLI workspace', async () => {
  test.setTimeout(90000)
  const root = mkdtempSync(join(tmpdir(), 'framebook-migration-'))
  mkdirSync(join(root, '.app-data'))
  writeFileSync(join(root, '.app-data', 'settings.json'), JSON.stringify({ introMode: 'off', simplifyAnimations: true }))
  const source = join(root, 'source.mp4')
  execFileSync(join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'), ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=24:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { stdio: 'ignore' })
  const mock = join(root, 'libtv')
  const node = process.execPath
  writeFileSync(mock, `#!${node}\nconst a=process.argv.slice(2);let r={};if(a[0]==='account')r={activeAccount:{accountName:'Isolated account'}};if(a[0]==='workspace')r={folders:[{id:'ws1',name:'Workspace'}]};if(a[0]==='project'&&a[1]==='list')r={projects:[{uuid:'canvas1',name:'Test canvas'}]};else if(a[0]==='project')r={projectUuid:'canvas1',nodes:[{id:'node1',name:'Reference image',type:'image',position:{x:0,y:0}},{id:'node2',name:'Video generator',type:'video',position:{x:480,y:0}}],edges:[{id:'edge1',source:'node1',target:'node2'}]};if(a[0]==='node')r={nodeKey:a[1]==='create'?'new-node':a[1],data:{type:'image',params:{prompt:'Test prompt'},url:[]}};if(a[0]==='model')r=a[1]==='search'?{matches:[{modelName:'Test model',description:'For isolated UI validation'}]}:{schema:{properties:{ratio:{enum:['9:16','16:9'],default:'9:16'},count:[1,2]}}};console.log(JSON.stringify(r));`, { mode: 0o700 })
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SBR_SMOKE_DIR: root, SBR_LIBTV_BIN: mock } })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800))
    await page.locator('.language-select').selectOption('en')
    const project = await page.evaluate(async source => {
      const folder = await window.sbr.createProject('Migration test')
      const state = window.__sbr.store.getState()
      state.newProject(folder, 'Migration test')
      const media = state.addMedia(await window.sbr.importMedia(folder, source))
      state.addFrame(media.id, .5, 'Portrait')
      state.mutate('link test canvas', (doc: import('../../src/shared/types').Project) => { doc.settings.libtv = { projectId: 'canvas1', name: 'Test canvas' } })
      await window.sbr.saveProject(folder, JSON.stringify(window.__sbr.store.getState().doc))
      return { folder, id: window.__sbr.store.getState().doc.id, media }
    }, source)
    const stream = await page.evaluate(async p => {
      const url = await window.sbr.mediaUrl(p.folder, p.media.sourceFile)
      const response = await fetch(url, { headers: { Range: 'bytes=10-29' } })
      return { status: response.status, range: response.headers.get('Content-Range'), bytes: Array.from(new Uint8Array(await response.arrayBuffer())) }
    }, project)
    expect(stream.status).toBe(206)
    expect(stream.bytes).toEqual([...readFileSync(source).subarray(10, 30)])
    expect(stream.range).toMatch(/^bytes 10-29\//)
    const thumbnail = await page.evaluate(async p => {
      const start = performance.now()
      const first = await window.sbr.thumbnailUrl(p.folder, p.media.sourceFile, .5)
      const cold = performance.now() - start
      const warmStart = performance.now()
      const second = await window.sbr.thumbnailUrl(p.folder, p.media.sourceFile, .5)
      return { first, second, cold, warm: performance.now() - warmStart, stats: await window.sbr.cacheStats() }
    }, project)
    expect(thumbnail.first).toBe(thumbnail.second)
    expect(thumbnail.stats.limit).toBe(2 * 1024 ** 3)
    expect(thumbnail.stats.bytes).toBeGreaterThan(0)
    const destination = join(root, 'destination')
    mkdirSync(destination)
    const migrated = await page.evaluate(async ({ project, destination }) => {
      const scan = await window.sbr.migrationScan(project.folder)
      if (!scan) throw new Error('No scan')
      const job = await window.sbr.migrationRun(scan.id, { destination, mode: 'copy', collectExternal: true, includeExports: false, allowMissing: false, collision: 'copy' })
      let next = job
      while (next.state === 'running') { await new Promise(resolve => setTimeout(resolve, 30)); next = (await window.sbr.migrationStatus(job.id))! }
      return { scan, job: next }
    }, { project, destination })
    expect(migrated.scan.duplicate).toBe(true)
    expect(migrated.job.state).toBe('done')
    const result = JSON.parse(readFileSync(join(migrated.job.folder!, 'project.json'), 'utf8'))
    expect(result.id).not.toBe(project.id)
    expect(result.version).toBe(10)
    expect(readFileSync(join(migrated.job.folder!, result.media[0].sourceFile))).toEqual(readFileSync(source))
    expect(existsSync(join(project.folder, 'project.json'))).toBe(true)
    expect(existsSync(join(root, '.app-data', 'Projects', `${result.id}.sbref`, 'media'))).toBe(false)
    expect(existsSync(migrated.job.report!)).toBe(true)
    const invalid = join(root, 'future.sbref')
    mkdirSync(invalid)
    writeFileSync(join(invalid, 'project.json'), JSON.stringify({ ...result, version: 999 }))
    const future = await page.evaluate(path => window.sbr.migrationScan(path), invalid)
    expect(future?.supported).toBe(false)
    const oldFolder = join(root, 'legacy.sbref')
    mkdirSync(oldFolder)
    writeFileSync(join(oldFolder, 'project.json'), JSON.stringify({ ...result, version: 7, media: [{ ...result.media[0], sourceFile: 'media/external.mp4', externalPath: source }] }))
    const portable = await page.evaluate(async ({ oldFolder, destination }) => {
      const scan = await window.sbr.migrationScan(oldFolder)
      const job = await window.sbr.migrationRun(scan!.id, { destination, mode: 'package', collectExternal: true, includeExports: false, allowMissing: false, collision: 'copy' })
      let next = job
      while (next.state === 'running') { await new Promise(resolve => setTimeout(resolve, 30)); next = (await window.sbr.migrationStatus(job.id))! }
      if (next.state !== 'done') throw new Error(next.error)
      const imported = await window.sbr.migrationScan(next.folder!)
      return { job: next, imported }
    }, { oldFolder, destination })
    expect(portable.job.folder).toMatch(/\.zip$/)
    expect(portable.imported?.supported).toBe(true)
    expect(portable.imported?.files.every((file: { missing: boolean; path: string }) => !file.missing && !file.path.startsWith('/'))).toBe(true)
    expect(portable.imported?.version).toBe(10)
    expect(readFileSync(join(oldFolder, 'project.json'), 'utf8')).toContain('"version":7')
    const missingFolder = join(root, 'missing.sbref')
    mkdirSync(missingFolder)
    writeFileSync(join(missingFolder, 'project.json'), JSON.stringify({ ...result, media: [{ ...result.media[0], sourceFile: 'media/missing.mp4' }] }))
    const incomplete = await page.evaluate(async ({ missingFolder, destination }) => {
      const scan = await window.sbr.migrationScan(missingFolder)
      let blocked = false
      try { await window.sbr.migrationRun(scan!.id, { destination, mode: 'copy', collectExternal: true, includeExports: false, allowMissing: false, collision: 'copy' }) } catch { blocked = true }
      const job = await window.sbr.migrationRun(scan!.id, { destination, mode: 'copy', collectExternal: true, includeExports: false, allowMissing: true, collision: 'copy' })
      let next = job
      while (next.state === 'running') { await new Promise(resolve => setTimeout(resolve, 30)); next = (await window.sbr.migrationStatus(job.id))! }
      return { blocked, missing: scan!.files.filter((file: { missing: boolean }) => file.missing).length, job: next }
    }, { missingFolder, destination })
    expect(incomplete.blocked).toBe(true)
    expect(incomplete.missing).toBe(1)
    expect(incomplete.job.state).toBe('done')
    expect(incomplete.job.issues.length).toBeGreaterThan(0)
    const cancelled = await page.evaluate(async ({ folder, destination }) => {
      const scan = await window.sbr.migrationScan(folder)
      const job = await window.sbr.migrationRun(scan!.id, { destination, mode: 'copy', collectExternal: true, includeExports: false, allowMissing: false, collision: 'copy' })
      await window.sbr.migrationCancel(job.id)
      await new Promise(resolve => setTimeout(resolve, 200))
      return window.sbr.migrationStatus(job.id)
    }, { folder: project.folder, destination })
    expect(cancelled?.state).toBe('cancelled')
    expect(readdirSync(destination).filter(name => name.endsWith('.migrating'))).toHaveLength(0)
    await page.evaluate(() => window.__sbr.store.getState().setWorkspace('libtv'))
    await expect(page.locator('.libtv-node')).toHaveCount(2)
    await expect(page.locator('.libtv-edges path')).toHaveCount(1)
    await page.locator('.libtv-node').last().focus()
    await expect(page.getByRole('heading', { name: 'Node generation settings' })).toBeVisible()
    await expect(page.locator('.libtv-floating-composer').getByText('Reference image', { exact: true })).toBeVisible()
    await page.locator('.libtv-generator select').first().selectOption('Test model')
    await expect(page.locator('.libtv-generator select').nth(1)).toHaveValue('9:16')
    await expect(page.locator('.libtv-generator [role=alert]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Review generation', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Confirm generation', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    const simulated = await page.evaluate(() => window.sbr.libtvGenerate({ projectId: 'canvas1', type: 'image', model: 'Test model', prompt: 'Isolated fake CLI task', params: {}, confirmed: true }))
    expect(simulated.node).toBe('new-node')
    await expect.poll(() => page.evaluate(async id => (await window.sbr.libtvTasks()).find((task: import('../../src/shared/libtvGeneration').LibTVGenerationTask) => task.id === id)?.state, simulated.id)).toBe('done')
    expect(JSON.parse(readFileSync(join(root, '.app-data', 'libtv-tasks.json'), 'utf8'))[0].node).toBe('new-node')
    for (const [width, height] of [[1100, 700], [1920, 1080]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0]!.setContentSize(size[0]!, size[1]!), [width!, height!])
      await page.waitForTimeout(80)
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      const bounds = await page.locator('.workspace-stack').boundingBox()
      expect(bounds!.x + bounds!.width).toBeGreaterThan(viewport.width - 2)
      expect(bounds!.y + bounds!.height).toBeGreaterThan(viewport.height - 2)
    }
    const shots = join(process.cwd(), '../outputs/migration-libtv')
    mkdirSync(shots, { recursive: true })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800))
    await page.locator('.language-select').selectOption('zh-CN')
    await page.locator('.libtv-inspector').evaluate(element => { element.scrollTop = 0 })
    await page.screenshot({ path: join(shots, 'libtv-workspace.png') })
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '存储与迁移', exact: true }).click()
    await page.getByRole('button', { name: '扫描当前项目', exact: true }).click()
    await expect(page.locator('.migration-review')).toBeVisible()
    await page.waitForTimeout(180)
    await page.screenshot({ path: join(shots, 'storage-center.png') })
    console.log(JSON.stringify({ cacheColdMs: thumbnail.cold, cacheWarmMs: thumbnail.warm, migration: migrated.job.state, streamedBytes: stream.bytes.length }))
  } finally { await app.close() }
})
