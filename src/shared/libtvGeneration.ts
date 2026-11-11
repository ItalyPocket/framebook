export interface LibTVGenerationInput {
  projectId: string
  type: 'image' | 'video'
  model: string
  prompt: string
  params: Record<string, string | number | boolean>
  confirmed: boolean
}
export interface LibTVGenerationTask {
  id: string
  projectId: string
  node: string
  state: 'running' | 'done' | 'failed' | 'detached'
  error?: string
}
