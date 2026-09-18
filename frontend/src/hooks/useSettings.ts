/**
 * useSettings — Contexte global pour la langue et le thème.
 * Persisté dans localStorage (pas de données sensibles ici).
 */

import { useState, useEffect, useCallback } from 'react'
import { translations, type Lang, type TranslationKey } from '@/i18n/translations'

const LS_LANG = 'vv_lang'
const LS_THEME = 'vv_theme'

export type Theme = 'dark' | 'light'

function getInitialLang(): Lang {
  const stored = localStorage.getItem(LS_LANG)
  if (stored === 'fr' || stored === 'en') return stored
  return navigator.language.startsWith('fr') ? 'fr' : 'en'
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(LS_THEME)
  if (stored === 'dark' || stored === 'light') return stored
  return 'dark'
}

export function useSettings() {
  const [lang, setLangState] = useState<Lang>(getInitialLang)
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)

  // Apply theme to <html>
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
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

  return { lang, setLang, theme, setTheme, t }
}
