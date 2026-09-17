import { useState, useEffect, type FormEvent } from 'react'
import { X, Sun, Moon, Globe, Lock, Mail, Eye, EyeOff, AlertTriangle, ShieldAlert } from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { useSettingsCtx } from '@/context/SettingsContext'
import { api } from '@/api/client'

interface SettingsModalProps {
  onClose: () => void
}

type Tab = 'appearance' | 'security'

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { lang, setLang, theme, setTheme, t } = useSettingsCtx()
  const [tab, setTab] = useState<Tab>('appearance')

  // Password change
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)

  // Email recovery
  const [email, setEmail] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [showEmailWarning, setShowEmailWarning] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Load current email if set
  useEffect(() => {
    api.get<{ email?: string }>('/auth/me').then(r => {
      if (r.data && 'email' in r.data && r.data.email) {
        setEmail(r.data.email)
      }
    }).catch(() => {})
  }, [])

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    if (newPwd !== confirmPwd) {
      toast.error('Les mots de passe ne correspondent pas.')
      return
    }
    if (newPwd.length < 8) {
      toast.error('Le nouveau mot de passe doit faire au moins 8 caractères.')
      return
    }
    setPwdLoading(true)
    try {
      await api.post('/auth/change-password', { current_password: currentPwd, new_password: newPwd })
      toast.success(t('toast_pwd_updated'))
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? t('toast_pwd_err')
      toast.error(msg)
    } finally {
      setPwdLoading(false)
    }
  }

  const handleEmailSave = async (e: FormEvent) => {
    e.preventDefault()
    setEmailLoading(true)
    try {
      await api.patch('/auth/email', { email })
      toast.success(t('toast_email_saved'))
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Erreur.'
      toast.error(msg)
    } finally {
      setEmailLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="vault-card w-full max-w-lg animate-slide-up mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-vault-border px-5 py-4">
          <h2 className="text-sm font-semibold text-vault-text">{t('settings_title')}</h2>
          <button onClick={onClose} className="rounded p-1 text-vault-dim hover:text-vault-text transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-vault-border">
          <button
            onClick={() => setTab('appearance')}
            className={clsx(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'appearance'
                ? 'border-b-2 border-vault-accent text-vault-text'
                : 'text-vault-muted hover:text-vault-text',
            )}
          >
            {t('settings_appearance')}
          </button>
          <button
            onClick={() => setTab('security')}
            className={clsx(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              tab === 'security'
                ? 'border-b-2 border-vault-accent text-vault-text'
                : 'text-vault-muted hover:text-vault-text',
            )}
          >
            {t('settings_security')}
          </button>
        </div>

        <div className="p-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
          {tab === 'appearance' && (
            <>
              {/* Language */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Globe size={14} className="text-vault-dim" />
                  <span className="text-xs font-medium text-vault-text">{t('settings_language')}</span>
                </div>
                <div className="flex gap-2">
                  {(['fr', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLang(l)}
                      className={clsx(
                        'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                        lang === l
                          ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                          : 'border-vault-border text-vault-muted hover:border-vault-accent/40 hover:text-vault-text',
                      )}
                    >
                      {l === 'fr' ? '🇫🇷 Français' : '🇬🇧 English'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div>
                <div className="mb-2 flex items-center gap-2">
                  {theme === 'dark' ? <Moon size={14} className="text-vault-dim" /> : <Sun size={14} className="text-vault-dim" />}
                  <span className="text-xs font-medium text-vault-text">{t('settings_theme')}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setTheme('dark')}
                    className={clsx(
                      'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                      theme === 'dark'
                        ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                        : 'border-vault-border text-vault-muted hover:border-vault-accent/40 hover:text-vault-text',
                    )}
                  >
                    🌙 {t('settings_theme_dark')}
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={clsx(
                      'flex-1 rounded-lg border py-2 text-xs font-medium transition-colors',
                      theme === 'light'
                        ? 'border-vault-accent bg-vault-accent/10 text-vault-accent'
                        : 'border-vault-border text-vault-muted hover:border-vault-accent/40 hover:text-vault-text',
                    )}
                  >
                    ☀️ {t('settings_theme_light')}
                  </button>
                </div>
              </div>
            </>
          )}

          {tab === 'security' && (
            <>
              {/* Change password */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Lock size={14} className="text-vault-dim" />
                  <span className="text-xs font-medium text-vault-text">{t('settings_change_pwd')}</span>
                </div>
                <form onSubmit={handlePasswordChange} className="flex flex-col gap-2.5">
                  {/* Current */}
                  <div className="relative">
                    <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPwd}
                      onChange={e => setCurrentPwd(e.target.value)}
                      placeholder={t('settings_current_pwd')}
                      required
                      minLength={8}
                      className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-9 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
                    />
                    <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-dim">
                      {showCurrent ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {/* New */}
                  <div className="relative">
                    <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPwd}
                      onChange={e => setNewPwd(e.target.value)}
                      placeholder={t('settings_new_pwd')}
                      required
                      minLength={8}
                      className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-9 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
                    />
                    <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-dim">
                      {showNew ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {/* Confirm */}
                  <div className="relative">
                    <Lock size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                    <input
                      type="password"
                      value={confirmPwd}
                      onChange={e => setConfirmPwd(e.target.value)}
                      placeholder={t('settings_confirm_pwd')}
                      required
                      minLength={8}
                      className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-3 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={pwdLoading || !currentPwd || !newPwd || !confirmPwd}
                    className={clsx(
                      'rounded-lg py-2 text-xs font-medium text-white transition-colors',
                      pwdLoading || !currentPwd || !newPwd || !confirmPwd
                        ? 'cursor-not-allowed bg-vault-accent/40'
                        : 'bg-vault-accent hover:bg-vault-accent-hover',
                    )}
                  >
                    {pwdLoading
                      ? <div className="mx-auto h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      : t('settings_pwd_save')
                    }
                  </button>
                </form>
              </div>

              <div className="h-px bg-vault-border" />

              {/* Email recovery */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-vault-dim" />
                    <span className="text-xs font-medium text-vault-text">{t('settings_email')}</span>
                  </div>
                  <button
                    onClick={() => setShowEmailWarning(v => !v)}
                    className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300"
                  >
                    <ShieldAlert size={11} />
                    Info sécurité
                  </button>
                </div>

                {showEmailWarning && (
                  <div className="mb-3 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-amber-400" />
                    <p className="text-[11px] leading-relaxed text-amber-300">{t('settings_email_warning')}</p>
                  </div>
                )}

                <form onSubmit={handleEmailSave} className="flex flex-col gap-2.5">
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={t('settings_email_placeholder')}
                      className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-3 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={emailLoading}
                    className={clsx(
                      'rounded-lg py-2 text-xs font-medium text-white transition-colors',
                      emailLoading
                        ? 'cursor-not-allowed bg-vault-accent/40'
                        : 'bg-vault-accent hover:bg-vault-accent-hover',
                    )}
                  >
                    {emailLoading
                      ? <div className="mx-auto h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      : t('settings_email_save')
                    }
                  </button>
                </form>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-vault-border px-5 py-3">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-vault-border py-2 text-xs text-vault-muted hover:text-vault-text transition-colors"
          >
            {t('settings_close')}
          </button>
        </div>
      </div>
    </div>
  )
}
