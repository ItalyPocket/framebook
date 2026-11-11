export interface LibTVTarget { projectId: string; name: string }
export interface LibTVFile { id: string; name: string; path: string; bytes?: number; nodeKey?: string; x?: number; y?: number }
export interface LibTVJob { id: string; state: 'running' | 'done' | 'cancelled'; items: { id: string; name: string; state: 'pending' | 'uploading' | 'uploaded' | 'failed'; url?: string; nodeKey?: string; x?: number; y?: number; error?: string }[] }
