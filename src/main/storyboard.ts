import { paginateStoryboard } from './pagination'
import { BrowserWindow } from 'electron'
import { mkdir, mkdtemp, readFile, writeFile, copyFile, rm } from 'fs/promises'
import { join } from 'path'
import type { StoryboardExportInput, FileExportResult } from '../shared/exports'
import { t } from '../shared/i18n'
import { renderDisplayStill, type ExportInput } from './export'
import { resolveFfmpeg, run } from './ffmpeg'

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const csv = (value: unknown): string => `"${String(value ?? '').replace(/"/g, '""')}"`

export async function exportNumbered(
  input: ExportInput,
  format: 'png' | 'jpg'
): Promise<FileExportResult> {
  let path = ''
  try {
    if (!input.frames.length || !['png', 'jpg'].includes(format))
      throw new Error('Invalid export request')
    await mkdir(input.exportsRoot, { recursive: true })
    path = await mkdtemp(join(input.exportsRoot, 'frames-'))
    const work = join(path, '.render')
    const manifest = []
    for (const [index, frame] of input.frames.entries()) {
      const name = `${String(index + 1).padStart(3, '0')}.${format}`
      const source = await renderDisplayStill(frame, work, index)
      if (format === 'png') await copyFile(source, join(path, name))
      else {
        const result = await run(await resolveFfmpeg(), [
          '-y',
          '-i',
          source,
          '-q:v',
          '2',
          join(path, name)
        ])
        if (result.code !== 0) throw new Error(result.stderr.slice(-400))
      }
      manifest.push({ file: name, label: frame.label, source: frame.mediaName, timeS: frame.timeS })
    }
    await writeFile(join(path, 'frames.json'), JSON.stringify(manifest, null, 2))
    await rm(work, { recursive: true, force: true })
    return { ok: true, path }
  } catch (error) {
    return { ok: false, path, error: (error as Error).message }
  }
}

export async function exportStoryboard(input: StoryboardExportInput): Promise<FileExportResult> {
  let path = ''
  let work = ''
  let win: BrowserWindow | null = null
  try {
    if (!input.shots.length) throw new Error('No shots to export')
    if (
      input.shots.some(
        (shot) => shot.startS !== null && shot.endS !== null && shot.endS < shot.startS
      )
    )
      throw new Error(t('End time must follow start time.', {}, input.language))
    await mkdir(input.exportsRoot, { recursive: true })
    const folder = await mkdtemp(join(input.exportsRoot, 'storyboard-'))
    const name =
      Array.from((input.projectName ?? input.title).trim())
        .filter((char) => char.charCodeAt(0) >= 32)
        .join('')
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/[. ]+$/, '')
        .slice(0, 100) || 'Untitled'
    path = join(
      folder,
      input.kind === 'pdf'
        ? `${name}${input.documentLabel ?? '分镜本'}.pdf`
        : `${name}${input.documentLabel ?? '分镜本'}.csv`
    )
    const tr = (key: string): string => t(key, {}, input.language)
    const columns = input.columns
    const cellText = (shot: (typeof input.shots)[number], columnId: string): string => {
      const value = shot.cells[columnId]
      if (columnId === 'shotNo' && (value === '' || value === null || value === undefined))
        return String(input.shots.indexOf(shot) + 1)
      if (Array.isArray(value))
        return value
          .map((item) => (typeof item === 'string' ? item : ''))
          .filter(Boolean)
          .join(', ')
      return value === null || value === undefined ? '' : String(value)
    }
    const framesFor = (shot: (typeof input.shots)[number], columnId: string) =>
      shot.renderedByColumn ? (shot.renderedByColumn[columnId] ?? []) : shot.rendered
    const rolesFor = (shot: (typeof input.shots)[number], columnId: string) =>
      shot.rolesByColumn ? (shot.rolesByColumn[columnId] ?? []) : shot.imageRoles
    if (input.kind === 'csv') {
      const headers = [
        ...(input.shots.some((s) => s.groupTitle) ? [tr('Group')] : []),
        ...columns.map((column) => tr(column.name))
      ]
      const rows = input.shots.map((shot) => [
        ...(input.shots.some((s) => s.groupTitle) ? [shot.groupTitle ?? ''] : []),
        ...columns.map((column) =>
          column.type === 'image'
            ? framesFor(shot, column.id)
                .map(
                  (frame, i) =>
                    `${frame.mediaName} @ ${frame.timeS.toFixed(3)}s [${tr(rolesFor(shot, column.id)[i] ?? 'Reference')}]`
                )
                .join('\n')
            : cellText(shot, column.id)
        )
      ])
      await writeFile(
        path,
        '\uFEFF' + [headers, ...rows].map((row) => row.map(csv).join(',')).join('\r\n'),
        'utf-8'
      )
      return { ok: true, path }
    }
    work = join(folder, '.render')
    await mkdir(work)
    const rows: string[] = []
    let lastGroup = ''
    for (const [index, shot] of input.shots.entries()) {
      if (shot.groupTitle && shot.groupTitle !== lastGroup) {
        rows.push(
          `<tr class="group-heading"><td colspan="${columns.length}">${escape(shot.groupTitle)}</td></tr>`
        )
        lastGroup = shot.groupTitle
      }
      const cells: string[] = []
      let pictureIndex = 0
      for (const column of columns) {
        const pictures: string[] = []
        if (column.type === 'image')
          for (const [i, frame] of framesFor(shot, column.id).entries()) {
            const png = await renderDisplayStill(frame, work, index * 10000 + pictureIndex++)
            pictures.push(
              `<figure><img src="data:image/png;base64,${(await readFile(png)).toString('base64')}"/><figcaption>${escape(tr(rolesFor(shot, column.id)[i] ?? 'Reference'))} · ${escape(frame.mediaName)} · ${frame.timeS.toFixed(2)}s</figcaption></figure>`
            )
          }
        cells.push(
          `<td>${column.type === 'image' ? `<div class="pictures">${pictures.join('')}</div>` : escape(cellText(shot, column.id))}</td>`
        )
      }
      rows.push(`<tr>${cells.join('')}</tr>`)
    }
    const headers = columns.map((column) => `<th>${escape(tr(column.name))}</th>`).join('')
    const widths = columns
      .map(
        (column) =>
          `<col style="width:${(column.width / columns.reduce((sum, item) => sum + item.width, 0)) * 100}%"/>`
      )
      .join('')
    const html = `<!doctype html><html lang="${input.language}"><head><meta charset="UTF-8"><style>
      *{box-sizing:border-box}body{width:${input.orientation === 'landscape' ? 276 : 189}mm;font:9pt -apple-system,'PingFang SC',sans-serif;line-height:1.4;color:#101113;margin:0}h1{font-size:18pt;margin:2mm 0}header{padding:0 0 3mm;border-bottom:1px solid #1737d1;margin-bottom:3mm}header p{white-space:pre-wrap;overflow-wrap:anywhere;margin:1mm 0;}header>span{font-size:8pt}table{border-collapse:collapse;width:100%;table-layout:fixed}thead{display:table-header-group}th{background:#ecefeb;color:#101113;padding:2mm 1mm;border:1px solid #a8aaa7;font-size:8pt;overflow-wrap:anywhere}td{border:1px solid #a8aaa7;padding:2mm;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}tr{break-inside:avoid}.group-heading td{background:#1737d1;color:white;font-weight:600;padding:2mm}figure{margin:0 0 2mm;break-inside:avoid}img{width:100%;height:32mm;object-fit:contain}.pictures{display:flex;flex-direction:column;gap:2mm}figcaption{font-size:6pt;white-space:normal;overflow-wrap:anywhere}.print-page{break-after:page}.print-page:last-child{break-after:auto}.continued-row td{border-top-style:dashed}.continued-row td:first-child:before{content:"↳ ";color:#1737d1}footer{font-size:8pt;margin-top:3mm}

    </style></head><body><header><span>帧册 / FRAMEBOOK</span><h1>${escape(input.title)}</h1><p>${escape(input.description)}</p><span>${input.shots.length} ${escape(tr('shots'))}</span></header><table><colgroup>${widths}</colgroup><thead><tr>${headers}</tr></thead><tbody>${rows.join('')}</tbody></table><footer>Framebook</footer></body></html>`
    const htmlPath = join(folder, 'storyboard.html')
    await writeFile(htmlPath, html, 'utf-8')
    win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    })
    await win.loadFile(htmlPath)
    await win.webContents.executeJavaScript(
      'Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.decode())])'
    )
    await win.webContents.executeJavaScript(
      `(${paginateStoryboard.toString()})(${((input.orientation === 'landscape' ? 187 : 274) * 96) / 25.4})`
    )
    await writeFile(
      path,
      await win.webContents.printToPDF({
        landscape: input.orientation === 'landscape',
        pageSize: 'A4',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate:
          '<div style="font-size:8px;width:100%;text-align:center;color:#555">Framebook · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
        margins: { top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 }
      })
    )
    return { ok: true, path }
  } catch (error) {
    return { ok: false, path, error: (error as Error).message }
  } finally {
    win?.destroy()
    if (work) await rm(work, { recursive: true, force: true }).catch(() => {})
  }
}
