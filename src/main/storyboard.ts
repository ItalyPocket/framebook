import { BrowserWindow } from 'electron'
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'fs/promises'
import { join } from 'path'
import type { StoryboardExportInput, FileExportResult } from '../shared/exports'
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
    const columns = input.columns
    const cellText = (shot: typeof input.shots[number], columnId: string): string => {
      const value = shot.cells[columnId]
      if (Array.isArray(value)) return value.map((item) => typeof item === 'string' ? item : '').filter(Boolean).join(', ')
      return value === null || value === undefined ? '' : String(value)
    }
    if (input.kind === 'csv') {
      const headers = columns.map((column) => tr(column.name))
      const rows = input.shots.map((shot) => columns.map((column) => column.type === 'image' ? shot.rendered.map((frame, i) => `${frame.mediaName} @ ${frame.timeS.toFixed(3)}s [${tr(shot.imageRoles[i] ?? 'Reference')}]`).join('\n') : cellText(shot, column.id)))
      await writeFile(path, '\uFEFF' + [headers, ...rows].map((row) => row.map(csv).join(',')).join('\r\n'), 'utf-8')
      return { ok: true, path }
    }
    work = join(folder, '.render')
    await mkdir(work)
    const rows: string[] = []
    for (const [index, shot] of input.shots.entries()) {
      const pictures: string[] = []
      for (const [i, frame] of shot.rendered.entries()) {
        const png = await renderDisplayStill(frame, work, index * 10000 + i)
        pictures.push(`<figure><img src="data:image/png;base64,${(await readFile(png)).toString('base64')}"/><figcaption>${escape(tr(shot.imageRoles[i] ?? 'Reference'))} · ${escape(frame.mediaName)} · ${frame.timeS.toFixed(2)}s</figcaption></figure>`)
      }
      const cells = columns.map((column) => `<td>${column.type === 'image' ? `<div class="pictures">${pictures.join('')}</div>` : escape(cellText(shot, column.id))}</td>`).join('')
      rows.push(`<tr>${cells}</tr>`)
    }
    const headers = columns.map((column) => `<th>${escape(tr(column.name))}</th>`).join('')
    const html = `<!doctype html><html lang="${input.language}"><head><meta charset="UTF-8"><style>
      *{box-sizing:border-box}body{font:10pt -apple-system,'PingFang SC',sans-serif;color:#111;margin:0}h1{font-size:24pt;margin:5mm 0}header{padding:6mm;border-bottom:2mm solid #102c59}header p{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}th{background:#080808;color:#fff;padding:4mm 2mm}td{border:1px solid #777;padding:2mm;vertical-align:middle;overflow-wrap:anywhere;white-space:pre-wrap}tr{break-inside:avoid}figure{margin:0 0 2mm;break-inside:avoid}img{width:100%;height:35mm;object-fit:contain}.pictures{display:flex;flex-direction:column;gap:2mm}figcaption{font-size:7pt}footer{font-size:8pt;margin-top:6mm;border-top:1px solid #102c59;padding:3mm}
    </style></head><body><header><span>帧册 / FRAMEBOOK</span><h1>${escape(input.title)}</h1><p>${escape(input.description)}</p><span>${input.shots.length} ${escape(tr('shots'))}</span></header><table><thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody></table><footer>Framebook · ItalyPocket / Based on Storyboard Reference Studio by Sam Wasserman</footer></body></html>`
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
