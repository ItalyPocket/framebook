import { ensureCapture } from './lib/captureMedia'
import { aspectRatio } from '@shared/types'
import { t } from '@shared/i18n'
import { create } from 'zustand'
import type {
  Project,
  MediaItem,
  Frame,
  Crop,
  CropAspect,
  ShotMeta,
  Annotation,
  StoryShot,
  StoryColumn,
  StoryCell,
  StoryImage
} from '@shared/types'
import {
  createProject,
  createStoryShot,
  createMediaItem,
  createFrame,
  serializeProject,
  parseProject,
  fullCrop,
  newId
} from '@shared/schema'
import { absMediaPath } from './lib/paths'

export interface Toast {
  id: string
  text: string
  kind: 'info' | 'error' | 'success'
}

export interface ExtractedStill {
  /** Absolute path on disk to the full-res extracted PNG for a frame. */
  path: string
  width: number
  height: number
}

interface SbrState {
  projectFolder: string | null
  doc: Project | null
  /** Selected media item (opens in the viewer). */
  selectedMediaId: string | null
  /** Selected board frame (opens in the inspector). */
  selectedFrameId: string | null
  seekTime: number | null
  workspace: 'capture' | 'gallery' | 'storyboard' | 'planning' | 'callsheet'
  history: Project[]
  future: Project[]
  setWorkspace(value: 'capture' | 'gallery' | 'storyboard' | 'planning' | 'callsheet'): void
  undo(): void
  redo(): void
  sortGallery(): void
  addShots(frameIds: string[], grouped: boolean): string
  updateShot(id: string, patch: Partial<StoryShot>): void
  removeShot(id: string): void
  duplicateShot(id: string): void
  reorderShot(id: string, toIndex: number): void
  addShotImages(id: string, frameIds: string[], columnId?: string): void
  updateStoryCell(id: string, columnId: string, value: StoryCell): void
  addStoryColumn(column: StoryColumn): void
  updateStoryColumn(id: string, patch: Partial<StoryColumn>): void
  removeStoryColumn(id: string): void
  reorderStoryColumn(id: string, toIndex: number): void
  addStoryImage(id: string, columnId: string, frame: Frame, role?: string): void
  dirty: boolean
  toasts: Toast[]
  helpOpen: boolean
  /** Cache of extracted full-res stills, keyed by frame id (for crop + export). */
  stills: Record<string, ExtractedStill>

  /* ephemeral view/tool state (not part of the saved document) */
  /** Center stage shows the selected frame ('frame') or the clip ('clip'). */
  viewMode: 'clip' | 'frame'
  /** Active annotation tool on the stage. */
  annotTool: 'none' | 'arrow' | 'text'
  /** Active annotation color. */
  annotColor: string
  /** Rule-of-thirds + action-safe guides visible on the stage. */
  guidesOn: boolean
  /** Selected annotation (for delete), or null. */
  selectedAnnotationId: string | null
  /** Present / play mode overlay open. */
  presentOpen: boolean

  /* lifecycle */
  newProject(folder: string, name: string): void
  loadFromJson(folder: string, json: string): boolean
  markSaved(snapshot?: string): void
  setHelpOpen(open: boolean): void

  /* selection */
  selectMedia(id: string | null): void
  selectFrame(id: string | null): void
  setViewMode(mode: 'clip' | 'frame'): void
  setAnnotTool(tool: 'none' | 'arrow' | 'text'): void
  setAnnotColor(color: string): void
  setGuidesOn(on: boolean): void
  selectAnnotation(id: string | null): void
  setPresentOpen(open: boolean): void

  /* mutations */
  mutate(label: string, fn: (doc: Project) => void): void

  /* accessors */
  media(id: string | null): MediaItem | null
  frame(id: string | null): Frame | null
  orderedFrames(): Frame[]
  mediaAbsPath(mediaId: string): string | null

  /* media + frames */
  addMedia(item: Omit<MediaItem, 'id'>): MediaItem
  addFrame(mediaId: string, timeS: number, label?: string, still?: ExtractedStill): Frame
  removeFrame(frameId: string): void
  reorderFrame(frameId: string, toIndex: number): void
  setFrameLabel(frameId: string, label: string): void
  setFrameNotes(frameId: string, notes: string): void
  setFrameCrop(frameId: string, crop: Crop | null): void
  setFrameCropAspect(frameId: string, aspect: CropAspect | null): void
  setFrameDuration(frameId: string, durationS: number): void
  setFrameShot(frameId: string, patch: Partial<ShotMeta>): void
  addAnnotation(frameId: string, annotation: Omit<Annotation, 'id'> & { id?: string }): Annotation
  updateAnnotation(frameId: string, annotationId: string, patch: Partial<Annotation>): void
  removeAnnotation(frameId: string, annotationId: string): void
  clearAnnotations(frameId: string): void
  setAudioFile(path: string | null): void

  /* still cache */
  setStill(frameId: string, still: ExtractedStill): void

  /* misc */
  toast(text: string, kind?: Toast['kind']): void
  dismissToast(id: string): void
}

let toastSeq = 0
let lastMutation = { label: '', time: 0 }

export const useStore = create<SbrState>((set, get) => ({
  projectFolder: null,
  doc: null,
  selectedMediaId: null,
  selectedFrameId: null,
  seekTime: null,
  workspace: 'capture',
  history: [],
  future: [],
  dirty: false,
  toasts: [],
  helpOpen: false,
  stills: {},
  viewMode: 'clip',
  annotTool: 'none',
  annotColor: '#ff5533',
  guidesOn: false,
  selectedAnnotationId: null,
  presentOpen: false,

  newProject(folder, name) {
    const doc = createProject(name)
    set({
      doc,
      history: [],
      future: [],
      workspace: 'capture',
      projectFolder: folder,
      selectedMediaId: null,
      selectedFrameId: null,
      stills: {},
      dirty: true
    })
  },

  loadFromJson(folder, json) {
    const { doc } = parseProject(json)
    if (!doc) {
      get().toast(t('Could not open project: invalid project.json'), 'error')
      return false
    }
    set({
      doc,
      history: [],
      future: [],
      workspace: 'capture',
      projectFolder: folder,
      selectedMediaId: doc.media[0]?.id ?? null,
      selectedFrameId: doc.frames[0]?.id ?? null,
      stills: {},
      dirty: false
    })
    return true
  },

  setWorkspace: (workspace) => set({ workspace }),
  undo() {
    const { history, doc, future } = get()
    if (!doc || !history.length) return
    set({
      doc: history[history.length - 1]!,
      history: history.slice(0, -1),
      future: [doc, ...future],
      dirty: true
    })
    lastMutation = { label: '', time: 0 }
  },
  redo() {
    const { history, doc, future } = get()
    if (!doc || !future.length) return
    set({ doc: future[0]!, history: [...history, doc], future: future.slice(1), dirty: true })
    lastMutation = { label: '', time: 0 }
  },
  sortGallery() {
    get().mutate('sort gallery', (doc) => {
      doc.settings.gallerySort = 'time'
      sortFrames(doc)
    })
  },
  addShots(frameIds, grouped) {
    let id = ''
    get().mutate('add shots', (doc) => {
      const frames = [...doc.frames]
        .sort((a, b) => a.order - b.order)
        .filter((frame) => frameIds.includes(frame.id))
      const shots =
        grouped || !frames.length
          ? [createStoryShot(frames)]
          : frames.map((frame) => createStoryShot([frame]))
      doc.storyboard.shots.push(...shots)
      id = shots[0]?.id ?? ''
    })
    return id
  },
  updateShot(id, patch) {
    get().mutate(`field:${id}:${Object.keys(patch).join(',')}`, (doc) => {
      const shot = doc.storyboard.shots.find((item) => item.id === id)
      if (shot) Object.assign(shot, patch, { id })
    })
  },
  removeShot(id) {
    get().mutate('remove shot', (doc) => {
      doc.storyboard.shots = doc.storyboard.shots.filter((shot) => shot.id !== id)
    })
  },
  duplicateShot(id) {
    get().mutate('duplicate shot', (doc) => {
      const index = doc.storyboard.shots.findIndex((shot) => shot.id === id)
      if (index < 0) return
      const copy = structuredClone(doc.storyboard.shots[index]!)
      copy.id = newId('shot')
      for (const column of doc.storyboard.columns.filter((item) => item.type === 'image')) {
        const images = copy.cells[column.id] as StoryImage[] | undefined
        images?.forEach((image) => {
          image.frame.id = newId('still')
        })
      }
      doc.storyboard.shots.splice(index + 1, 0, copy)
    })
  },
  reorderShot(id, toIndex) {
    get().mutate('reorder shot', (doc) => {
      const index = doc.storyboard.shots.findIndex((shot) => shot.id === id)
      if (index < 0) return
      const [shot] = doc.storyboard.shots.splice(index, 1)
      doc.storyboard.shots.splice(
        Math.max(0, Math.min(toIndex, doc.storyboard.shots.length)),
        0,
        shot!
      )
    })
  },
  addShotImages(id, frameIds, columnId) {
    get().mutate('add shot images', (doc) => {
      const shot = doc.storyboard.shots.find((item) => item.id === id)
      const imageColumn = doc.storyboard.columns.find(
        (column) => column.type === 'image' && (!columnId || column.id === columnId)
      )
      if (shot && imageColumn)
        shot.cells[imageColumn.id] = [
          ...((shot.cells[imageColumn.id] as StoryImage[]) ?? []),
          ...(createStoryShot(
            [...doc.frames]
              .sort((a, b) => a.order - b.order)
              .filter((frame) => frameIds.includes(frame.id))
          ).cells.image as StoryImage[])
        ]
    })
  },
  updateStoryCell(id, columnId, value) {
    get().mutate(`field:${id}:${columnId}`, (doc) => {
      const shot = doc.storyboard.shots.find((item) => item.id === id)
      if (shot) shot.cells[columnId] = value
    })
  },
  addStoryColumn(column) {
    get().mutate('add story column', (doc) => {
      if (doc.storyboard.columns.some((item) => item.id === column.id)) return
      doc.storyboard.columns.push(column)
      for (const shot of doc.storyboard.shots)
        shot.cells[column.id] =
          column.id === 'startS'
            ? (shot.startS ?? '')
            : column.id === 'endS'
              ? (shot.endS ?? '')
              : column.type === 'image' || column.type === 'multi'
                ? []
                : column.type === 'checkbox'
                  ? false
                  : ''
    })
  },
  updateStoryColumn(id, patch) {
    get().mutate(`field:column:${id}`, (doc) => {
      const column = doc.storyboard.columns.find((item) => item.id === id)
      if (column) Object.assign(column, patch, { id })
    })
  },
  removeStoryColumn(id) {
    get().mutate('remove story column', (doc) => {
      doc.storyboard.columns = doc.storyboard.columns.filter((column) => column.id !== id)
      for (const shot of doc.storyboard.shots) delete shot.cells[id]
    })
  },
  reorderStoryColumn(id, toIndex) {
    get().mutate('reorder story column', (doc) => {
      const index = doc.storyboard.columns.findIndex((item) => item.id === id)
      if (index < 0) return
      const [column] = doc.storyboard.columns.splice(index, 1)
      doc.storyboard.columns.splice(
        Math.max(0, Math.min(toIndex, doc.storyboard.columns.length)),
        0,
        column!
      )
    })
  },
  addStoryImage(id, columnId, frame, role = 'Reference') {
    get().mutate('add story image', (doc) => {
      const shot = doc.storyboard.shots.find((item) => item.id === id)
      const column = doc.storyboard.columns.find((item) => item.id === columnId)
      if (!shot || column?.type !== 'image') return
      const current = (shot.cells[columnId] as StoryImage[] | undefined) ?? []
      shot.cells[columnId] = [
        ...current,
        { frame: { ...structuredClone(frame), id: newId('still') }, role }
      ]
    })
  },
  markSaved(snapshot) {
    if (snapshot && currentProjectJson() !== snapshot) return
    set({ dirty: false })
  },
  setHelpOpen: (open) => set({ helpOpen: open }),

  selectMedia: (id) => set({ selectedMediaId: id, viewMode: 'clip' }),
  selectFrame: (id) =>
    set({ selectedFrameId: id, viewMode: id ? 'frame' : 'clip', selectedAnnotationId: null }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setAnnotTool: (tool) => set({ annotTool: tool }),
  setAnnotColor: (color) => set({ annotColor: color }),
  setGuidesOn: (on) => set({ guidesOn: on }),
  selectAnnotation: (id) => set({ selectedAnnotationId: id }),
  setPresentOpen: (open) => set({ presentOpen: open }),

  mutate(_label, fn) {
    const doc = get().doc
    if (!doc) return
    // Structured clone keeps the update immutable-ish (new object → re-render)
    // without a full serialize round-trip.
    const next = structuredClone(doc) as Project
    fn(next)
    const now = Date.now()
    const merge =
      _label.startsWith('field:') &&
      lastMutation.label === _label &&
      now - lastMutation.time < 700 &&
      get().future.length === 0
    set({
      doc: next,
      dirty: true,
      history: merge ? get().history : [...get().history, doc].slice(-50),
      future: []
    })
    lastMutation = { label: _label, time: now }
  },

  media(id) {
    if (!id) return null
    return get().doc?.media.find((m) => m.id === id) ?? null
  },
  frame(id) {
    if (!id) return null
    return get().doc?.frames.find((f) => f.id === id) ?? null
  },
  orderedFrames() {
    const frames = get().doc?.frames ?? []
    return [...frames].sort((a, b) => a.order - b.order)
  },
  mediaAbsPath(mediaId) {
    const s = get()
    const m = s.doc?.media.find((x) => x.id === mediaId)
    if (!m || !s.projectFolder) return null
    return m.workingFile
      ? absMediaPath(s.projectFolder, m.workingFile)
      : (m.externalPath ?? absMediaPath(s.projectFolder, m.sourceFile))
  },

  addMedia(item) {
    const created = createMediaItem(item)
    get().mutate('import media', (doc) => {
      doc.media.push(created)
    })
    set({ selectedMediaId: created.id })
    return created
  },

  addFrame(mediaId, timeS, label = '', still) {
    const order = get().doc?.frames.length ?? 0
    const frame = createFrame(mediaId, timeS, order, label)
    get().mutate('add frame', (doc) => {
      doc.frames.push(frame)
      const source=doc.media.find((item) => item.id===mediaId)
      if(source?.kind==='video') doc.media.push(createMediaItem({kind:'image',sourceFile:`media/captures/${frame.id}.png`,name:`${label || 'Frame'}.png`,width:source.width,height:source.height,capturedFrameId:frame.id}))
      if (doc.settings.gallerySort === 'time') sortFrames(doc)
    })
    set({ selectedFrameId: frame.id })
    if(still) get().setStill(frame.id,still)
    const folder=get().projectFolder
    if(get().doc?.media.some((item) => item.capturedFrameId===frame.id)) void ensureCapture(frame.id).catch((error) => {if(get().projectFolder===folder) get().toast(String(error),'error')})
    return frame
  },

  removeFrame(frameId) {
    get().mutate('remove frame', (doc) => {
      doc.frames = doc.frames.filter((f) => f.id !== frameId)
      doc.frames.sort((a, b) => a.order - b.order).forEach((f, i) => (f.order = i))
    })
    const stills = { ...get().stills }
    delete stills[frameId]
    set({
      stills,
      selectedFrameId: get().selectedFrameId === frameId ? null : get().selectedFrameId
    })
  },

  reorderFrame(frameId, toIndex) {
    get().mutate('reorder', (doc) => {
      doc.settings.gallerySort = 'manual'
      const ordered = [...doc.frames].sort((a, b) => a.order - b.order)
      const from = ordered.findIndex((f) => f.id === frameId)
      if (from === -1) return
      const [moved] = ordered.splice(from, 1)
      ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, moved!)
      ordered.forEach((f, i) => {
        const target = doc.frames.find((x) => x.id === f.id)!
        target.order = i
      })
    })
  },

  setFrameLabel(frameId, label) {
    get().mutate(`field:${frameId}:label`, (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.label = label
    })
  },
  setFrameNotes(frameId, notes) {
    get().mutate(`field:${frameId}:notes`, (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.notes = notes
    })
  },
  setFrameCrop(frameId, crop) {
    get().mutate('crop', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.crop = crop
    })
  },
  setFrameCropAspect(frameId, aspect) {
    get().mutate('crop aspect', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (!f) return
      if (!aspect) {
        f.crop = f.crop ? { ...f.crop, aspect: null } : null
        return
      }
      const media = doc.media.find((item) => item.id === f.mediaId)
      const ratio = aspectRatio(aspect)
      if (ratio && media && media.width > 0 && media.height > 0) {
        const w = Math.min(1, (ratio * media.height) / media.width)
        const h = Math.min(1, media.width / (ratio * media.height))
        f.crop = { aspect, x: (1 - w) / 2, y: (1 - h) / 2, w, h }
      } else f.crop = fullCrop(aspect)
    })
  },
  setFrameDuration(frameId, durationS) {
    const clamped = Math.max(0.25, Math.min(30, isFinite(durationS) ? durationS : 2))
    get().mutate('duration', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.durationS = clamped
    })
  },
  setFrameShot(frameId, patch) {
    get().mutate('shot meta', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.shot = { ...f.shot, ...patch }
    })
  },
  addAnnotation(frameId, annotation) {
    const created: Annotation = { ...annotation, id: annotation.id ?? newId('anno') }
    get().mutate('add annotation', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.annotations = [...f.annotations, created]
    })
    return created
  },
  updateAnnotation(frameId, annotationId, patch) {
    get().mutate('update annotation', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (!f) return
      f.annotations = f.annotations.map((a) => (a.id === annotationId ? { ...a, ...patch } : a))
    })
  },
  removeAnnotation(frameId, annotationId) {
    get().mutate('remove annotation', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.annotations = f.annotations.filter((a) => a.id !== annotationId)
    })
  },
  clearAnnotations(frameId) {
    get().mutate('clear annotations', (doc) => {
      const f = doc.frames.find((x) => x.id === frameId)
      if (f) f.annotations = []
    })
  },
  setAudioFile(path) {
    get().mutate('scratch track', (doc) => {
      doc.settings.audioFile = path
    })
  },

  setStill(frameId, still) {
    set({ stills: { ...get().stills, [frameId]: still } })
  },

  toast(text, kind = 'info') {
    const id = `t${++toastSeq}`
    set({
      toasts: [
        ...get().toasts.filter((item) => item.text !== text || item.kind !== kind),
        { id, text, kind }
      ].slice(-3)
    })
    setTimeout(() => get().dismissToast(id), 5000)
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))

/** Serialize the current doc (or null if none). */
export function currentProjectJson(): string | null {
  const doc = useStore.getState().doc
  return doc ? serializeProject(doc) : null
}


function sortFrames(doc: Project): void {
  const positions = new Map(doc.media.map((media, index) => [media.id, index]))
  doc.frames
    .sort(
      (a, b) =>
        (positions.get(a.mediaId) ?? 0) - (positions.get(b.mediaId) ?? 0) || a.timeS - b.timeS
    )
    .forEach((frame, index) => {
      frame.order = index
    })
}
