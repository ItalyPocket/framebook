export interface ClipExportOptions {
  format: 'mp4' | 'mov'
  resolution: 'native' | '2160' | '1080' | '720'
  muted: boolean
}
export interface ClipExportJob {
  id: string
  state: 'running' | 'done' | 'cancelled'
  items: { id: string; name: string; state: 'pending' | 'encoding' | 'ready' | 'failed'; progress: number; error?: string }[]
}
