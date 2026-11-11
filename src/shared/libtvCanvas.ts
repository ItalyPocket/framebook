export interface LibTVNode { id: string; name: string; type: string; x: number; y: number; width?: number; height?: number; url?: string; status?: number; prompt?: string; params?: Record<string, unknown> }
export interface LibTVGraph { projectId: string; nodes: LibTVNode[]; edges: { id: string; source: string; target: string }[]; fetchedAt: number; stale?: boolean }
export interface LibTVNodeEdit { name?: string; x?: number; y?: number; prompt?: string; params?: Record<string, string | number | boolean>; references?: string[]; expectedReferences?: string[] }
export interface CacheStats { bytes: number; limit: number; path: string; gpu: Record<string, string> }
