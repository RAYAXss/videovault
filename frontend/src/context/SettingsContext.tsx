import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { translations, type Lang, type TranslationKey } from '@/i18n/translations'

export type Theme = 'dark' | 'light'

interface SettingsCtx {
  lang: Lang
  setLang: (l: Lang) => void
  theme: Theme
  setTheme: (t: Theme) => void
  t: (key: TranslationKey) => string
}

const Ctx = createContext<SettingsCtx | null>(null)

const LS_LANG = 'vv_lang'
const LS_THEME = 'vv_theme'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const s = localStorage.getItem(LS_LANG)
    if (s === 'fr' || s === 'en') return s
    return navigator.language.startsWith('fr') ? 'fr' : 'en'
  })
  const [theme, setThemeState] = useState<Theme>(() => {
    const s = localStorage.getItem(LS_THEME)
    return s === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(LS_THEME, theme)
  }, [theme])

  const setLang = useCallback((l: Lang) => {
    setLangState(l)
    localStorage.setItem(LS_LANG, l)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
  }, [])

  const t = useCallback(
    (key: TranslationKey): string => translations[lang][key] as string,
    [lang],
  )

  return <Ctx.Provider value={{ lang, setLang, theme, setTheme, t }}>{children}</Ctx.Provider>
}

export function useSettingsCtx() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSettingsCtx must be used within SettingsProvider')
  return ctx
}
