export const CONVERSION_FORMATS = ['xml', 'json', 'srt', 'ass', 'stl', 'txt'] as const
export type ConversionFormat = typeof CONVERSION_FORMATS[number]
export interface DraftEntry { path: string; name: string; modified: number }
export interface ConversionIssue { feature: string; level: 'approximate' | 'unverified' | 'unsupported'; clips: string[] }
export interface DraftClip {
  id: string; track: number; kind: string; materialId: string; path: string; name: string
  start: number; duration: number; sourceStart: number | null; sourceDuration: number | null
  width: number; height: number; fps: number; materialDuration: number; text: string
  hasAudio: boolean; volume: number; speed: number; rotation: number; x: number; y: number; scaleX: number; scaleY: number; opacity: number
}
export interface DraftTimeline {
  name: string; source: string; fps: number; width: number; height: number; duration: number
  clips: DraftClip[]; issues: ConversionIssue[]; missing: string[]; raw: unknown
}
export interface ConversionSession { id: string; timeline: DraftTimeline; timelines: DraftEntry[] }
