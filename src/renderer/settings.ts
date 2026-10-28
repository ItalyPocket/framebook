import { create } from 'zustand'
import type { AppSettings } from '@shared/workspace'

let revision = 0
export const useSettings = create<{
  value: AppSettings | null
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
}>((set, get) => ({
  value: null,
  async load() {
    const current = revision
    const value = await window.sbr.getSettings()
    if (revision === current) set({ value })
  },
  async update(patch) {
    const previous = get().value
    const current = ++revision
    if (previous) set({ value: { ...previous, ...patch } })
    try {
      const value = await window.sbr.setSettings(patch)
      if (revision === current) set({ value })
    } catch (error) {
      if (revision === current) set({ value: previous })
      throw error
    }
  }
}))
