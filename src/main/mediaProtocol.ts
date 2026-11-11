import { ipcMain, protocol } from 'electron'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { extname } from 'path'
import { randomUUID } from 'crypto'
import { Readable } from 'stream'

protocol.registerSchemesAsPrivileged([{ scheme: 'framebook-media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
const handles = new Map<string, { path: string; folder: string }>()
export function publishMedia(path: string, folder: string): string {
  const existing = [...handles].find(([, item]) => item.path === path && item.folder === folder)
  const id = existing?.[0] ?? randomUUID()
  handles.set(id, { path, folder })
  return `framebook-media://asset/${id}`
}
export function setupMediaProtocol(resolvePath: (folder: string, path: string) => Promise<string>): void {
  ipcMain.handle('media:url', async (_event, folder: string, source: string) => {
    const path = await resolvePath(folder, source)
    const info = await stat(path)
    return `${publishMedia(path, folder)}?v=${info.size}-${info.mtimeMs}`
  })
  ipcMain.handle('media:release', (_event, folder: string) => { for (const [id, value] of handles) if (value.folder === folder) handles.delete(id) })
  protocol.handle('framebook-media', async request => {
    const item = handles.get(new URL(request.url).pathname.slice(1))
    if (!item) return new Response(null, { status: 404 })
    try {
      const info = await stat(item.path)
      const mime: Record<string, string> = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' }
      const headers: Record<string, string> = { 'Content-Type': mime[extname(item.path).toLowerCase()] ?? (item.path.includes('PreviewCache') ? 'image/png' : 'application/octet-stream'), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' }
      let start = 0, end = info.size - 1
      const range = request.headers.get('Range')
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range)
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
        if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(end, Number(match[2])) : end }
        else start = Math.max(0, info.size - Number(match[2]))
        if (start > end || start < 0 || start >= info.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${info.size}` } })
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`
      }
      headers['Content-Length'] = String(end - start + 1)
      if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers })
      const stream = createReadStream(item.path, { start, end })
      return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers })
    } catch { return new Response(null, { status: 404 }) }
  })
}
