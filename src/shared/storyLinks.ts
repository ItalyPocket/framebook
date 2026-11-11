import type { Frame, Project, StoryImage, StoryShot } from './types'

export type ImageOrigin = 'ai' | 'live' | 'unknown'
export const DEFAULT_ORIGIN_COLORS = { enabled: true, ai: '#E9EDFF', live: '#EDF3EE', mixed: '#F7F0DF' }
export function shotImages(shot: StoryShot): StoryImage[] {
  return Object.values(shot.cells).flatMap(value => Array.isArray(value) ? value.filter((item): item is StoryImage => !!item && typeof item === 'object' && 'frame' in item) : [])
}
export function linkedShots(project: Project, frameId: string): StoryShot[] {
  return project.storyboard.shots.filter(shot => shotImages(shot).some(image => image.sourceFrameId === frameId))
}
export function imageOrigin(project: Project, image: StoryImage): ImageOrigin {
  const frame = project.frames.find(item => item.id === image.sourceFrameId) ?? image.frame
  return frame.origin ?? (project.media.find(item => item.id === frame.mediaId)?.libtvSource ? 'ai' : 'unknown')
}
export function shotOrigin(project: Project, shot: StoryShot): ImageOrigin | 'mixed' {
  const values = new Set(shotImages(shot).map(image => imageOrigin(project, image)))
  if (values.has('ai') && values.has('live')) return 'mixed'
  return values.has('ai') ? 'ai' : values.has('live') ? 'live' : 'unknown'
}
export function originColor(project: Project, shot: StoryShot): string | undefined {
  const colors = { ...DEFAULT_ORIGIN_COLORS, ...project.settings.originColors }
  const origin = shotOrigin(project, shot)
  return colors.enabled && origin !== 'unknown' ? colors[origin] : undefined
}
export function setOrigin(project: Project, frameId: string, origin: ImageOrigin): void {
  const source = project.frames.find(frame => frame.id === frameId)
  if (source) source.origin = origin
  for (const shot of project.storyboard.shots) for (const image of shotImages(shot)) if (image.sourceFrameId === frameId || image.frame.id === frameId) image.frame.origin = origin
}
export function frameContent(project: Project, frame: Frame, shotId?: string): string {
  const shots = linkedShots(project, frame.id)
  const shot = shots.find(item => item.id === shotId) ?? shots[0]
  return shot ? String(shot.cells.description ?? '') : frame.notes
}
export function resolveLegacyLinks(project: Project): void {
  for (const shot of project.storyboard.shots) for (const image of shotImages(shot)) {
    if (image.sourceFrameId) continue
    const matches = project.frames.filter(frame => frame.id === image.frame.id || frame.mediaId === image.frame.mediaId && frame.timeS === image.frame.timeS && frame.label === image.frame.label)
    if (matches.length === 1) image.sourceFrameId = matches[0]!.id
  }
}
