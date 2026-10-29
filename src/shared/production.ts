export interface ProductionItem {
  id: string
  shotId: string | null
  snapshot: string
  title: string
  minutes: number
  preparation: number
  owner: string
  cast: string
  equipment: string
  notes: string
  status: 'pending' | 'shooting' | 'done' | 'retake'
}
export interface ShootDay {
  id: string
  name: string
  date: string
  location: string
  start: string
  finish: string
  items: ProductionItem[]
  notice: {
    meeting: string
    personnel: string
    equipment: string
    emergency: string
    notes: string
  }
}
export interface Take {
  id: string
  dayId: string
  itemId: string
  number: number
  camera: string
  filename: string
  recorded: string
  rating: 'good' | 'alternate' | 'reject'
  notes: string
  mediaIds: string[]
}
export interface Production {
  days: ShootDay[]
  takes: Take[]
}
export function parseProduction(value: unknown): Production {
  if (!value || typeof value !== 'object') return { days: [], takes: [] }
  const input = value as Production
  const text = (v: unknown): string => (typeof v === 'string' ? v : '')
  return {
    days: Array.isArray(input.days)
      ? input.days
          .filter((d) => d && typeof d.id === 'string')
          .map((d) => ({
            id: d.id,
            name: text(d.name),
            date: text(d.date),
            location: text(d.location),
            start: /^\d\d:\d\d$/.test(d.start) ? d.start : '09:00',
            finish: text(d.finish),
            notice: {
              meeting: text(d.notice?.meeting),
              personnel: text(d.notice?.personnel),
              equipment: text(d.notice?.equipment),
              emergency: text(d.notice?.emergency),
              notes: text(d.notice?.notes)
            },
            items: Array.isArray(d.items)
              ? d.items
                  .filter((i) => i && typeof i.id === 'string')
                  .map((i) => ({
                    id: i.id,
                    shotId: typeof i.shotId === 'string' ? i.shotId : null,
                    snapshot: text(i.snapshot),
                    title: text(i.title),
                    minutes: Math.max(0, Number(i.minutes) || 0),
                    preparation: Math.max(0, Number(i.preparation) || 0),
                    owner: text(i.owner),
                    cast: text(i.cast),
                    equipment: text(i.equipment),
                    notes: text(i.notes),
                    status: ['pending', 'shooting', 'done', 'retake'].includes(i.status)
                      ? i.status
                      : 'pending'
                  }))
              : []
          }))
      : [],
    takes: Array.isArray(input.takes)
      ? input.takes
          .filter((t) => t && typeof t.id === 'string')
          .map((t) => ({
            id: t.id,
            dayId: text(t.dayId),
            itemId: text(t.itemId),
            number: Math.max(1, Number(t.number) || 1),
            camera: text(t.camera),
            filename: text(t.filename),
            recorded: text(t.recorded),
            rating: ['good', 'alternate', 'reject'].includes(t.rating) ? t.rating : 'alternate',
            notes: text(t.notes),
            mediaIds: Array.isArray(t.mediaIds)
              ? t.mediaIds.filter((id) => typeof id === 'string')
              : []
          }))
      : []
  }
}
export function schedule(items: ProductionItem[], start: string): { start: number; end: number }[] {
  const [h, m] = start.split(':').map(Number)
  let cursor = (h || 0) * 60 + (m || 0)
  return items.map((item) => {
    const begin = cursor
    cursor += item.minutes + item.preparation
    return { start: begin, end: cursor }
  })
}
export function clock(minutes: number): string {
  return (
    `${Math.floor(minutes / 60) % 24}`.padStart(2, '0') +
    ':' +
    `${minutes % 60}`.padStart(2, '0') +
    (minutes >= 1440 ? ' +1' : '')
  )
}
