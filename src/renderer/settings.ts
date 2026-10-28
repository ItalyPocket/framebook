import { create } from 'zustand'
import type { AppSettings } from '@shared/workspace'

export const useSettings = create<{
  value: AppSettings | null
  load(): Promise<void>
  update(patch: Partial<AppSettings>): Promise<void>
}>((set) => ({
  value: null,
  async load() {
    set({ value: await window.sbr.getSettings() })
  },
  async update(patch) {
    set({ value: await window.sbr.setSettings(patch) })
  }
}))
