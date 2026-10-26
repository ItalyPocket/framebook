import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

test('gallery ordering, independent multi-image shots, recovery and bilingual exports', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'framebook-'))
  const clip = join(dir, 'portrait.mov')
  execFileSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=s=270x480:d=2:r=24', '-c:v', 'libx264', clip], { stdio: 'ignore' })
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SBR_SMOKE_DIR: dir } })
  const outputs = join(process.cwd(), '../outputs')
  mkdirSync(outputs, { recursive: true })
  try {
    const page = await app.firstWindow()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.locator('.language-select').selectOption('zh-CN')
    await page.screenshot({ path: join(outputs, 'framebook-welcome.png') })
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    const batches = await page.evaluate(async (clip) => {
      const s = window.__sbr.store.getState()
      const media = s.addMedia(await window.sbr.importMedia(s.projectFolder, clip))
      const one = await window.sbr.extractRange(s.mediaAbsPath(media.id), 0, 2, { kind: 'count', n: 3 }, `${s.projectFolder}/.frames`)
      const two = await window.sbr.extractRange(s.mediaAbsPath(media.id), 0, 2, { kind: 'count', n: 3 }, `${s.projectFolder}/.frames`)
      for (const f of [...one.frames].reverse()) { const frame = s.addFrame(media.id, f.time, `竖屏镜头 ${f.time.toFixed(2)}`); s.setStill(frame.id, { path: f.path, width: media.width, height: media.height }) }
      return { one, two, times: window.__sbr.store.getState().orderedFrames().map((f: any) => f.timeS) }
    }, clip)
    expect(batches.one.ok).toBe(true)
    expect(batches.one.frames).toHaveLength(3)
    expect(batches.one.frames[0].path).not.toBe(batches.two.frames[0].path)
    expect(batches.times).toEqual([...batches.times].sort((a, b) => a - b))
    await page.locator('.workspace-nav').getByRole('button', { name: /静帧画廊/ }).click()
    await expect(page.locator('.gallery-image img')).toHaveCount(3)
    await page.locator('.gallery-card').last().getByRole('button', { name: '前移', exact: true }).click()
    await expect(page.getByText('手动排序', { exact: true })).toBeVisible()
    await app.evaluate(({ Menu }) => { Menu.getApplicationMenu()?.items[1]?.submenu?.items[0]?.click() })
    await expect(page.getByText('按素材时间排序', { exact: true })).toBeVisible()
    await app.evaluate(({ Menu }) => { Menu.getApplicationMenu()?.items[1]?.submenu?.items[1]?.click() })
    await expect(page.getByText('手动排序', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '全选', exact: true }).click()
    await page.screenshot({ path: join(outputs, 'framebook-gallery.png') })
    await page.getByRole('button', { name: '合并为一个多图镜头', exact: true }).click()
    await expect(page.locator('.shot-image')).toHaveCount(3)
    await page.getByLabel('画面描述', { exact: true }).fill('主角走入画面，镜头缓慢推进。')
    await page.getByLabel('对白／旁白', { exact: true }).fill('“我们从这里开始。”')
    await page.getByLabel('起始时间（秒）', { exact: true }).fill('0')
    await page.getByLabel('结束时间（秒）', { exact: true }).fill('2')
    await page.locator('.inspector-heading').scrollIntoViewIfNeeded()
    const preview = await page.locator('.shot-preview').boundingBox()
    const picture = await page.locator('.shot-preview img').boundingBox()
    expect(picture!.height).toBeLessThanOrEqual(preview!.height + 1)
    await page.screenshot({ path: join(outputs, 'framebook-storyboard.png') })
    const saved = await page.evaluate(async () => {
      const s = window.__sbr.store.getState()
      const shot = s.doc.storyboard.shots[0]
      s.removeFrame(s.doc.frames[0].id)
      const remaining = window.__sbr.store.getState().doc.storyboard.shots[0].images.length
      s.undo()
      const restored = window.__sbr.store.getState().doc.frames.length
      const json = JSON.stringify(window.__sbr.store.getState().doc)
      await window.sbr.saveProject(s.projectFolder, json)
      s.loadFromJson(s.projectFolder, (await window.sbr.loadProject(s.projectFolder)).json)
      return { remaining, restored, shotId: shot.id, shot: window.__sbr.store.getState().doc.storyboard.shots[0] }
    })
    expect(saved.remaining).toBe(3)
    expect(saved.restored).toBe(3)
    expect(saved.shot.images).toHaveLength(3)
    expect(saved.shot.description).toBe('主角走入画面，镜头缓慢推进。')
    expect(saved.shot.endS).toBe(2)
    const exported = await page.evaluate(async () => {
      const s = window.__sbr.store.getState()
      const shot = s.doc.storyboard.shots[0]
      const media = s.doc.media[0]
      const rendered = []
      for (const image of shot.images) {
        const path = `${s.projectFolder}/.frames/${image.frame.id}.png`
        const result = await window.sbr.extractFrame(s.mediaAbsPath(media.id), image.frame.timeS, path)
        if (!result.ok) throw new Error(result.error)
        rendered.push({ sourcePng: path, label: image.frame.label, notes: '', promptText: '', profileId: '', crop: null, sourceWidth: media.width, sourceHeight: media.height, timeS: image.frame.timeS, mediaName: media.name })
      }
      const base = { title: '帧册测试：竖屏多图分镜', description: '三张图组成一个镜头。', exportsRoot: `${s.projectFolder}/exports`, shots: [{ ...shot, rendered }], language: 'zh-CN', layout: 'table', orientation: 'landscape' }
      const csv = await window.sbr.exportStoryboard({ ...base, kind: 'csv' })
      const pdf = await window.sbr.exportStoryboard({ ...base, kind: 'pdf' })
      const png = await window.sbr.exportNumbered({ projectName: 'test', exportsRoot: base.exportsRoot, frames: rendered }, 'png')
      const jpg = await window.sbr.exportNumbered({ projectName: 'test', exportsRoot: base.exportsRoot, frames: rendered }, 'jpg')
      s.setFrameCropAspect(s.doc.frames[0].id, '3:4')
      const crop = window.__sbr.store.getState().doc.frames[0].crop
      const cropped = await window.sbr.exportNumbered({ projectName: 'crop', exportsRoot: base.exportsRoot, frames: [{ ...rendered[0], crop }] }, 'png')
      const longPdf = await window.sbr.exportStoryboard({ ...base, language: 'en', layout: 'cards', orientation: 'portrait', kind: 'pdf', shots: [{ ...shot, rendered, notes: '长篇镜头分析，保留所有文字。'.repeat(1000) }] })
      return { csv, pdf, png, jpg, cropped, longPdf, times: rendered.map((f) => f.timeS) }
    })
    for (const result of [exported.csv, exported.pdf, exported.png, exported.jpg, exported.longPdf]) expect(result.ok, result.error).toBe(true)
    const csv = readFileSync(exported.csv.path, 'utf8')
    expect(csv).toContain('画面描述')
    expect(csv).toContain('主角走入画面')
    for (const format of ['png', 'jpg'] as const) {
      const folder = exported[format].path
      expect(existsSync(join(folder, `003.${format}`))).toBe(true)
      const metadata = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', join(folder, `001.${format}`)], { encoding: 'utf8' }))
      expect(metadata.streams[0].width).toBe(270)
      expect(metadata.streams[0].height).toBe(480)
      expect(JSON.parse(readFileSync(join(folder, 'frames.json'), 'utf8')).map((f: any) => f.timeS)).toEqual(exported.times)
    }
    const cropSize = JSON.parse(execFileSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', join(exported.cropped.path, '001.png')], { encoding: 'utf8' })).streams[0]
    expect(cropSize.width / cropSize.height).toBeCloseTo(3 / 4, 2)
    expect(readFileSync(exported.pdf.path).subarray(0, 4).toString()).toBe('%PDF')
    expect(readFileSync(exported.longPdf.path).length).toBeGreaterThan(15000)
    copyFileSync(exported.pdf.path, join(outputs, 'sample-storyboard.pdf'))
    copyFileSync(exported.csv.path, join(outputs, 'sample-storyboard.csv'))
    expect(errors).toEqual([])
  } finally { await app.close() }
})
