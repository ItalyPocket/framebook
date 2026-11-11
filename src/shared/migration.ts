export interface MigrationFile { path: string; source: string; bytes: number; missing: boolean }
export interface MigrationScan { id: string; folder: string; name: string; version: number; supported: boolean; duplicate: boolean; existing?: { name: string; version: number; media: number; shots: number; modified: number }; files: MigrationFile[]; bytes: number; issues: string[] }
export interface MigrationOptions { mode: 'copy' | 'move' | 'upgrade' | 'package'; destination: string; collectExternal: boolean; includeExports: boolean; allowMissing: boolean; collision: 'copy' | 'update' }
export interface MigrationJob { id: string; state: 'running' | 'done' | 'failed' | 'cancelled'; completed: number; total: number; folder?: string; error?: string; report?: string; issues: string[] }
