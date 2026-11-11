import { app, ipcMain, session } from 'electron'
import { mkdir, readFile, writeFile, stat, readdir, rm, utimes } from 'fs/promises'
import { join } from 'path'
import { createHash } from 'crypto'

const pending = new Map<string, Promise<unknown>>()
const root = (): string => join(app.getPath('userData'), 'PreviewCache')
export const cachePath = (hash: string): string => join(root(), hash)
let limit = 2 * 1024 ** 3
let pruning: Promise<void> | null = null
export async function fileKey(path: string, params: unknown): Promise<string> {
  const info = await stat(path)
  return JSON.stringify([path, info.size, info.mtimeMs, params])
}
async function files(): Promise<{ path: string; bytes: number; used: number }[]> {
  return Promise.all((await readdir(root()).catch(() => [])).filter(name => /^[a-f0-9]{64}$/.test(name)).map(async name => {
    const path = join(root(), name)
    const info = await stat(path).catch(() => null)
    return { path, bytes: info?.size ?? 0, used: info?.mtimeMs ?? 0 }
  }))
}
async function prune(): Promise<void> {
  if (pruning) return pruning
  pruning = (async () => {
    const entries = (await files()).sort((a, b) => a.used - b.used)
    let bytes = entries.reduce((sum, file) => sum + file.bytes, 0)
    for (const file of entries) { if (bytes <= limit) break; await rm(file.path, { force: true }); bytes -= file.bytes }
  })().finally(() => { pruning = null })
  return pruning
}
export async function cachedBytes(key: string, producer: () => Promise<Buffer>, ttl = Infinity): Promise<Buffer> {
  const hash = createHash('sha256').update(key).digest('hex')
  if (pending.has(hash)) return pending.get(hash) as Promise<Buffer>
  const request = (async () => {
    const path = join(root(), hash)
    const data = await readFile(path).catch(() => null)
    if (data) {
      const info = await stat(path).catch(() => null)
      if (info && Date.now() - info.birthtimeMs < ttl) { await utimes(path, new Date(), new Date()).catch(() => {}); return data }
    }
    const result = await producer()
    await mkdir(root(), { recursive: true })
    await rm(path, { force: true })
    await writeFile(path, result)
    void prune().catch(() => {})
    return result
  })().finally(() => pending.delete(hash))
  pending.set(hash, request)
  return request
}
export async function readCachedJson<T>(key: string): Promise<T | null> {
  try { return JSON.parse(await readFile(cachePath(createHash('sha256').update(key).digest('hex')), 'utf8')) as T } catch { return null }
}
export async function cachedJson<T>(key: string, producer: () => Promise<T>, ttl = Infinity): Promise<T> {
  return JSON.parse((await cachedBytes(key, async () => Buffer.from(JSON.stringify(await producer())), ttl)).toString()) as T
}
export function setupCache(): void {
  ipcMain.handle('cache:stats', async () => ({ bytes: (await files()).reduce((sum, file) => sum + file.bytes, 0), limit, path: root(), gpu: app.getGPUFeatureStatus() }))
  ipcMain.handle('cache:configure', async (_event, bytes: number) => {
    limit = Math.max(256 * 1024 ** 2, Math.min(20 * 1024 ** 3, Number(bytes) || 2 * 1024 ** 3))
    await writeFile(join(app.getPath('userData'), 'cache-settings.json'), JSON.stringify({ limit }))
    await prune()
  })
  ipcMain.handle('cache:clear', async (_event, gpu = false) => {
    await Promise.allSettled([...pending.values()])
    await rm(root(), { recursive: true, force: true })
    if (gpu) {
      await session.defaultSession.clearStorageData({ storages: ['shadercache'] })
      await writeFile(join(app.getPath('userData'), 'gpu-rebuild'), '')
    }
  })
  void readFile(join(app.getPath('userData'), 'cache-settings.json'), 'utf8').then(JSON.parse).then(value => { limit = Math.max(256 * 1024 ** 2, Number(value.limit) || limit); return prune() }).catch(() => {})
}
