import { useState, FormEvent } from 'react'
import { Lock, User, Eye, EyeOff, Shield } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import toast from 'react-hot-toast'
import clsx from 'clsx'

type Mode = 'login' | 'register'

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const { login, register } = useAuth()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        await register(username, password)
        toast.success('Compte créé.')
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Une erreur est survenue.'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-vault-bg px-4">
      {/* Fond radial très subtil centré sur le formulaire */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_50%_50%,#C0392B08,transparent)]" />

      <div className="relative w-full max-w-sm">
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

        {/* Carte formulaire */}
        <div className="vault-card p-6">
          {/* Toggle login / register */}
          <div className="mb-5 flex rounded-lg bg-vault-bg p-1">
            {(['login', 'register'] as Mode[]).map((m) => (
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
                {m === 'login' ? 'Connexion' : 'Créer un compte'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* Nom d'utilisateur */}
            <div>
              <label className="mb-1 block text-xs text-vault-muted">Nom d'utilisateur</label>
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

            {/* Mot de passe */}
            <div>
              <label className="mb-1 block text-xs text-vault-muted">Mot de passe</label>
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
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="mt-1 text-xs text-vault-dim">Minimum 8 caractères.</p>
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
                <>
                  <Lock size={14} />
                  {mode === 'login' ? 'Accéder au vault' : 'Créer le vault'}
                </>
              )}
            </button>
          </form>
        </div>

        {/* Note de sécurité */}
        <div className="mt-4 flex items-center justify-center gap-1.5">
          <Shield size={11} className="text-vault-dim" />
          <span className="text-xs text-vault-dim">AES-256-GCM · PBKDF2 600k itérations · cookies httpOnly</span>
        </div>
      </div>
    </div>
  )
}
