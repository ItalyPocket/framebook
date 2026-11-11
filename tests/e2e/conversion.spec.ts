import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { execFileSync } from 'child_process'
import ffmpeg from 'ffmpeg-static'
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
  expect(xml).toContain('<in>150</in><out>210</out>')
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
  writeFileSync(join(root, '.app-data/settings.json'), JSON.stringify({ introMode: 'off', simplifyAnimations: true, draftRoot: root }))
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
    const media = join(root, 'relinked.mp4')
    execFileSync(ffmpeg!, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=24:d=2', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', '3', '-c:v', 'libx264', '-c:a', 'aac', media])
    await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, media)
    const relinked = await page.evaluate(id => window.sbr.conversionRelink(id, '/missing/a.mp4'), session.id)
    expect(relinked.timeline.clips[0]).toMatchObject({ width: 320, height: 180, fps: 24, materialDuration: 2000000 })
    expect(relinked.timeline.missing).toEqual([])
    const result = await page.evaluate(id => window.sbr.conversionPreview(id, 'srt'), session.id)
    expect(result.text).toContain('中文字幕')
    writeFileSync(join(root, 'encrypted.json'), 'encrypted-content')
    await expect(page.evaluate(path => window.sbr.conversionOpen(path), join(root, 'encrypted.json'))).rejects.toThrow('加密草稿')
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

test('groups drafts, saves the folder and opens the localized conversion flow', async () => {
  const root = mkdtempSync(join(tmpdir(), 'framebook-draft-library-'))
  const library = join(root, 'Drafts')
  const project = join(library, '广告分镜')
  const encrypted = join(library, '加密工程')
  const empty = join(root, 'Empty')
  for (const path of [project, encrypted, empty, join(root, '.app-data'), join(project, 'Timelines', 'active'), join(project, 'Timelines', 'alternate')]) mkdirSync(path, { recursive: true })
  writeFileSync(join(project, 'draft_content.json'), JSON.stringify(draft))
  writeFileSync(join(project, 'draft_content.json.bak'), JSON.stringify(draft))
  writeFileSync(join(project, 'draft_meta_info.json'), JSON.stringify({ draft_name: '竖版广告 · 夏日' }))
  writeFileSync(join(project, 'Timelines/active/draft_info.json'), JSON.stringify(draft))
  writeFileSync(join(project, 'Timelines/alternate/draft_info.json'), JSON.stringify({ ...draft, name: '备选时间线' }))
  writeFileSync(join(encrypted, 'draft_info.json'), 'QUJDREVGRw==')
  writeFileSync(join(encrypted, 'template.json'), JSON.stringify({ ...draft, name: '历史明文副本' }))
  writeFileSync(join(library, 'root_meta_info.json'), JSON.stringify({ all_draft_store: [{ draft_fold_path: encrypted, draft_name: '加密工程', tm_duration: 12000000 }] }))
  writeFileSync(join(root, '.app-data/settings.json'), JSON.stringify({ introMode: 'off', simplifyAnimations: true, draftRoot: empty }))
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SBR_SMOKE_DIR: root } })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1100, 700))
    await page.locator('.language-select').selectOption('zh-CN')
    await page.getByRole('button', { name: '草稿转换', exact: true }).click()
    await expect(page.getByText('暂无草稿', { exact: true })).toBeVisible()
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }) }, library)
    await page.getByRole('button', { name: '设置草稿目录', exact: true }).first().click()
    await expect(page.locator('.draft-card')).toHaveCount(2)
    expect((await page.evaluate(() => window.sbr.getSettings())).draftRoot).toBe(library)
    const entries = await page.evaluate(() => window.sbr.conversionScan())
    expect(entries.find((entry: any) => entry.name === '竖版广告 · 夏日').sources).toHaveLength(2)
    expect(entries.find((entry: any) => entry.name === '加密工程').duration).toBe(12000000)
    expect(entries.find((entry: any) => entry.name === '加密工程').sources).toHaveLength(2)
    await page.locator('.draft-card').filter({ hasText: '加密工程' }).click()
    await expect(page.getByRole('button', { name: '进入转换', exact: true })).toBeDisabled()
    await expect(page.getByText('云端草稿转换', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '搜索草稿', exact: true }).click()
    await page.getByRole('textbox', { name: '搜索草稿', exact: true }).fill('竖版广告')
    await expect(page.locator('.draft-card')).toHaveCount(1)
    await page.getByRole('textbox', { name: '搜索草稿', exact: true }).press('Escape')
    await expect(page.locator('.draft-card')).toHaveCount(2)
    await page.locator('.draft-card').filter({ hasText: '加密工程' }).click()
    await page.getByLabel('选择时间线', { exact: true }).selectOption({ label: '明文备份：template.json · 可转换' })
    await expect(page.getByRole('button', { name: '进入转换', exact: true })).toBeEnabled()
    await page.locator('.draft-card').filter({ hasText: '竖版广告 · 夏日' }).click()
    await page.screenshot({ path: join(root, 'draft-library-zh.png') })
    await page.getByRole('button', { name: '进入转换', exact: true }).click()
    await expect(page.getByRole('heading', { name: '测试时间线' })).toBeVisible()
    await page.getByLabel('导出格式', { exact: true }).selectOption('stl')
    await expect(page.getByRole('alert')).toHaveText('当前 EBU STL 仅支持基础英文字符，中文字幕请选择 SRT 或 ASS 格式。')
    await page.getByLabel('导出格式', { exact: true }).selectOption('srt')
    await expect(page.getByRole('button', { name: '确认导出', exact: true })).toBeEnabled()
    await page.screenshot({ path: join(root, 'conversion-zh.png') })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '草稿转换', exact: true }).click()
    await expect(page.locator('.draft-card')).toHaveCount(2)
    console.log(`Draft library screenshots: ${root}`)
  } finally { await app.close() }
})

test('accepts omitted zero starts without losing source in points', () => {
  const raw = structuredClone(draft)
  delete (raw.tracks[0].segments[0].target_timerange as any).start
  delete (raw.tracks[0].segments[0] as any).source_timerange.start
  const timeline = parseDraft(raw, '/draft.json', 'Draft')
  expect(timeline.clips[0].start).toBe(0)
  expect(timeline.clips[0].sourceStart).toBe(0)
  expect(String(convertTimeline(timeline, 'xml'))).toContain('<in>0</in><out>60</out>')
})

test('decrypts only after consent and keeps the cloud key out of exports', async () => {
  const root = mkdtempSync(join(tmpdir(), 'framebook-cloud-'))
  mkdirSync(join(root, '.app-data'))
  writeFileSync(join(root, '.app-data/settings.json'), JSON.stringify({ introMode: 'off', simplifyAnimations: true }))
  const path = join(root, 'draft_info.json')
  writeFileSync(path, 'encrypted-test-body')
  const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, SBR_SMOKE_DIR: root } })
  try {
    const page = await app.firstWindow()
    await page.evaluate(() => window.sbr.conversionKeySave('isolated-test-key'))
    expect(await page.evaluate(() => window.sbr.conversionKeyStatus())).toBe(true)
    await app.evaluate((_electron, raw) => {
      globalThis.fetch = async (_url, options) => {
        if ((options?.headers as Record<string, string>)?.AuthKey !== 'isolated-test-key') throw new Error('Missing key')
        if (!((options?.body as FormData).get('jsonFile') instanceof Blob)) throw new Error('Missing file')
        return new Response(JSON.stringify({ success: true, draft_content: JSON.stringify(raw) }), { status: 200 })
      }
    }, draft)
    await expect(page.evaluate(path => window.sbr.conversionOpen(path), path)).rejects.toThrow('加密草稿')
    const session = await page.evaluate(path => window.sbr.conversionOpen(path, true), path)
    const preview = await page.evaluate(id => window.sbr.conversionPreview(id, 'xml'), session!.id)
    expect(preview.text).toContain('<xmeml')
    expect(preview.text).not.toContain('isolated-test-key')
    expect(readFileSync(path, 'utf8')).toBe('encrypted-test-body')
    await page.evaluate(() => window.sbr.conversionKeySave(''))
    expect(await page.evaluate(() => window.sbr.conversionKeyStatus())).toBe(false)
  } finally { await app.close() }
})

test('exports still images with Resolve-compatible duration and timecode', () => {
  const raw = structuredClone(draft)
  const material = raw.materials.videos[0]
  material.path = '/missing/overlay.png'
  const xml = String(convertTimeline(parseDraft(raw, '/draft.json', 'Draft'), 'xml'))
  expect(xml).toContain('<stillframe>TRUE</stillframe>')
  expect(xml).toContain('<video><duration>1</duration>')
  expect(xml).toContain('<timecode><string>00:00:00:00</string>')
})

test('declares effect units and uses timeline frames for speed-adjusted trims', () => {
  const raw = structuredClone(draft)
  const segment = raw.tracks[0].segments[0] as any
  segment.source_timerange = { start: 2000000, duration: 4000000 }
  segment.clip = { scale: { x: 1.2, y: 1.2 } }
  const xml = String(convertTimeline(parseDraft(raw, '/draft.json', 'Draft'), 'xml'))
  expect(xml).toContain('<parameterid>speed</parameterid><value>200</value><valuemin>-10000</valuemin><valuemax>10000</valuemax>')
  expect(xml).toContain('<parameterid>scale</parameterid><value>120</value><valuemin>0</valuemin><valuemax>10000</valuemax>')
  expect(xml).toContain('<in>30</in><out>90</out>')
})

test('preserves hidden tracks and clips without treating empty animation records as effects', () => {
  const raw = structuredClone(draft) as any
  raw.materials.material_animations = [{ id: 'empty', type: 'sticker_animation' }]
  raw.tracks[0].visible = false
  raw.tracks[0].segments[0].extra_material_refs = ['empty']
  raw.tracks[1].segments[0].visible = false
  const timeline = parseDraft(raw, '/draft.json', 'Draft')
  expect(timeline.clips.every(clip => clip.enabled === false)).toBe(true)
  expect(timeline.issues.some(issue => issue.feature === 'Keyframe animation')).toBe(false)
  const xml = String(convertTimeline(timeline, 'xml'))
  expect(xml).toContain('<enabled>FALSE</enabled>')
  expect(String(convertTimeline(timeline, 'srt'))).toBe('')
})

test('compensates FCP7 still-image height fitting without changing video scale or source paths', () => {
  const raw = structuredClone(draft) as any
  raw.canvas_config = { width: 480, height: 960 }
  Object.assign(raw.materials.videos[0], { path: '/original/title.png', width: 800, height: 200, type: 'photo' })
  raw.tracks[0].segments[0].clip = { scale: { x: 0.8, y: 0.8 }, transform: { x: 0.25, y: -0.5 } }
  const xml = String(convertTimeline(parseDraft(raw, '/draft.json', 'Draft'), 'xml'))
  expect(xml).toContain('<parameterid>scale</parameterid><value>10</value>')
  expect(xml).toContain('<horiz>0.015625</horiz><vert>0.25</vert>')
  expect(xml).toContain('file:///original/title.png')
  Object.assign(raw.materials.videos[0], { width: 200, height: 800 })
  const portrait = String(convertTimeline(parseDraft(raw, '/draft.json', 'Draft'), 'xml'))
  expect(portrait).toContain('<parameterid>scale</parameterid><value>80</value>')
  expect(portrait).toContain('<horiz>0.25</horiz><vert>0.25</vert>')
  raw.materials.videos[0].path = '/original/video.mp4'
  raw.materials.videos[0].type = 'video'
  expect(String(convertTimeline(parseDraft(raw, '/draft.json', 'Draft'), 'xml'))).toContain('<parameterid>scale</parameterid><value>80</value>')
})


test('does not mistake overlay-track flags for hidden clips', () => {
  const raw = structuredClone(draft) as any
  raw.tracks[0].flag = 2
  expect(parseDraft(raw, '/draft.json', 'Draft').clips[0].enabled).toBe(true)
})
