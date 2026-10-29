import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, mkdirSync, copyFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'

test('gallery, editable storyboard table, image cells, save and exports', async () => {
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
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await page.getByRole('textbox', { name: '项目名称', exact: true }).fill('Smoke')
    await page.getByRole('dialog').getByRole('button', { name: '新建项目', exact: true }).click()
    const batches = await page.evaluate(async (clip) => {
      const s = window.__sbr.store.getState()
      const media = s.addMedia(await window.sbr.importMedia(s.projectFolder, clip))
      const result = await window.sbr.extractRange(s.mediaAbsPath(media.id), 0, 2, { kind: 'count', n: 3 }, `${s.projectFolder}/.frames`)
      for (const f of [...result.frames].reverse()) { const frame = s.addFrame(media.id, f.time, `竖屏镜头 ${f.time.toFixed(2)}`); s.setStill(frame.id, { path: f.path, width: media.width, height: media.height }) }
      return { result, times: window.__sbr.store.getState().orderedFrames().map((f: any) => f.timeS) }
    }, clip)
    expect(batches.result.ok).toBe(true)
    expect(batches.result.frames).toHaveLength(3)
    expect(batches.times).toEqual([...batches.times].sort((a, b) => a - b))
    await page.locator('.workspace-nav').getByRole('button', { name: /静帧画廊/ }).click()
    await expect(page.locator('.gallery-image img')).toHaveCount(3)
    await page.getByRole('button', { name: '全选', exact: true }).click()
    await page.getByRole('button', { name: '合并为一个多图镜头', exact: true }).click()
    await expect(page.locator('.story-table tbody tr')).toHaveCount(1)
    await expect(page.locator('.story-cell-image')).toHaveCount(3)
    await page.locator('.story-table tbody tr').getByRole('textbox', { name: '内容', exact: true }).fill('主角走入画面，镜头缓慢推进。')
    await page.screenshot({ path: join(outputs, 'framebook-storyboard.png') })
    const result = await page.evaluate(async () => {
      const s = window.__sbr.store.getState()
      const doc = s.doc
      const shot = doc.storyboard.shots[0]
      const imageColumn = doc.storyboard.columns.find((column: any) => column.type === 'image')
      const images = shot.cells[imageColumn.id]
      const contentColumn = doc.storyboard.columns.find((column: any) => column.id === 'description')
      s.updateStoryCell(shot.id, contentColumn.id, '主角走入画面，镜头缓慢推进。')
      const json = JSON.stringify(window.__sbr.store.getState().doc)
      await window.sbr.saveProject(s.projectFolder, json)
      s.loadFromJson(s.projectFolder, (await window.sbr.loadProject(s.projectFolder)).json)
      const current = window.__sbr.store.getState()
      const savedShot = current.doc.storyboard.shots[0]
      const frames = savedShot.cells[imageColumn.id].map((image: any) => ({
        sourcePng: current.stills[image.frame.id]?.path ?? `${current.projectFolder}/media/missing.png`,
        label: image.frame.label, notes: '', promptText: '', profileId: '', crop: null, sourceWidth: 270, sourceHeight: 480,
        timeS: image.frame.timeS, mediaName: 'portrait.mov'
      }))
      for (const [index, image] of savedShot.cells[imageColumn.id].entries()) {
        const path = `${current.projectFolder}/.frames/${image.frame.id}.png`
        const extracted = await window.sbr.extractFrame(current.mediaAbsPath(image.frame.mediaId), image.frame.timeS, path)
        if (!extracted.ok) throw new Error(extracted.error)
        frames[index].sourcePng = path
      }
      const base = { title: '帧册测试：竖屏分镜', description: '镜头分析。', exportsRoot: `${current.projectFolder}/exports`, columns: current.doc.storyboard.columns.filter((column: any) => column.visible), shots: [{ ...savedShot, rendered: frames, imageRoles: ['开始', '中间', '结束'] }], language: 'zh-CN', layout: 'table', orientation: 'landscape' }
      const csv = await window.sbr.exportStoryboard({ ...base, kind: 'csv' })
      const pdf = await window.sbr.exportStoryboard({ ...base, kind: 'pdf' })
      return { csv, pdf, imageCount: images.length, version: current.doc.version, cells: savedShot.cells }
    })
    expect(result.imageCount).toBe(3)
    expect(result.version).toBe(6)
    expect(result.cells.description).toBe('主角走入画面，镜头缓慢推进。')
    expect(result.csv.ok, result.csv.error).toBe(true)
    expect(result.pdf.ok, result.pdf.error).toBe(true)
    const csv = readFileSync(result.csv.path, 'utf8')
    expect(csv).toContain('画面')
    expect(csv).toContain('主角走入画面')
    expect(readFileSync(result.pdf.path).subarray(0, 4).toString()).toBe('%PDF')
    copyFileSync(result.pdf.path, join(outputs, 'sample-storyboard.pdf'))
    copyFileSync(result.csv.path, join(outputs, 'sample-storyboard.csv'))
    expect(errors).toEqual([])
  } finally { await app.close() }
})
