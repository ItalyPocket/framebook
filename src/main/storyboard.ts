import { BrowserWindow } from 'electron'
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'fs/promises'
import { join } from 'path'
import type { StoryboardExportInput, FileExportResult } from '../shared/exports'
import { STORY_FIELDS, type StoryField } from '../shared/types'
import { t } from '../shared/i18n'
import { renderDisplayStill, type ExportInput } from './export'
import { resolveFfmpeg, run } from './ffmpeg'

const escape = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const csv = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`

export async function exportNumbered(input: ExportInput, format: 'png' | 'jpg'): Promise<FileExportResult> {
  let path = ''
  try {
    if (!input.frames.length || !['png', 'jpg'].includes(format)) throw new Error('Invalid export request')
    await mkdir(input.exportsRoot, { recursive: true })
    path = await mkdtemp(join(input.exportsRoot, 'frames-'))
    const work = join(path, '.render')
    const manifest = []
    for (const [index, frame] of input.frames.entries()) {
      const name = `${String(index + 1).padStart(3, '0')}.${format}`
      const source = await renderDisplayStill(frame, work, index)
      if (format === 'png') await copyFile(source, join(path, name))
      else {
        const result = await run(await resolveFfmpeg(), ['-y', '-i', source, '-q:v', '2', join(path, name)])
        if (result.code !== 0) throw new Error(result.stderr.slice(-400))
      }
      manifest.push({ file: name, label: frame.label, source: frame.mediaName, timeS: frame.timeS })
    }
    await writeFile(join(path, 'frames.json'), JSON.stringify(manifest, null, 2))
    await rm(work, { recursive: true, force: true })
    return { ok: true, path }
  } catch (error) { return { ok: false, path, error: (error as Error).message } }
}

export async function exportStoryboard(input: StoryboardExportInput): Promise<FileExportResult> {
  let path = ''
  let work = ''
  let win: BrowserWindow | null = null
  try {
    if (!input.shots.length) throw new Error('No shots to export')
    if (input.shots.some((shot) => shot.startS !== null && shot.endS !== null && shot.endS < shot.startS)) throw new Error(t('End time must follow start time.', {}, input.language))
    await mkdir(input.exportsRoot, { recursive: true })
    const folder = await mkdtemp(join(input.exportsRoot, 'storyboard-'))
    path = join(folder, `storyboard.${input.kind}`)
    const tr = (key: string): string => t(key, {}, input.language)
    const fields = Object.entries(STORY_FIELDS) as [StoryField, string][]
    if (input.kind === 'csv') {
      const headers = ['#', ...fields.map(([, label]) => tr(label)), tr('Start time (s)'), tr('End time (s)'), tr('Shot duration'), tr('images'), tr('Source')]
      const rows = input.shots.map((shot, index) => [index + 1, ...fields.map(([key]) => shot[key]), shot.startS, shot.endS, shot.startS !== null && shot.endS !== null ? shot.endS - shot.startS : '', shot.images.length, shot.rendered.map((frame, i) => `${frame.mediaName} @ ${frame.timeS.toFixed(3)}s [${tr(shot.images[i]?.role ?? 'Reference')}]`).join('\n')])
      await writeFile(path, '\uFEFF' + [headers, ...rows].map((row) => row.map(csv).join(',')).join('\r\n'), 'utf-8')
      return { ok: true, path }
    }
    work = join(folder, '.render')
    await mkdir(work)
    const articles: string[] = []
    for (const [index, shot] of input.shots.entries()) {
      const pictures: string[] = []
      for (const [i, frame] of shot.rendered.entries()) {
        const png = await renderDisplayStill(frame, work, index * 10000 + i)
        pictures.push(`<figure><img src="data:image/png;base64,${(await readFile(png)).toString('base64')}"/><figcaption>${escape(tr(shot.images[i]?.role ?? 'Reference'))} · ${escape(frame.mediaName)} · ${frame.timeS.toFixed(2)}s</figcaption></figure>`)
      }
      articles.push(`<article><h2>${String(index + 1).padStart(3, '0')} / ${escape(shot.title || tr('(untitled)'))}</h2><div class="pictures">${pictures.join('')}</div><dl>${fields.filter(([key]) => shot[key]).map(([key, label]) => `<div><dt>${escape(tr(label))}</dt><dd>${escape(shot[key])}</dd></div>`).join('')}<div><dt>${escape(tr('Shot duration'))}</dt><dd>${shot.startS !== null && shot.endS !== null ? `${shot.startS.toFixed(2)}–${shot.endS.toFixed(2)}s / ${(shot.endS - shot.startS).toFixed(2)}s` : '—'}</dd></div></dl></article>`)
    }
    const html = `<!doctype html><html lang="${input.language}"><head><meta charset="UTF-8"><style>
      *{box-sizing:border-box}body{font:11pt -apple-system,'PingFang SC',sans-serif;color:#102c59;margin:0}h1{font-size:32pt;margin:8mm 0}header{border-bottom:3mm solid #102c59;padding-bottom:7mm}header p,dd{white-space:pre-wrap;overflow-wrap:anywhere}article{padding-top:8mm}h2{font-size:17pt;border-bottom:1px solid #102c59;padding-bottom:3mm;break-after:avoid}figure{margin:0 0 4mm;break-inside:avoid}img{width:100%;height:55mm;object-fit:contain;background:#f3f4f6}figcaption{font-size:8pt;margin-top:2mm;overflow-wrap:anywhere}.pictures{display:flex;flex-wrap:wrap;gap:4mm}.pictures figure{width:calc(33.33% - 4mm)}dl{margin:0}dl>div{border-top:1px solid #ccd3df;padding:3mm 0}dt{font-size:9pt;font-weight:bold;margin-bottom:2mm}dd{margin:0;line-height:1.6}body.table dl>div{display:block}body.table dt{color:#596b87}body.cards article{break-before:page}footer{font-size:8pt;margin-top:10mm;border-top:1px solid #102c59;padding:4mm 0}
    </style></head><body class="${input.layout}"><header><span>帧册 / FRAMEBOOK</span><h1>${escape(input.title)}</h1><p>${escape(input.description)}</p><span>${input.shots.length} ${escape(tr('shots'))}</span></header>${articles.join('')}<footer>Framebook · ItalyPocket / Based on Storyboard Reference Studio by Sam Wasserman</footer></body></html>`
    const htmlPath = join(folder, 'storyboard.html')
    await writeFile(htmlPath, html, 'utf-8')
    win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
    await win.loadFile(htmlPath)
    await win.webContents.executeJavaScript('Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.decode())])')
    await writeFile(path, await win.webContents.printToPDF({ landscape: input.orientation === 'landscape', pageSize: 'A4', printBackground: true, margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } }))
    return { ok: true, path }
  } catch (error) { return { ok: false, path, error: (error as Error).message } }
  finally { win?.destroy(); if (work) await rm(work, { recursive: true, force: true }).catch(() => {}) }
}
