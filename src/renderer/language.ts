import { create } from 'zustand'
import { resolveLanguage, setLanguage, type LanguagePreference } from '@shared/i18n'

const stored = localStorage.getItem('framebook.language')
const preference: LanguagePreference = stored === 'zh-CN' || stored === 'en' ? stored : 'system'

export const useLanguage = create<{ preference: LanguagePreference; change(value: LanguagePreference): void }>((set) => ({
  preference,
  change(value) {
    localStorage.setItem('framebook.language', value)
    setLanguage(resolveLanguage(value, navigator.language))
    document.documentElement.lang = resolveLanguage(value, navigator.language)
    void window.sbr.setLanguage(value)
    set({ preference: value })
  }
}))

setLanguage(resolveLanguage(preference, navigator.language))
document.documentElement.lang = resolveLanguage(preference, navigator.language)
void window.sbr.setLanguage(preference)
