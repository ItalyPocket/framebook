
import { useStore } from '../store'
import { renderAnnotationsSvg, annotationsHash } from '@shared/annotations'
import type { Frame } from '@shared/types'
import type { ExportFrameInput } from '../../preload/index'

/** Where extracted stills live: <project>/.frames/<frameId>.png (in-project so
 *  readProjectFile can serve them as blob URLs). */
function stillPathFor(folder: string, frameId: string): string {
  const sep = folder.includes('\\') ? '\\' : '/'
  return `${folder}${sep}.frames${sep}${frameId}.png`
}

/** Ensure a full-res still PNG exists on disk for a frame; return its abs path. */
const pendingStills = new Map<string, Promise<string | null>>()

export function ensureStill(frameId: string, snapshot?: Frame): Promise<string | null> {
  const state = useStore.getState()
  const media = state.media((snapshot ?? state.frame(frameId))?.mediaId ?? null)
  const key = `${state.projectFolder}:${frameId}:${media?.clip?.inS ?? ''}`
  const pending = pendingStills.get(key)
  if (pending) return pending
  const task = extractStill(frameId, snapshot).finally(() => pendingStills.delete(key))
  pendingStills.set(key, task)
  return task
}

async function extractStill(frameId: string, snapshot?: Frame): Promise<string | null> {
  const s = useStore.getState()
  const existing = s.stills[frameId]
  const frame = snapshot ?? s.frame(frameId)
  if (!frame || !s.projectFolder) return null
  const media = s.media(frame.mediaId)
  if (!media) return null
  const sourceTime = media.clip?.inS ?? frame.timeS
  if (existing && (!media.clip || existing.timeS === sourceTime)) return existing.path
  const abs = s.mediaAbsPath(frame.mediaId)
  if (!abs) return null

  const outPng = stillPathFor(s.projectFolder, media.clip ? `${frameId}-${String(sourceTime).replace('.', '-')}` : frameId)
  await window.sbr.ensureDir(`${s.projectFolder}${s.projectFolder.includes('\\') ? '\\' : '/'}.frames`)

  if (media.kind === 'image') {
    // Images: the "extraction" is a copy at t=0 (ffmpeg re-encodes to PNG).
    const r = await window.sbr.extractFrame(abs, 0, outPng)
    if (!r.ok) return null
  } else {
    const r = await window.sbr.extractFrame(abs, sourceTime, outPng)
    if (!r.ok) return null
  }
  if (useStore.getState().projectFolder !== s.projectFolder) return null
  useStore.getState().setStill(frameId, { path: outPng, width: media.width, height: media.height, timeS: sourceTime })
  return outPng
}

/** Load an image element from a src (blob/data URL). */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/**
 * If a frame has annotations, composite them onto its full-res still with a
 * canvas (renderer-side — no hidden windows) and write the result to
 * .frames/anno-<id>-<hash>.png, returning that path. Otherwise returns the
 * original still. The composite is cached by annotations hash.
 */
export async function compositeAnnotated(frame: Frame, stillPath: string, w: number, h: number): Promise<string> {
  if (!frame.annotations || frame.annotations.length === 0 || w <= 0 || h <= 0) return stillPath
  const svg = renderAnnotationsSvg(frame, w, h)
  if (!svg) return stillPath
  const s = useStore.getState()
  const folder = s.projectFolder
  if (!folder) return stillPath
  const sep = folder.includes('\\') ? '\\' : '/'
  const rel = `.frames${sep}anno-${frame.id}-${annotationsHash(frame)}.png`
  try {
    const stillRel = stillPath.startsWith(folder) ? stillPath.slice(folder.length).replace(/^[/\\]/, '') : stillPath
    const cached = await window.sbr.compositeCache(folder, stillRel, svg)
    if (cached) {
      const encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.onerror = reject; reader.readAsDataURL(new Blob([new Uint8Array(cached)], { type: 'image/png' })) })
      if (await window.sbr.writeProjectPng(folder, rel, encoded)) return `${folder}${sep}${rel}`
    }
    const buf = await window.sbr.readProjectFile(folder, stillRel)
    const stillUrl = URL.createObjectURL(new Blob([buf], { type: 'image/png' }))
    const svgUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return stillPath
    ctx.drawImage(await loadImage(stillUrl), 0, 0, w, h)
    ctx.drawImage(await loadImage(svgUrl), 0, 0, w, h)
    URL.revokeObjectURL(stillUrl)
    const dataUrl = canvas.toDataURL('image/png')
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
    await window.sbr.compositeCache(folder, stillRel, svg, base64)
    const ok = await window.sbr.writeProjectPng(folder, rel, base64)
    return ok ? `${folder}${sep}${rel}` : stillPath
  } catch {
    return stillPath
  }
}

/** Build the export inputs for the whole board (extracts any missing stills). */
export async function buildExportInputs(frames?: Frame[]): Promise<ExportFrameInput[]> {
  const s = useStore.getState()
  const ordered = frames ?? s.orderedFrames()
  const inputs: ExportFrameInput[] = []
  for (const frame of ordered) {
    const still = await ensureStill(frame.id, frame)
    if (!still) throw new Error(`Cannot extract frame: ${frame.label || frame.id}`)
    const media = s.media(frame.mediaId)
    const source = await compositeAnnotated(frame, still, media?.width ?? 0, media?.height ?? 0)
    inputs.push({
      origin: frame.origin ?? (media?.libtvSource ? 'ai' : 'unknown'),
      sourcePng: source,
      label: frame.label,
      notes: frame.notes,
      promptText: frame.prompt?.text ?? '',
      profileId: frame.prompt?.profileId ?? s.doc?.settings.defaultProfileId ?? 'midjourney',
      crop: frame.crop,
      sourceWidth: media?.width ?? 0,
      sourceHeight: media?.height ?? 0,
      timeS: frame.timeS,
      mediaName: media?.name ?? '',
      clipSource: media?.clip ? (s.media(media.clip.sourceMediaId)?.name ?? media.sourceFile) : undefined,
      clipInS: media?.clip?.inS,
      clipOutS: media?.clip?.outS,
      durationS: frame.durationS,
      shot: frame.shot,
      annotations: frame.annotations
    })
  }
  return inputs
}

/** Absolute path to the project's scratch-track audio, or null. */
export function audioAbsPath(): string | null {
  const s = useStore.getState()
  const rel = s.doc?.settings.audioFile
  if (!rel || !s.projectFolder) return null
  const sep = s.projectFolder.includes('\\') ? '\\' : '/'
  return `${s.projectFolder}${sep}${rel.replace(/[/\\]/g, sep)}`
}
