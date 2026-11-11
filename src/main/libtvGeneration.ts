import { app, ipcMain } from 'electron'
import { join, extname, relative, resolve, sep } from 'path'
import { mkdir, readFile, readdir, writeFile, stat } from 'fs/promises'
import { randomUUID } from 'crypto'
import type { ChildProcess } from 'child_process'
import { libtvCommand } from './libtvCli'
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
    const task: LibTVGenerationTask = { id: randomUUID(), projectId: input.projectId, node: `帧册-${Date.now()}-${randomUUID().slice(0, 6)}`, state: 'running' }
    const entry: { task: LibTVGenerationTask; child?: ChildProcess } = { task }
    tasks.set(task.id, entry)
    await persist()
    const args = ['node', 'create', task.node, '-p', input.projectId, '-t', input.type, '--prompt', input.prompt, '-s', `model=${input.model}`]
    for (const [key, value] of Object.entries(input.params)) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(key) || key === 'model') continue
      args.push('-s', `${key}=${value}`)
    }
    args.push('--run')
    void libtvCommand(args, child => { entry.child = child }).then(() => { if (task.state === 'running') task.state = 'done' }).catch(error => { if (task.state === 'running') { task.state = 'failed'; task.error = String(error) } }).finally(() => { delete entry.child; void persist() })
    return task
  })
  ipcMain.handle('libtv:tasks', async () => {
    if (!tasks.size) {
      const stored = await readFile(taskFile(), 'utf8').then(JSON.parse).catch(() => []) as LibTVGenerationTask[]
      if (Array.isArray(stored)) for (const task of stored) { if (task.state === 'running') task.state = 'detached'; tasks.set(task.id, { task }) }
    }
    return [...tasks.values()].map(entry => entry.task)
  })
  ipcMain.handle('libtv:detach', async (_event, id: string) => {
    const entry = tasks.get(id)
    if (!entry) return
    entry.task.state = 'detached'; entry.child?.kill('SIGTERM'); await persist()
  })
  ipcMain.handle('libtv:download', async (_event, id: string, folder: string, watermark: boolean) => {
    const entry = tasks.get(id)
    if (!entry || !['done', 'detached'].includes(entry.task.state)) throw new Error('任务尚未就绪')
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
      imported.push({ kind: ['.mp4', '.mov', '.webm'].includes(extname(name).toLowerCase()) ? 'video' as const : 'image' as const, sourceFile: relative(folder, path), name, width: info.width, height: info.height, durationS: info.durationS, fps: info.fps })
    }
    if (!imported.length) throw new Error('未下载到可导入的图片或视频，请在画布检查任务状态')
    return imported
  })
}
