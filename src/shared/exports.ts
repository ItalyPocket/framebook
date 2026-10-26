import type { Crop, ShotMeta, Annotation, StoryShot } from './types'
import type { Language } from './i18n'

export interface ExportFrameInput {
  sourcePng: string
  label: string
  notes: string
  promptText: string
  profileId: string
  crop: Crop | null
  sourceWidth: number
  sourceHeight: number
  timeS: number
  mediaName: string
  durationS?: number
  shot?: ShotMeta
  annotations?: Annotation[]
}

export interface StoryboardExportInput {
  title: string
  description: string
  exportsRoot: string
  shots: (StoryShot & { rendered: ExportFrameInput[] })[]
  language: Language
  layout: 'table' | 'cards'
  orientation: 'portrait' | 'landscape'
  kind: 'pdf' | 'csv'
}

export interface FileExportResult {
  ok: boolean
  path: string
  error?: string
}
