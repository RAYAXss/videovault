import { useState, type FormEvent } from 'react'
import { Lock, User, Eye, EyeOff, Shield, Mail, AlertTriangle, ArrowLeft } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useSettingsCtx } from '@/context/SettingsContext'
import { authApi } from '@/api'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type Mode = 'login' | 'register' | 'forgot'

export default function LoginPage() {
  const { t, lang, setLang } = useSettingsCtx()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const { login, register } = useAuth()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else if (mode === 'register') {
        await register(username, password)
        toast.success(t('toast_registered'))
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Une erreur est survenue.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authApi.forgotPassword(forgotEmail)
      setForgotSent(true)
    } catch {
      // Toujours afficher le même message (pas d'énumération d'emails)
      setForgotSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-vault-bg px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,#C0392B08,transparent)]" />

      <div className="relative w-full max-w-sm">
        {/* Lang switcher */}
        <div className="absolute right-0 top-0 flex gap-1">
          {(['fr', 'en'] as const).map(l => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={clsx(
                'rounded px-2 py-1 text-[11px] font-medium transition-colors',
                lang === l ? 'text-vault-accent' : 'text-vault-dim hover:text-vault-muted',
              )}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-vault-accent">
            <Lock size={22} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-vault-text">VideoVault</h1>
            <p className="mt-0.5 text-xs text-vault-dim">Coffre-fort de médias chiffrés</p>
          </div>
        </div>

        <div className="vault-card p-6">
          {mode === 'forgot' ? (
            /* ── Forgot password ── */
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setMode('login'); setForgotSent(false); setForgotEmail('') }}
                  className="rounded p-1 text-vault-dim hover:text-vault-text"
                >
                  <ArrowLeft size={15} />
                </button>
                <h2 className="text-sm font-semibold text-vault-text">{t('forgot_title')}</h2>
              </div>

              {/* Security warning */}
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <AlertTriangle size={13} className="mt-0.5 flex-shrink-0 text-amber-400" />
                <p className="text-[11px] leading-relaxed text-amber-300">{t('forgot_warning')}</p>
              </div>

              {forgotSent ? (
                <div className="rounded-lg bg-vault-success/10 p-3 text-center text-xs text-vault-success">
                  {t('forgot_sent')}
                </div>
              ) : (
                <form onSubmit={handleForgot} className="flex flex-col gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-vault-muted">{t('forgot_email_label')}</label>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={e => setForgotEmail(e.target.value)}
                        required
                        className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-3 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
                        placeholder="email@exemple.com"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading || !forgotEmail}
                    className={clsx(
                      'flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-colors',
                      loading || !forgotEmail
                        ? 'cursor-not-allowed bg-vault-accent/50'
                        : 'bg-vault-accent hover:bg-vault-accent-hover',
                    )}
                  >
                    {loading
                      ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      : t('forgot_submit')
                    }
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ── Login / Register ── */
            <>
              <div className="mb-5 flex rounded-lg bg-vault-bg p-1">
                {(['login', 'register'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={clsx(
                      'flex-1 rounded-md py-1.5 text-xs font-medium transition-colors',
                      mode === m
                        ? 'bg-vault-card text-vault-text'
                        : 'text-vault-muted hover:text-vault-text',
                    )}
                  >
                    {m === 'login' ? t('login_title') : t('login_register')}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div>
                  <label className="mb-1 block text-xs text-vault-muted">{t('login_username')}</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                    <input
                      type="text"
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="johndoe"
                      required
                      minLength={3}
                      maxLength={64}
                      className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-3 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-vault-muted">{t('login_password')}</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                    <input
                      type={showPwd ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      minLength={8}
                      maxLength={128}
                      className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-9 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-dim hover:text-vault-muted"
                    >
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {mode === 'register' && (
                    <p className="mt-1 text-xs text-vault-dim">{t('login_min_length')}</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className={clsx(
                    'mt-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium text-white transition-colors',
                    loading
                      ? 'cursor-not-allowed bg-vault-accent/50'
                      : 'bg-vault-accent hover:bg-vault-accent-hover',
                  )}
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <><Lock size={14} /> {mode === 'login' ? t('login_submit') : t('register_submit')}</>
                  )}
                </button>

                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-center text-[11px] text-vault-dim hover:text-vault-muted transition-colors"
                  >
                    {t('login_forgot')}
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          <Shield size={11} className="text-vault-dim" />
          <span className="text-xs text-vault-dim">AES-256-GCM · PBKDF2 600k · cookies httpOnly</span>
        </div>
      </div>
    </div>
  )
}
