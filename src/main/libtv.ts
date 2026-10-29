import { renderDisplayStill } from './export'
import type { ExportFrameInput } from '../shared/exports'
import { app, ipcMain, safeStorage } from 'electron'
import { readFile, writeFile, mkdir, stat } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { LibTVFile, LibTVJob } from '../shared/libtv'

const jobs = new Map<string, { job: LibTVJob; abort: AbortController }>()
async function keys(): Promise<Record<string,string>> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('System encrypted storage is unavailable.')
  const stored=await readFile(join(app.getPath('userData'),'libtv.key')).catch(() => null)
  if(!stored) return {}
  const value=safeStorage.decryptString(stored)
  try { return JSON.parse(value) as Record<string,string> } catch { return {} }
}
async function key(projectId?: string): Promise<string> {
  const saved=await keys()
  const secret=projectId ? saved[projectId] : Object.values(saved)[0]
  if(!secret) throw new Error('Connect the target LibTV project first.')
  return secret
}
async function session(secret: string): Promise<string> {
  const response = await fetch('https://im.liblib.tv/openapi/session', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`LibTV HTTP ${response.status}`)
  const result = await response.json() as { data?: { projectUuid?: string } }
  if (!result.data?.projectUuid) throw new Error('LibTV did not return a project.')
  return result.data.projectUuid
}
export function setupLibTV(resolvePath: (folder: string, path: string) => Promise<string>): void {
  ipcMain.handle('libtv:render', async (_e, folder: string, input: ExportFrameInput, index: number) => {
    if ([...jobs.values()].some((task) => task.job.state === 'running')) throw new Error('An upload is already running.')
    const sourcePng = await resolvePath(folder, input.sourcePng)
    return renderDisplayStill({...input,sourcePng},join(folder,'.frames','libtv'),index)
  })
  ipcMain.handle('libtv:configure', async (_e, secret: string) => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('System encrypted storage is unavailable.')
    if (!secret.trim()) throw new Error('Access key is required.')
    const projectId = await session(secret.trim())
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(join(app.getPath('userData'), 'libtv.key'), safeStorage.encryptString(JSON.stringify({...await keys(),[projectId]:secret.trim()})), { mode: 0o600 })
    return { projectId }
  })
  ipcMain.handle('libtv:targets', async () => Object.keys(await keys()))
  ipcMain.handle('libtv:verify', async (_e, projectId?: string) => ({ projectId: await session(await key(projectId)) }))
  ipcMain.handle('libtv:cancel', (_e, id: string) => { const task = jobs.get(id); if(task) { task.job.state = 'cancelled'; task.abort.abort() } })
  ipcMain.handle('libtv:status', (_e, id: string) => jobs.get(id)?.job ?? null)
  ipcMain.handle('libtv:inspect', async (_e, folder: string, files: LibTVFile[]) => Promise.all(files.map(async (file) => ({ ...file, bytes: (await stat(await resolvePath(folder, file.path))).size }))))
  ipcMain.handle('libtv:upload', async (_e, folder: string, projectId: string, files: LibTVFile[]) => {
    if ([...jobs.values()].some((task) => task.job.state === 'running')) throw new Error('An upload is already running.')
    if (!files.length || files.length > 500) throw new Error('Invalid upload selection.')
    const secret = await key(projectId)
    if (await session(secret) !== projectId) throw new Error('The access key belongs to a different LibTV project. Reconnect using that project’s key.')
    const resolved = await Promise.all(files.map(async (file) => {
      const path = await resolvePath(folder, file.path)
      const info = await stat(path)
      if (!info.isFile() || info.size >= 200000000) throw new Error('Each file must be smaller than 200 MB.')
      const ext = path.split('.').pop()?.toLowerCase() ?? ''
      const mime = ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',heif:'image/heif',heic:'image/heic',gif:'image/gif',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'} as Record<string,string>)[ext]
      if (!mime) throw new Error('Unsupported upload format.')
      return { ...file, path, mime }
    }))
    for (const [id, task] of jobs) if(task.job.state !== 'running') jobs.delete(id)
    const job: LibTVJob = { id: randomUUID(), state:'running',items:files.map((file) => ({ id:file.id,name:file.name,state:'pending' })) }
    const abort = new AbortController()
    jobs.set(job.id, {job,abort})
    void (async () => {
      for (const [index,file] of resolved.entries()) {
        if(abort.signal.aborted) break
        const item = job.items[index]!
        item.state = 'uploading'
        try {
          if(await session(secret) !== projectId) throw new Error('LibTV target project changed. Reconnect before retrying.')
          const form = new FormData()
          form.append('accessKey',secret)
          form.append('file',new Blob([new Uint8Array(await readFile(file.path))], {type:file.mime}),file.name)
          const response = await fetch('https://im.liblib.tv/openapi/upload',{method:'POST',headers:{Authorization:`Bearer ${secret}`},body:form,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(120000)])})
          if(!response.ok) throw new Error(`LibTV HTTP ${response.status}`)
          const result = await response.json() as {data?:{url?:string}}
          const url = result.data?.url
          if(!url || !url.startsWith('https://libtv-res.liblib.art/') || !url.includes(`/${projectId}/`)) throw new Error('Could not verify uploaded resource project.')
          item.url = url; item.state = 'uploaded'
        } catch(error) { item.state = 'failed'; item.error = abort.signal.aborted ? 'Cancelled' : error instanceof Error ? error.message : 'Upload failed' }
      }
      if(job.state !== 'cancelled') job.state = 'done'
    })()
    return job.id
  })
}
