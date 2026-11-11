export const CONVERSION_FORMATS = ['xml', 'json', 'srt', 'ass', 'stl', 'txt'] as const
export type ConversionFormat = typeof CONVERSION_FORMATS[number]
export const CONVERSION_FORMAT_LABELS: Record<ConversionFormat, string> = {
  xml: 'Editing timeline · XML', json: 'Complete timeline data · JSON', srt: 'Subtitles · SRT',
  ass: 'Subtitles · ASS', stl: 'Broadcast subtitles · EBU STL', txt: 'Subtitle text · TXT'
}
export type DraftStatus = 'readable' | 'encrypted' | 'invalid'
export interface DraftSource { path: string; name: string; status: DraftStatus }
export interface DraftEntry {
  path: string
  folder: string
  name: string
  modified: number
  status: DraftStatus
  cover?: string
  duration?: number
  fps?: number
  width?: number
  height?: number
  sources: DraftSource[]
}
export interface ConversionIssue { feature: string; level: 'approximate' | 'unverified' | 'unsupported'; clips: string[] }
export interface DraftClip {
  id: string; track: number; kind: string; materialId: string; path: string; name: string
  enabled?: boolean; muted?: boolean
  start: number; duration: number; sourceStart: number | null; sourceDuration: number | null
  width: number; height: number; fps: number; materialDuration: number; text: string
  hasAudio: boolean; volume: number; speed: number; rotation: number; x: number; y: number; scaleX: number; scaleY: number; opacity: number
}
export interface DraftTimeline {
  name: string; source: string; fps: number; width: number; height: number; duration: number
  clips: DraftClip[]; issues: ConversionIssue[]; missing: string[]; raw: unknown
}
export interface ConversionSession { id: string; timeline: DraftTimeline; timelines: DraftEntry[] }
