import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import { libtvCommand, libtvObjects } from './libtvCli'
import { cachedJson, readCachedJson } from './cache'
import type { LibTVGraph, LibTVNode, LibTVNodeEdit } from '../shared/libtvCanvas'

let accountScope = ''
const snapshots = new Map<string, LibTVGraph>()
export const validTarget = (value: string): string => { if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('请选择有效画布或节点'); return value }
export function nodeDetails(result: unknown): Partial<LibTVNode> {
  const objects = libtvObjects(result)
  const node = objects.find(item => item.data && typeof item.data === 'object') ?? {}
  const data = (node.data ?? {}) as Record<string, unknown>
  const params = (data.params ?? {}) as Record<string, unknown>
  const urls = libtvObjects(data.url ?? []).flatMap(item => [item.url, item.src, item.resourceUrl]).filter((url): url is string => typeof url === 'string' && /^https:\/\//.test(url))
  if (Array.isArray(data.url)) urls.push(...data.url.filter((url): url is string => typeof url === 'string' && /^https:\/\//.test(url)))
  return { url: urls[0], prompt: String(params.prompt ?? ''), params, status: Number(data.status ?? params.status ?? objects.find(item => typeof item.status === 'number')?.status) || undefined }
}
export async function readGraph(project: string): Promise<LibTVGraph> {
  const result = await libtvCommand(['project', validTarget(project)]) as { nodes?: Record<string, unknown>[]; edges?: { id: string; source: string; target: string }[] }
  const graph: LibTVGraph = { projectId: project, fetchedAt: Date.now(), nodes: (result.nodes ?? []).map((item, index) => {
    const position = item.position as { x?: number; y?: number } | undefined
    return { id: String(item.id ?? item.nodeKey), name: String(item.name ?? item.id), type: String(item.type ?? 'unknown'), x: Number(position?.x ?? index % 4 * 360), y: Number(position?.y ?? Math.floor(index / 4) * 300), width: Number(item.width) || undefined, height: Number(item.height) || undefined }
  }), edges: (result.edges ?? []).filter(edge => typeof edge.source === 'string' && typeof edge.target === 'string') }
  snapshots.set(project, graph)
  return graph
}
export function setupLibTVCanvas(): void {
  ipcMain.handle('libtv:accounts', () => libtvCommand(['account', 'list']))
  ipcMain.handle('libtv:useAccount', async (_event, id: string) => { if (!id.trim()) throw new Error('请选择账户'); const result = await libtvCommand(['account', 'use', id]); snapshots.clear(); accountScope = ''; return result })
  ipcMain.handle('libtv:graph', async (_event, project: string) => {
    try { return await readGraph(project) } catch (error) { const old = snapshots.get(project); if (old) return { ...old, stale: true }; throw error }
  })
  ipcMain.handle('libtv:nodeDetail', async (_event, project: string, node: string) => nodeDetails(await libtvCommand(['node', validTarget(node), '-p', validTarget(project)])))
  ipcMain.handle('libtv:editNode', async (_event, project: string, node: string, edit: LibTVNodeEdit) => {
    validTarget(project); validTarget(node)
    const args = ['node', node, '-p', project]
    if (edit.name !== undefined) args.push('--name', edit.name)
    if (edit.prompt !== undefined) args.push('--prompt', edit.prompt)
    for (const key of ['x', 'y'] as const) if (edit[key] !== undefined) { if (!Number.isFinite(edit[key])) throw new Error('Invalid position'); args.push(`--${key}`, String(edit[key])) }
    for (const [key, value] of Object.entries(edit.params ?? {})) { if (!/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error('Invalid parameter'); args.push('-s', `${key}=${value}`) }
    if (args.length > 4) await libtvCommand(args)
    if (edit.references) {
      const graph = await readGraph(project)
      const current = graph.edges.filter(edge => edge.target === node).map(edge => edge.source)
      if (edit.expectedReferences && [...current].sort().join() !== [...edit.expectedReferences].sort().join()) throw new Error('画布连线已在其他位置修改，请刷新后重试')
      for (const id of edit.references) { validTarget(id); if (id === node || !graph.nodes.some(item => item.id === id)) throw new Error('Invalid reference node') }
      const sorted = [...new Set(edit.references)]
      if (current.join() !== sorted.join()) {
        const retained = current.filter(id => sorted.includes(id))
        let remove = current.filter(id => !sorted.includes(id)), add: string[] = []
        if (retained.join() !== sorted.join()) {
          let prefix = 0
          while (prefix < current.length && current[prefix] === sorted[prefix]) prefix++
          remove = current.slice(prefix); add = sorted.slice(prefix)
        }
        if (remove.length) await libtvCommand(['node', node, '-p', project, ...remove.flatMap(id => ['--left-rm', id])])
        if (add.length) await libtvCommand(['node', node, '-p', project, ...add.flatMap(id => ['--left-add', id])])
      }
    }
    return readGraph(project)
  })
  ipcMain.handle('libtv:deleteNode', async (_event, project: string, node: string) => { await libtvCommand(['node', 'delete', validTarget(node), '-p', validTarget(project)]); return readGraph(project) })
  ipcMain.handle('libtv:createCanvas', async (_event, name: string, workspace?: string) => { if (!name.trim()) throw new Error('请输入画布名称'); const result = await libtvCommand(['project', 'create', name.trim(), ...(workspace ? ['-w', validTarget(workspace)] : [])]); const item = libtvObjects(result).find(item => typeof item.projectUuid === 'string' || typeof item.uuid === 'string'); if (!item) throw new Error('未返回画布标识'); return { id: String(item.projectUuid ?? item.uuid), name: name.trim() } })
  ipcMain.handle('libtv:createNode', async (_event, project: string, type: string, x: number, y: number) => {
    if (!['image', 'video'].includes(type) || !Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Invalid node')
    const result = await libtvCommand(['node', '--x', String(x), '--y', String(y), 'create', `帧册-${Date.now()}`, '-t', type, '-p', validTarget(project)])
    const node = libtvObjects(result).find(item => typeof item.nodeKey === 'string')
    return { graph: await readGraph(project), node: String(node?.nodeKey ?? '') }
  })
  ipcMain.handle('libtv:cachedRead', async (_event, kind: string, key = '', refresh = false) => {
    const commands: Record<string, string[]> = { models: ['model', 'search', '-t', key], schema: ['model', key], workspaces: ['workspace', 'list'], canvases: ['project', 'list', '-s', '50', ...(kind === 'canvases' && key ? ['-w', validTarget(key)] : [])] }
    if (!commands[kind] || (kind === 'models' && !['image', 'video'].includes(key))) throw new Error('Invalid query')
    try {
      const account = await libtvCommand(['account', 'info']) as Record<string, unknown>
      const active = account.activeAccount ?? account.user ?? {}
      accountScope = createHash('sha256').update(JSON.stringify(active)).digest('hex')
    } catch (error) { if (!accountScope) throw error }
    const cacheKey = `libtv-v3:${accountScope}:${kind}:${key}`
    const produce = async (): Promise<{ value: unknown; fetchedAt: number; stale?: boolean }> => ({ value: await libtvCommand(commands[kind]!), fetchedAt: Date.now() })
    try { return await cachedJson(cacheKey, produce, refresh ? 0 : ['schema', 'models'].includes(kind) ? 86400000 : 60000) } catch (error) {
      const old = await readCachedJson<{ value: unknown; fetchedAt: number }>(cacheKey)
      if (old) return { ...old, stale: true }
      throw error
    }
  })
}
