import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseDraft, convertTimeline, rate } from '../../src/main/draftConversion'

const draft = {
  name: '测试时间线', fps: 30000 / 1001, duration: 4000000,
  canvas_config: { width: 1080, height: 1920 },
  materials: { videos: [{ id: 'v', path: '/missing/a.mp4', duration: 20000000, fps: 24, width: 1080, height: 1920 }], texts: [{ id: 't', content: JSON.stringify({ text: '中文字幕\n第二行' }) }] },
  tracks: [{ type: 'video', segments: [{ id: 'c', material_id: 'v', source_timerange: { start: 5000000, duration: 2000000 }, target_timerange: { start: 1000000, duration: 2000000 } }] }, { type: 'text', segments: [{ id: 's', material_id: 't', target_timerange: { start: 1000000, duration: 2000000 } }] }]
}
test('preserves source in points, rational rates and Unicode subtitles', () => {
  const timeline = parseDraft(draft, '/draft.json', 'Draft')
  expect(rate(timeline.fps)).toEqual({ numerator: 30000, denominator: 1001, timebase: 30, ntsc: true })
  const xml = String(convertTimeline(timeline, 'xml'))
  expect(xml).toContain('<in>120</in><out>168</out>')
  expect(xml).toContain('<start>30</start><end>90</end>')
  expect(xml).not.toContain('Time Remap')
  expect(xml).toContain('<sourcetrack><mediatype>audio</mediatype>')
  expect(String(convertTimeline(timeline, 'srt'))).toContain('00:00:01,000 --> 00:00:03,000\n中文字幕\n第二行')
  expect(() => convertTimeline(timeline, 'stl')).toThrow('ASCII')
  expect(timeline.issues.some(issue => issue.feature === 'Embedded video audio')).toBe(true)
  const invalid = structuredClone(draft)
  delete (invalid.tracks[0].segments[0] as any).source_timerange
  expect(() => convertTimeline(parseDraft(invalid, '/draft.json', 'Draft'), 'xml')).toThrow('source range')
})
test('opens conversion in the application without changing draft files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'framebook-conversion-'))
  mkdirSync(join(root, '.app-data'))
  writeFileSync(join(root, '.app-data/settings.json'), JSON.stringify({ introMode: 'off', simplifyAnimations: true }))
  const path = join(root, 'draft_content.json')
  const original = JSON.stringify(draft)
  writeFileSync(path, original)
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SBR_SMOKE_DIR: root } })
  try {
    const page = await app.firstWindow()
    await page.locator('.language-select').selectOption('en')
    await page.getByRole('button', { name: 'Draft conversion', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
    }, path)
    await page.getByRole('button', { name: 'Open draft JSON', exact: true }).click()
    await expect(page.getByRole('heading', { name: '测试时间线' })).toBeVisible()
    const session = await page.evaluate(path => window.sbr.conversionOpen(path), path)
    expect(session.timeline.missing).toEqual(['/missing/a.mp4'])
    const result = await page.evaluate(id => window.sbr.conversionPreview(id, 'srt'), session.id)
    expect(result.text).toContain('中文字幕')
    writeFileSync(join(root, 'encrypted.json'), 'encrypted-content')
    await expect(page.evaluate(path => window.sbr.conversionOpen(path), join(root, 'encrypted.json'))).rejects.toThrow('Encrypted or unreadable')
    expect(readFileSync(path, 'utf8')).toBe(original)
    const exported = join(root, 'Converted.srt')
    await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }) }, exported)
    await page.evaluate(id => window.sbr.conversionExport(id, 'srt'), session.id)
    expect(readFileSync(exported, 'utf8')).toBe(result.text)
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }) })
    expect(await page.evaluate(id => window.sbr.conversionExport(id, 'srt'), session.id)).toBeNull()
    await page.screenshot({ path: join(root, 'conversion.png') })
    console.log(`Conversion screenshot: ${join(root, 'conversion.png')}`)
  } finally { await app.close() }
})
