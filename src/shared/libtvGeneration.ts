export interface LibTVGenerationInput {
  projectId: string
  type: 'image' | 'video'
  model: string
  prompt: string
  params: Record<string, string | number | boolean>
  nodeKey?: string
  references?: string[]
  confirmed: boolean
}
export interface LibTVGenerationTask {
  id: string
  projectId: string
  node: string
  type?: 'image' | 'video'
  state: 'running' | 'done' | 'failed' | 'detached'
  model?: string
  prompt?: string
  mediaIds?: string[]
  error?: string
}
