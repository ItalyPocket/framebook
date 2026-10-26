import chinese from './zh-CN.json'

export type Language = 'zh-CN' | 'en'
export type LanguagePreference = Language | 'system'
let language: Language = 'en'

export function resolveLanguage(preference: LanguagePreference, system: string): Language {
  return preference === 'system' ? (system.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en') : preference
}

export function setLanguage(value: Language): void {
  language = value
}

export function t(key: string, values: Record<string, string | number> = {}, locale: Language = language): string {
  const message = locale === 'zh-CN' ? (chinese as Record<string, string>)[key] ?? key : key
  return message.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match))
}
