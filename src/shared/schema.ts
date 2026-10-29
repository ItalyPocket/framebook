import { parseProduction } from './production'
/**
 * Document factories and (de)serialization. Pure — shared by main + renderer.
 * parseProject never throws on malformed input; it returns { doc, issues }.
 */

import type { Project, MediaItem, Frame, MediaKind, Crop, ShotMeta, Annotation, StoryShot, StoryColumn, StoryColumnType, StoryCell } from './types'
import { PROJECT_VERSION, DEFAULT_FRAME_DURATION_S, emptyShotMeta, STORY_FIELDS } from './types'
import { DEFAULT_PROFILE_ID } from './profiles'

/** Short, collision-resistant id (no external deps). */
export function newId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8)
  const time = Date.now().toString(36).slice(-6)
  return `${prefix}_${time}${rand}`
}

export function createProject(name: string): Project {
  return {
    version: PROJECT_VERSION,
    id: newId('proj'),
    name,
    media: [],
    production: { groups: [], columns: [], takes: [] },
    mediaFolders: [],
    frames: [],
    storyboard: { title: name, description: '', columns: defaultStoryColumns(), shots: [] },
    settings: { gallerySort: 'time', defaultProfileId: DEFAULT_PROFILE_ID, audioFile: null }
  }
}

export function createMediaItem(
  fields: Omit<MediaItem, 'id'> & { id?: string }
): MediaItem {
  return {
    id: fields.id ?? newId('media'),
    kind: fields.kind,
    sourceFile: fields.sourceFile,
    workingFile: fields.workingFile,
    externalPath: fields.externalPath,
    folderId: fields.folderId,
    name: fields.name,
    durationS: fields.durationS,
    width: fields.width,
    height: fields.height,
    fps: fields.fps
  }
}

export function createFrame(
  mediaId: string,
  timeS: number,
  order: number,
  label = ''
): Frame {
  return {
    id: newId('frame'),
    mediaId,
    timeS,
    label,
    notes: '',
    order,
    crop: null,
    prompt: null,
    durationS: DEFAULT_FRAME_DURATION_S,
    shot: emptyShotMeta(),
    annotations: []
  }
}

export function fullCrop(aspect: Crop['aspect'] = null): Crop {
  return { aspect, x: 0, y: 0, w: 1, h: 1 }
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project, null, 2)
}

export interface ParseIssue {
  message: string
}

export interface ParseOutcome {
  doc: Project | null
  issues: ParseIssue[]
}

/** Best-effort validate + migrate. Never breaks on an existing file. */
export function parseProject(json: string): ParseOutcome {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    return { doc: null, issues: [{ message: `invalid JSON: ${(e as Error).message}` }] }
  }
  if (typeof raw !== 'object' || raw === null) {
    return { doc: null, issues: [{ message: 'project is not an object' }] }
  }
  const o = raw as Record<string, unknown>
  const issues: ParseIssue[] = []

  const media: MediaItem[] = Array.isArray(o.media)
    ? (o.media as unknown[]).map((m) => sanitizeMedia(m, issues)).filter(Boolean as unknown as (x: MediaItem | null) => x is MediaItem)
    : []
  const frames: Frame[] = Array.isArray(o.frames)
    ? (o.frames as unknown[]).map((f) => sanitizeFrame(f, issues)).filter(Boolean as unknown as (x: Frame | null) => x is Frame)
    : []

  const settings = (o.settings as Record<string, unknown>) ?? {}
  // Migrate any older/newer document to the current version; sanitizeFrame +
  // settings handling above fill in every v2 default, so this is a silent v1→v2.
  const doc: Project = {
    version: PROJECT_VERSION,
    id: typeof o.id === 'string' ? o.id : newId('proj'),
    name: typeof o.name === 'string' ? o.name : 'Untitled',
    media,
    production: parseProduction(o.production),
    mediaFolders: Array.isArray(o.mediaFolders) ? o.mediaFolders.filter((entry): entry is { id: string; name: string; parentId: string | null } => !!entry && typeof entry === 'object' && typeof entry.id === 'string' && typeof entry.name === 'string' && (entry.parentId === null || typeof entry.parentId === 'string')) : [],
    frames,
    storyboard: sanitizeStoryboard(o.storyboard, frames, issues, typeof o.name === 'string' ? o.name : 'Untitled'),
    settings: {
      gallerySort: settings.gallerySort === 'time' ? 'time' : 'manual',
      defaultProfileId:
        typeof settings.defaultProfileId === 'string'
          ? (settings.defaultProfileId as string)
          : DEFAULT_PROFILE_ID,
      audioFile: typeof settings.audioFile === 'string' ? (settings.audioFile as string) : null
    }
  }
  return { doc, issues }
}

function sanitizeMedia(m: unknown, issues: ParseIssue[]): MediaItem | null {
  if (typeof m !== 'object' || m === null) {
    issues.push({ message: 'dropped a malformed media item' })
    return null
  }
  const o = m as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.sourceFile !== 'string') {
    issues.push({ message: 'dropped a media item missing id/sourceFile' })
    return null
  }
  const kind: MediaKind = o.kind === 'video' ? 'video' : 'image'
  return {
    id: o.id,
    kind,
    sourceFile: o.sourceFile,
    workingFile: typeof o.workingFile === 'string' ? o.workingFile : undefined,
    externalPath: typeof o.externalPath === 'string' ? o.externalPath : undefined,
    folderId: typeof o.folderId === 'string' ? o.folderId : undefined,
    name: typeof o.name === 'string' ? o.name : o.sourceFile,
    durationS: typeof o.durationS === 'number' ? o.durationS : undefined,
    width: typeof o.width === 'number' ? o.width : 0,
    height: typeof o.height === 'number' ? o.height : 0,
    fps: typeof o.fps === 'number' ? o.fps : undefined
  }
}

function sanitizeFrame(f: unknown, issues: ParseIssue[]): Frame | null {
  if (typeof f !== 'object' || f === null) {
    issues.push({ message: 'dropped a malformed frame' })
    return null
  }
  const o = f as Record<string, unknown>
  if (typeof o.id !== 'string' || typeof o.mediaId !== 'string') {
    issues.push({ message: 'dropped a frame missing id/mediaId' })
    return null
  }
  let crop: Crop | null = null
  if (o.crop && typeof o.crop === 'object') {
    const c = o.crop as Record<string, unknown>
    crop = {
      aspect: (c.aspect ?? null) as Crop['aspect'],
      x: typeof c.x === 'number' ? c.x : 0,
      y: typeof c.y === 'number' ? c.y : 0,
      w: typeof c.w === 'number' ? c.w : 1,
      h: typeof c.h === 'number' ? c.h : 1
    }
  }
  const prompt =
    o.prompt && typeof o.prompt === 'object'
      ? {
          text: String((o.prompt as Record<string, unknown>).text ?? ''),
          profileId: String((o.prompt as Record<string, unknown>).profileId ?? DEFAULT_PROFILE_ID),
          generatedAt: String((o.prompt as Record<string, unknown>).generatedAt ?? ''),
          model: String((o.prompt as Record<string, unknown>).model ?? '')
        }
      : null
  return {
    id: o.id,
    mediaId: o.mediaId,
    timeS: typeof o.timeS === 'number' ? o.timeS : 0,
    label: typeof o.label === 'string' ? o.label : '',
    notes: typeof o.notes === 'string' ? o.notes : '',
    order: typeof o.order === 'number' ? o.order : 0,
    crop,
    prompt,
    durationS:
      typeof o.durationS === 'number' && isFinite(o.durationS) && o.durationS > 0
        ? o.durationS
        : DEFAULT_FRAME_DURATION_S,
    shot: sanitizeShot(o.shot),
    annotations: Array.isArray(o.annotations)
      ? (o.annotations as unknown[]).map(sanitizeAnnotation).filter(Boolean as unknown as (x: Annotation | null) => x is Annotation)
      : []
  }
}

function sanitizeShot(s: unknown): ShotMeta {
  const base = emptyShotMeta()
  if (typeof s !== 'object' || s === null) return base
  const o = s as Record<string, unknown>
  const str = (k: keyof ShotMeta): string => (typeof o[k] === 'string' ? (o[k] as string) : '')
  return {
    sceneNo: str('sceneNo'),
    shotNo: str('shotNo'),
    shotSize: str('shotSize'),
    cameraAngle: str('cameraAngle'),
    lens: str('lens'),
    movement: str('movement'),
    transition: str('transition')
  }
}

function sanitizeAnnotation(a: unknown): Annotation | null {
  if (typeof a !== 'object' || a === null) return null
  const o = a as Record<string, unknown>
  const kind = o.kind === 'text' ? 'text' : o.kind === 'arrow' ? 'arrow' : null
  if (!kind) return null
  const points = Array.isArray(o.points)
    ? (o.points as unknown[])
        .map((p) => {
          if (typeof p !== 'object' || p === null) return null
          const pp = p as Record<string, unknown>
          const x = typeof pp.x === 'number' ? pp.x : 0
          const y = typeof pp.y === 'number' ? pp.y : 0
          return { x, y }
        })
        .filter(Boolean as unknown as (x: { x: number; y: number } | null) => x is { x: number; y: number })
    : []
  if (points.length === 0) return null
  return {
    id: typeof o.id === 'string' ? o.id : newId('anno'),
    kind,
    points,
    text: typeof o.text === 'string' ? o.text : undefined,
    color: typeof o.color === 'string' ? o.color : '#ff5533'
  }
}

export function createStoryShot(frames: Frame[] = []): StoryShot {
  const columns = defaultStoryColumns()
  const cells: Record<string, StoryCell> = Object.fromEntries(columns.map((column) => [column.id, column.type === 'image' ? [] : '']))
  const shot = { id: newId('shot'), cells, startS: null, endS: null }
  const values: Record<string, string> = {
    sceneNo: frames[0]?.shot.sceneNo ?? '', shotNo: frames[0]?.shot.shotNo ?? '', title: frames[0]?.label ?? '', shotSize: frames[0]?.shot.shotSize ?? '',
    cameraAngle: frames[0]?.shot.cameraAngle ?? '', lens: frames[0]?.shot.lens ?? '', movement: frames[0]?.shot.movement ?? '',
    transition: frames[0]?.shot.transition ?? '', description: '', composition: '', lighting: '', dialogue: '', sound: '', notes: frames[0]?.notes ?? ''
  }
  for (const column of columns) if (column.id in values) shot.cells[column.id] = values[column.id]!
  shot.cells.image = frames.map((frame, index) => ({ frame: { ...structuredClone(frame), id: newId('still') }, role: index === 0 ? 'Start' : index === frames.length - 1 ? 'End' : 'Middle' }))
  return shot
}

function sanitizeStoryboard(value: unknown, frames: Frame[], issues: ParseIssue[], name: string): Project['storyboard'] {
  if (!value || typeof value !== 'object') return { title: name, description: '', columns: defaultStoryColumns(), shots: [...frames].sort((a, b) => a.order - b.order).map((frame) => createStoryShot([frame])) }
  const raw = value as Record<string, unknown>
  const columns = Array.isArray(raw.columns) ? raw.columns.map(sanitizeStoryColumn).filter((item): item is StoryColumn => item !== null) : defaultStoryColumns()
  const shots: StoryShot[] = []
  if (Array.isArray(raw.shots)) for (const item of raw.shots) {
    if (!item || typeof item !== 'object') continue
    const shot = item as Record<string, unknown>
    const cells: Record<string, StoryCell> = Object.fromEntries(columns.map((column) => [column.id, column.type === 'image' ? [] : '']))
    const result: StoryShot = { id: typeof shot.id === 'string' ? shot.id : newId('shot'), cells, startS: null, endS: null }
    if (shot.cells && typeof shot.cells === 'object') for (const column of columns) result.cells[column.id] = sanitizeCell((shot.cells as Record<string, unknown>)[column.id], column, issues)
    else {
      for (const key of Object.keys(STORY_FIELDS) as (keyof typeof STORY_FIELDS)[]) {
        const value = shot[key]
        const column = columns.find((item) => item.id === key)
        if (column && typeof value === 'string') result.cells[column.id] = value
        else if (typeof value === 'string' && value) {
          const legacy = { id: `legacy-${key}`, name: STORY_FIELDS[key], type: 'text' as const, width: 180, visible: false, options: [] }
          columns.push(legacy); result.cells[legacy.id] = value
        }
      }
      const known = new Set([...Object.keys(STORY_FIELDS), 'id', 'images', 'startS', 'endS', 'cells'])
      for (const [key, value] of Object.entries(shot)) {
        if (known.has(key) || typeof value !== 'string' && typeof value !== 'number') continue
        const legacy = columns.find((column) => column.id === `legacy-${key}`) ?? { id: `legacy-${key}`, name: key, type: 'text' as const, width: 180, visible: false, options: [] }
        if (!columns.includes(legacy)) columns.push(legacy)
        result.cells[legacy.id] = String(value)
      }
      const imageColumn = columns.find((column) => column.type === 'image')
      if (imageColumn && Array.isArray(shot.images)) result.cells[imageColumn.id] = shot.images.flatMap((image) => {
        if (!image || typeof image !== 'object') return []
        const entry = image as Record<string, unknown>; const frame = sanitizeFrame(entry.frame, issues)
        return frame ? [{ frame, role: typeof entry.role === 'string' ? entry.role : '' }] : []
      })
    }
    for (const key of ['startS', 'endS'] as const) if (typeof shot[key] === 'number' && Number.isFinite(shot[key]) && shot[key] >= 0) result[key] = shot[key] as number
    if ('startS' in result.cells) result.cells.startS = result.startS ?? ''
    if ('endS' in result.cells) result.cells.endS = result.endS ?? ''
    if (result.startS !== null && result.endS !== null && result.endS < result.startS) result.endS = null
    shots.push(result)
  }
  return { title: typeof raw.title === 'string' ? raw.title : name, description: typeof raw.description === 'string' ? raw.description : '', columns, shots }
}

export function defaultStoryColumns(): StoryColumn[] {
  return [
    { id: 'shotNo', name: '镜号', type: 'number', width: 56, visible: true, options: [] },
    { id: 'image', name: '画面', type: 'image', width: 220, visible: true, options: [] },
    { id: 'description', name: '内容', type: 'text', width: 260, visible: true, options: [] },
    { id: 'sound', name: '声音', type: 'text', width: 220, visible: true, options: [] },
    { id: 'duration', name: '时长（秒）', type: 'number', width: 100, visible: true, options: [] },
    { id: 'shotSize', name: '景别', type: 'single', width: 110, visible: true, options: ['大远景', '远景', '全景', '中景', '近景', '特写', '大特写'] },
    { id: 'movement', name: '运镜', type: 'single', width: 110, visible: true, options: ['固定', '推', '拉', '摇', '移', '跟', '升降', '手持', '航拍'] },
    { id: 'lens', name: '焦段', type: 'single', width: 110, visible: false, options: ['14mm', '24mm', '35mm', '50mm', '85mm', '135mm'] },
    { id: 'cameraAngle', name: '机位', type: 'single', width: 110, visible: false, options: ['平视', '俯拍', '仰拍', '顶拍', '低机位', '主观'] },
    { id: 'transition', name: '转场', type: 'single', width: 110, visible: false, options: ['切', '淡入淡出', '叠化', '划像', '匹配剪辑'] },
    { id: 'startS', name: '入点（秒）', type: 'number', width: 110, visible: false, options: [] },
    { id: 'endS', name: '出点（秒）', type: 'number', width: 110, visible: false, options: [] }
  ]
}

function sanitizeStoryColumn(value: unknown): StoryColumn | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Record<string, unknown>
  const types: StoryColumnType[] = ['text', 'number', 'single', 'multi', 'date', 'checkbox', 'image']
  if (typeof item.id !== 'string' || typeof item.name !== 'string' || !types.includes(item.type as StoryColumnType)) return null
  return { id: item.id, name: item.name, type: item.type as StoryColumnType, width: typeof item.width === 'number' ? Math.max(40, item.width) : 160, visible: item.visible !== false, options: Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === 'string') : [] }
}

function sanitizeCell(value: unknown, column: StoryColumn, issues: ParseIssue[]): StoryCell {
  if (column.type === 'image') {
    if (!Array.isArray(value)) return []
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const image = entry as Record<string, unknown>; const frame = sanitizeFrame(image.frame, issues)
      return frame ? [{ frame, role: typeof image.role === 'string' ? image.role : '' }] : []
    })
  }
  if (column.type === 'checkbox') return value === true
  if (column.type === 'number') return typeof value === 'number' || typeof value === 'string' ? value : ''
  if (column.type === 'multi') return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  return typeof value === 'string' ? value : ''
}

export function storyColumnPresets(): StoryColumn[] {
  return [...defaultStoryColumns(),
    { id: 'reference', name: '参考画面', type: 'image' as const, width: 220, visible: true, options: [] },
    { id: 'notes', name: '备注', type: 'text' as const, width: 200, visible: true, options: [] }
  ].map((column) => ({ ...column, visible: true }))
}

export function minimumColumnWidth(column: StoryColumn): number {
  if (column.id === 'shotNo') return 40
  return { image: 160, text: 120, number: 56, checkbox: 48, single: 80, multi: 80, date: 112 }[column.type]
}

export function formatStoryDuration(seconds: number): string {
  const hundredths = Math.round(seconds * 100)
  const minutes = Math.floor(hundredths / 6000)
  const remainder = (hundredths % 6000) / 100
  const value = remainder.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
  return `${minutes}:${remainder < 10 ? '0' : ''}${value}`
}
