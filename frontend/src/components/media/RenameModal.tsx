import { useState, useEffect, useRef, type FormEvent } from 'react'
import { X, Pencil } from 'lucide-react'
import { useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { mediaApi } from '@/api'
import type { MediaItem } from '@/types'
import { useSettingsCtx } from '@/context/SettingsContext'

interface RenameModalProps {
  item: MediaItem
  onClose: () => void
}

export default function RenameModal({ item, onClose }: RenameModalProps) {
  const { t } = useSettingsCtx()
  const [title, setTitle] = useState(item.title)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || trimmed === item.title) { onClose(); return }
    setLoading(true)
    try {
      await mediaApi.rename(item.id, trimmed)
      queryClient.invalidateQueries('media')
      toast.success(t('toast_renamed'))
      onClose()
    } catch {
      toast.error(t('toast_rename_err'))
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="vault-card w-full max-w-sm p-5 animate-slide-up mx-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-vault-text">{t('rename_title')}</h2>
          <button onClick={onClose} className="rounded p-1 text-vault-dim hover:text-vault-text">
            <X size={15} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <Pencil size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
            <input
              ref={inputRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={256}
              required
              className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-3 text-sm text-vault-text focus:border-vault-accent focus:outline-none transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-vault-border py-2 text-xs text-vault-muted hover:text-vault-text transition-colors"
            >
              {t('rename_cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-white transition-colors',
                loading || !title.trim()
                  ? 'cursor-not-allowed bg-vault-accent/40'
                  : 'bg-vault-accent hover:bg-vault-accent-hover',
              )}
            >
              {loading
                ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                : t('rename_confirm')
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
