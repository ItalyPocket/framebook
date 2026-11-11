import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, renameSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

test('clip range, export, storyboard and internal project storage', async () => {
  test.setTimeout(90000)
  const root = mkdtempSync(join(tmpdir(), 'framebook-clips-test-'))
  mkdirSync(join(root, '.app-data'))
  writeFileSync(join(root, '.app-data', 'settings.json'), JSON.stringify({ introMode: 'off', simplifyAnimations: true, backupLimit: 3 }))
  const source = join(root, 'portrait.mp4')
  execFileSync(join(process.cwd(), 'node_modules/ffmpeg-static/ffmpeg'), ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=180x320:r=24:d=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', source], { stdio: 'ignore' })
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SBR_SMOKE_DIR: root } })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.setContentSize(1280, 800))
    await page.locator('.language-select').selectOption('en')
    const project = await page.evaluate(async path => {
      const folder = await window.sbr.createProject('Clip test')
      const state = window.__sbr.store.getState()
      state.newProject(folder, 'Clip test')
      const original = state.addMedia(await window.sbr.importMedia(folder, path))
      const clip = state.addMedia({ ...original, name: 'Portrait range', clip: { sourceMediaId: original.id, inS: .5, outS: 1.5 }, durationS: 1 })
      if (clip.id === original.id) throw new Error('A clip must have its own media ID')
      state.selectMedia(clip.id)
      state.setWorkspace('capture')
      await window.sbr.saveProject(folder, JSON.stringify(window.__sbr.store.getState().doc))
      return { folder, id: state.doc?.id ?? window.__sbr.store.getState().doc.id, clipId: clip.id }
    }, source)
    const primary = join(root, '.app-data', 'Projects', `${project.id}.sbref`)
    expect(existsSync(join(primary, 'project.json'))).toBe(true)
    expect(existsSync(join(primary, 'media'))).toBe(false)
    await expect(page.getByRole('combobox', { name: 'Capture mode' })).toHaveValue('clip')
    await expect(page.getByRole('slider', { name: 'Preview volume' })).toBeVisible()
    await page.getByRole('slider', { name: 'Preview volume' }).fill('0.35')
    await expect.poll(() => page.locator('.viewer video').evaluate((video: HTMLVideoElement) => video.volume)).toBeCloseTo(.35, 2)
    const reference = await page.evaluate(async project => {
      const state = window.__sbr.store.getState()
      const shot = state.addShots([], true)
      const column = window.__sbr.store.getState().doc.storyboard.columns.find((column: any) => column.type === 'image').id
      const frame = { id: 'clip-reference-test', mediaId: project.clipId, timeS: .5, label: 'Video reference', notes: '', order: 0, crop: null, prompt: null, durationS: 1, shot: { sceneNo: '', shotNo: '', shotSize: '', cameraAngle: '', lens: '', movement: '', transition: '' }, annotations: [] }
      state.addStoryImage(shot, column, frame)
      state.undo()
      const empty = window.__sbr.store.getState().doc.storyboard.shots[0].cells[column].length
      state.redo()
      await window.sbr.saveProject(project.folder, JSON.stringify(window.__sbr.store.getState().doc))
      const loaded = await window.sbr.loadProject(project.folder)
      return { empty, mediaId: JSON.parse(loaded.json).storyboard.shots[0].cells[column][0].frame.mediaId }
    }, project)
    expect(reference.empty).toBe(0)
    expect(reference.mediaId).toBe(project.clipId)
    const job = await page.evaluate(async project => window.sbr.clipsPrepare(project.folder, [project.clipId]), project)
    await expect.poll(() => page.evaluate(async id => (await window.sbr.clipsStatus(id))?.state, job.id)).toBe('done')
    const status = await page.evaluate(async id => window.sbr.clipsStatus(id), job.id)
    expect(status.items[0].state).toBe('ready')
    expect((await page.evaluate(async id => (await window.sbr.clipsRead(id, 0)).length, job.id))).toBeGreaterThan(1000)
    const destination = await page.evaluate(async id => window.sbr.clipsConfirm(id), job.id)
    expect(destination.startsWith(join(project.folder, '导出', '视频片段'))).toBe(true)
    const output = join(destination, readdirSync(destination)[0]!)
    const probe = execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'quiet', '-show_streams', '-show_format', '-of', 'json', output], { encoding: 'utf8' })
    const info = JSON.parse(probe)
    expect(info.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video').width).toBe(180)
    expect(info.streams.find((stream: { codec_type: string }) => stream.codec_type === 'video').height).toBe(320)
    expect(info.streams.some((stream: { codec_type: string }) => stream.codec_type === 'audio')).toBe(true)
    expect(Number(info.format.duration)).toBeCloseTo(1, 1)
    await page.evaluate(async folder => {
      const state = window.__sbr.store.getState()
      for (let index = 0; index < 5; index++) {
        state.mutate('test save', (doc: any) => { doc.storyboard.description = String(index) })
        await window.sbr.saveProject(folder, JSON.stringify(window.__sbr.store.getState().doc))
      }
    }, project.folder)
    expect(readdirSync(join(primary, '.autosave')).filter(name => name.startsWith('recovery-')).length).toBe(3)
    const external = JSON.parse(readFileSync(join(project.folder, 'project.json'), 'utf8'))
    external.name = 'External edit'
    writeFileSync(join(project.folder, 'project.json'), JSON.stringify(external))
    await page.evaluate(async folder => window.sbr.saveProject(folder, JSON.stringify(window.__sbr.store.getState().doc)), project.folder)
    expect(JSON.parse(readFileSync(join(project.folder, 'project.json'), 'utf8')).name).toBe('External edit')
    await page.evaluate(async folder => window.sbr.resolveSync(folder), project.folder)
    expect(JSON.parse(readFileSync(join(project.folder, 'project.json'), 'utf8')).name).toBe('Clip test')
    renameSync(project.folder, `${project.folder}.offline`)
    const loaded = await page.evaluate(async folder => window.sbr.loadProject(folder), project.folder)
    expect(JSON.parse(loaded.json).name).toBe('Clip test')
    expect(existsSync(project.folder)).toBe(false)
    renameSync(`${project.folder}.offline`, project.folder)
    const archiveParent = join(root, 'Archive')
    mkdirSync(archiveParent)
    const moved = await page.evaluate(async ({ folder, parent }) => window.sbr.moveArchive(folder, parent, JSON.stringify(window.__sbr.store.getState().doc)), { folder: project.folder, parent: archiveParent })
    expect(existsSync(join(moved, external.media[0].sourceFile))).toBe(true)
    expect(existsSync(join(project.folder, external.media[0].sourceFile))).toBe(true)
    expect(JSON.parse(readFileSync(join(primary, 'project.json'), 'utf8')).settings.archiveFolder).toBe(moved)
  } finally { await app.close() }
})
