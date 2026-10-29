export interface LibTVTarget { projectId: string; name: string }
export interface LibTVFile { id: string; name: string; path: string; bytes?: number }
export interface LibTVJob { id: string; state: 'running' | 'done' | 'cancelled'; items: { id: string; name: string; state: 'pending' | 'uploading' | 'uploaded' | 'failed'; url?: string; error?: string }[] }
