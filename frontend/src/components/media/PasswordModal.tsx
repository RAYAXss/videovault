/**
 * PasswordModal — Saisie du mot de passe avant déchiffrement.
 *
 * Le mot de passe n'est jamais stocké en state global ni dans localStorage.
 * Il vit uniquement dans le state local de ce composant pendant la saisie,
 * puis est passé directement à l'API via FormData.
 * Dès que la modale se ferme, le state est vidé → le mot de passe disparaît
 * de la mémoire JS (sujet au GC).
 */

import { useState, FormEvent, useEffect, useRef } from 'react'
import { Lock, Eye, EyeOff, X } from 'lucide-react'
import clsx from 'clsx'
import type { MediaItem } from '@/types'

interface PasswordModalProps {
  item: MediaItem
  onConfirm: (password: string) => void
  onClose: () => void
  loading?: boolean
}

export default function PasswordModal({ item, onConfirm, onClose, loading }: PasswordModalProps) {
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus automatique sur le champ au montage.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Fermeture sur Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (password.length >= 8) onConfirm(password)
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="vault-card w-full max-w-sm p-6 animate-slide-up">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="modal-title" className="text-sm font-semibold text-vault-text">
              Déchiffrer le fichier
            </h2>
            <p className="mt-0.5 text-xs text-vault-muted">
              Entrez votre mot de passe pour accéder à&nbsp;
              <span className="font-mono text-vault-text">{item.title}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-vault-dim hover:text-vault-text transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-xs text-vault-muted" htmlFor="decrypt-pwd">
              Mot de passe
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
              <input
                id="decrypt-pwd"
                ref={inputRef}
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                minLength={8}
                className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-9 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-dim hover:text-vault-muted"
                aria-label={showPwd ? 'Masquer' : 'Afficher'}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-vault-border py-2 text-xs text-vault-muted hover:text-vault-text transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || password.length < 8}
              className={clsx(
                'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-white transition-colors',
                loading || password.length < 8
                  ? 'cursor-not-allowed bg-vault-accent/40'
                  : 'bg-vault-accent hover:bg-vault-accent-hover',
              )}
            >
              {loading ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <><Lock size={12} /> Déchiffrer</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
