import { app, ipcMain } from 'electron'
import { join, extname, relative, resolve, sep } from 'path'
import { mkdir, readFile, readdir, writeFile, stat } from 'fs/promises'
import { randomUUID } from 'crypto'
import type { ChildProcess } from 'child_process'
import { validTarget, nodeDetails } from './libtvCanvas'
import { projectData } from './projectStorage'
import type { Project } from '../shared/types'
import { libtvCommand, libtvObjects } from './libtvCli'
import type { LibTVGenerationInput, LibTVGenerationTask } from '../shared/libtvGeneration'
import { probeMedia } from './ffmpeg'

const tasks = new Map<string, { task: LibTVGenerationTask; child?: ChildProcess }>()
const taskFile = (): string => join(app.getPath('userData'), 'libtv-tasks.json')
let writes: Promise<unknown> = Promise.resolve()
function persist(): Promise<unknown> {
  const data = JSON.stringify([...tasks.values()].map(entry => entry.task), null, 2)
  writes = writes.catch(() => {}).then(() => writeFile(taskFile(), data, { mode: 0o600 }))
  return writes
}
export function setupLibTVGeneration(): void {
  ipcMain.handle('libtv:generate', async (_event, input: LibTVGenerationInput) => {
    if (!input.confirmed || !input.prompt.trim() || !input.model || !/^[a-zA-Z0-9_-]+$/.test(input.projectId) || !['image', 'video'].includes(input.type)) throw new Error('请先确认生成内容及账户额度使用')
    await libtvCommand(['account', 'info'])
    const definition = await libtvCommand(['model', input.model]) as { schema?: { properties?: Record<string, unknown> } }
    const mode = definition.schema?.properties?.modeType as { items?: Record<string, number[]> } | undefined
    const limits = mode?.items?.[String(input.params.modeType ?? '')]
    if (limits && ((input.references?.length ?? 0) < (limits[0] ?? 0) || (input.references?.length ?? 0) > (limits[1] ?? Infinity))) throw new Error('参考素材数量与所选生成模式不匹配')
    if (input.nodeKey) validTarget(input.nodeKey)
    for (const reference of input.references ?? []) validTarget(reference)
    let node = input.nodeKey
    if (node) {
      const detail = nodeDetails(await libtvCommand(['node', node, '-p', input.projectId]))
      if (detail.status === 1) throw new Error('此节点仍在云端运行，请先恢复任务状态，避免重复提交')
    } else {
      const created = await libtvCommand(['node', 'create', `帧册-${Date.now()}-${randomUUID().slice(0, 6)}`, '-p', input.projectId, '-t', input.type])
      const value = libtvObjects(created).find(item => typeof item.nodeKey === 'string')
      if (!value) throw new Error('未返回生成节点标识，未提交生成任务')
      node = validTarget(String(value.nodeKey))
    }
    const task: LibTVGenerationTask = { id: randomUUID(), projectId: input.projectId, node, type: input.type, model: input.model, prompt: input.prompt, state: 'running' }
    const entry: { task: LibTVGenerationTask; child?: ChildProcess } = { task }
    tasks.set(task.id, entry)
    await persist()
    const args = ['node', task.node, '-p', input.projectId, '--prompt', input.prompt, '-s', `model=${input.model}`]
    for (const reference of input.references ?? []) args.push('--left-add', reference)
    for (const [key, value] of Object.entries(input.params)) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(key) || key === 'model') continue
      args.push('-s', `${key}=${value}`)
    }
    args.push('--run')
    void libtvCommand(args, child => { entry.child = child }).then(() => { if (task.state === 'running' || task.state === 'detached') task.state = 'done' }).catch(error => { if (task.state === 'running' || task.state === 'detached') { task.state = 'failed'; task.error = String(error) } }).finally(() => { delete entry.child; void persist() })
    return task
  })
  ipcMain.handle('libtv:tasks', async () => {
    if (!tasks.size) {
      const stored = await readFile(taskFile(), 'utf8').then(JSON.parse).catch(() => []) as LibTVGenerationTask[]
      if (Array.isArray(stored)) for (const task of stored) { if (task.state === 'running') task.state = 'detached'; tasks.set(task.id, { task }) }
    }
    return [...tasks.values()].map(entry => entry.task)
  })
  ipcMain.handle('libtv:recoverTasks', async (_event, project: string) => {
    for (const { task } of tasks.values()) {
      if (task.projectId !== project || !['detached', 'failed'].includes(task.state)) continue
      try { const detail = nodeDetails(await libtvCommand(['node', task.node, '-p', validTarget(project)])); if (detail.url || detail.status === 2) { task.state = 'done'; delete task.error } else if (detail.status === 3 || detail.status === 4) task.state = 'failed' } catch (error) { task.error = String(error) }
    }
    await persist(); return [...tasks.values()].map(entry => entry.task)
  })
  ipcMain.handle('libtv:trackNode', async (_event, project: string, node: string) => {
    validTarget(project); validTarget(node)
    const existing = [...tasks.values()].find(entry => entry.task.projectId === project && entry.task.node === node)
    if (existing) return existing.task
    const task: LibTVGenerationTask = { id: randomUUID(), projectId: project, node, state: 'detached' }; tasks.set(task.id, { task }); await persist(); return task
  })
  ipcMain.handle('libtv:detach', async (_event, id: string) => {
    const entry = tasks.get(id)
    if (!entry) return
    entry.task.state = 'detached'; await persist()
  })
  ipcMain.handle('libtv:download', async (_event, id: string, folder: string, watermark: boolean) => {
    const entry = tasks.get(id)
    if (!entry || !['done', 'detached'].includes(entry.task.state)) throw new Error('任务尚未就绪')
    const project = JSON.parse(await projectData(folder)) as Project
    const existing = project.media.filter(media => media.libtvSource?.projectId === entry.task.projectId && media.libtvSource.node === entry.task.node)
    if (existing.length) return []
    const directory = join(folder, 'media', `libtv-${entry.task.id}`)
    await mkdir(directory, { recursive: true })
    await libtvCommand(['download', '-p', entry.task.projectId, '-n', entry.task.node, '-o', directory, '--watermark', String(watermark)])
    const files = await readdir(directory)
    const imported = []
    for (const name of files) {
      const path = join(directory, name)
      const safe = relative(resolve(directory), resolve(path))
      if (safe.startsWith(`..${sep}`) || !(await stat(path)).isFile() || !/\.(png|jpe?g|webp|gif|mp4|mov|webm)$/i.test(name)) continue
      const info = await probeMedia(path)
      imported.push({ libtvSource: { projectId: entry.task.projectId, node: entry.task.node, taskId: entry.task.id }, kind: ['.mp4', '.mov', '.webm'].includes(extname(name).toLowerCase()) ? 'video' as const : 'image' as const, sourceFile: relative(folder, path), name, width: info.width, height: info.height, durationS: info.durationS, fps: info.fps })
    }
    if (!imported.length) throw new Error('未下载到可导入的图片或视频，请在画布检查任务状态')
    return imported
  })
}
