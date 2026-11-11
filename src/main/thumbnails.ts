import { mediaWork } from './mediaQueue'
import { app, ipcMain } from 'electron'
import { mkdtemp, readFile, rm } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'
import { cachedBytes, fileKey, cachePath } from './cache'
import { resolveFfmpeg, run } from './ffmpeg'
import { publishMedia } from './mediaProtocol'

async function thumbnail(path: string, time: number): Promise<Buffer> {
  const directory = await mkdtemp(join(app.getPath('temp'), 'framebook-thumb-'))
  try {
    const output = join(directory, 'thumb.png')
    const result = await run(await resolveFfmpeg(), ['-y', '-ss', String(Math.max(0, time)), '-i', path, '-frames:v', '1', '-vf', "scale=720:720:force_original_aspect_ratio=decrease", output])
    if (result.code !== 0) throw new Error('Could not create thumbnail')
    return await readFile(output)
  } finally { await rm(directory, { recursive: true, force: true }) }
}
export function setupThumbnails(resolvePath: (folder: string, path: string) => Promise<string>): void {
  ipcMain.handle('media:thumbnail', async (_event, folder: string, source: string, time = 0) => {
    if (!Number.isFinite(time) || time < 0) throw new Error('Invalid thumbnail time')
    const path = await resolvePath(folder, source)
    const key = await fileKey(path, ['thumb-v1', time, 720])
    await cachedBytes(key, () => mediaWork(() => thumbnail(path, time)))
    return publishMedia(cachePath(createHash('sha256').update(key).digest('hex')), folder)
  })
  ipcMain.handle('cache:composite', async (_event, folder: string, source: string, signature: string, encoded?: string) => {
    const path = await resolvePath(folder, source)
    const key = await fileKey(path, ['annotation-v1', signature])
    if (!encoded) { const data = await readFile(cachePath(createHash('sha256').update(key).digest('hex'))).catch(() => null); return data ? new Uint8Array(data) : null }
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length > 100 * 1024 ** 2) throw new Error('Composite too large')
    await cachedBytes(key, async () => bytes)
    return null
  })
}
