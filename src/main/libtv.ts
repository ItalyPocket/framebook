import { clipUpload } from './clips'
import { projectData } from './projectStorage'
import type { Project } from '../shared/types'
import { renderDisplayStill } from './export'
import type { ExportFrameInput } from '../shared/exports'
import { ipcMain } from 'electron'
import { stat } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { ChildProcess } from 'child_process'
import type { LibTVFile, LibTVJob } from '../shared/libtv'
import { libtvCommand, libtvObjects } from './libtvCli'

const jobs = new Map<string, { job: LibTVJob; child?: ChildProcess }>()
let login: { state: 'waiting' | 'done' | 'failed'; error?: string } | null = null
export function setupLibTV(resolvePath: (folder: string, path: string) => Promise<string>): void {
  ipcMain.handle('libtv:login', () => {
    if (login?.state === 'waiting') return login
    login = { state: 'waiting' }
    void libtvCommand(['login', 'web', '--open']).then(() => { login = { state: 'done' } }).catch(error => { login = { state: 'failed', error: String(error) } })
    return login
  })
  ipcMain.handle('libtv:loginStatus', () => login)
  ipcMain.handle('libtv:account', () => libtvCommand(['account', 'info']))
  ipcMain.handle('libtv:workspaces', () => libtvCommand(['workspace', 'list']))
  ipcMain.handle('libtv:canvases', async (_event, workspace?: string, page = 1) => {
    const result = await libtvCommand(['project', 'list', '-s', '50', '-p', String(Math.max(1, Math.floor(page))), ...(workspace ? ['-w', workspace] : [])])
    return libtvObjects(result).filter(item => typeof item.uuid === 'string' || typeof item.projectUuid === 'string').map(item => ({ id: String(item.uuid ?? item.projectUuid), name: String(item.name ?? item.title ?? item.projectName ?? item.uuid ?? item.projectUuid) }))
  })
  ipcMain.handle('libtv:models', (_event, type: string) => {
    if (!['image', 'video'].includes(type)) throw new Error('Invalid model type')
    return libtvCommand(['model', 'search', '-t', type])
  })
  ipcMain.handle('libtv:schema', (_event, model: string) => libtvCommand(['model', model]))
  ipcMain.handle('libtv:render', async (_event, folder: string, input: ExportFrameInput, index: number) => renderDisplayStill({ ...input, sourcePng: await resolvePath(folder, input.sourcePng) }, join(folder, '.frames', 'libtv'), index))
  ipcMain.handle('libtv:configure', () => { throw new Error('请使用浏览器登录，不再需要 Key') })
  ipcMain.handle('libtv:targets', async () => libtvObjects(await libtvCommand(['project', 'list', '-s', '100'])).map(item => item.uuid ?? item.projectUuid).filter((id): id is string => typeof id === 'string'))
  ipcMain.handle('libtv:verify', async (_event, projectId?: string) => {
    if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error('请选择目标画布')
    await libtvCommand(['project', projectId])
    return { projectId }
  })
  ipcMain.handle('libtv:cancel', (_event, id: string) => {
    const task = jobs.get(id)
    if (task) { task.job.state = 'cancelled'; task.child?.kill('SIGTERM') }
  })
  ipcMain.handle('libtv:status', (_event, id: string) => jobs.get(id)?.job ?? null)
  ipcMain.handle('libtv:inspect', async (_event, folder: string, files: LibTVFile[]) => Promise.all(files.map(async file => ({ ...file, bytes: (await stat(await resolvePath(folder, file.path))).size }))))
  ipcMain.handle('libtv:upload', async (_event, folder: string, projectId: string, files: LibTVFile[]) => {
    if (!files.length || files.length > 500 || !/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error('Invalid upload selection')
    const sources = await Promise.all(files.map(file => resolvePath(folder, file.path)))
    const job: LibTVJob = { id: randomUUID(), state: 'running', items: files.map(file => ({ id: file.id, name: file.name, state: 'pending' })) }
    const task: { job: LibTVJob; child?: ChildProcess } = { job }
    jobs.set(job.id, task)
    void (async () => {
      for (const [index, file] of files.entries()) {
        if (job.state === 'cancelled') break
        const item = job.items[index]!
        item.state = 'uploading'
        try {
          const project = JSON.parse(await projectData(folder)) as Project
          const clip = project.media.find(media => media.id === file.id)?.clip
          const rendered = clip ? await clipUpload(folder, file.id, resolvePath) : null
          if (jobs.get(job.id)?.job.state === 'cancelled') { await rendered?.release(); break }
          let result: unknown
          try { result = await libtvCommand(['upload', file.name, '-p', projectId, '-f', rendered?.path ?? sources[index]!, '--x', String((index % 4) * 480), '--y', String(Math.floor(index / 4) * 360)], child => { task.child = child }) } finally { await rendered?.release() }
          const node = libtvObjects(result).find(object => typeof object.nodeKey === 'string')
          if (!node) throw new Error('LibTV 未返回画布节点标识')
          const verified = await libtvCommand(['node', String(node.nodeKey), '-p', projectId])
          if (!libtvObjects(verified).some(object => object.nodeKey === node.nodeKey || object.id === node.nodeKey)) throw new Error('无法确认目标画布中的资源节点，请先在画布检查，避免重复上传')
          item.url = `https://www.liblib.tv/canvas?projectId=${encodeURIComponent(projectId)}`
          item.state = 'uploaded'
        } catch (error) { item.state = 'failed'; item.error = String(error) }
      }
      delete task.child
      if (job.state !== 'cancelled') job.state = 'done'
    })()
    return job.id
  })
}
