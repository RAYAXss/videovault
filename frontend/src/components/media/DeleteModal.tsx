import { useState, useEffect } from 'react'
import { Trash2, X, AlertTriangle } from 'lucide-react'
import { useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { mediaApi } from '@/api'
import type { MediaItem } from '@/types'

interface DeleteModalProps {
  item: MediaItem
  onClose: () => void
}

export default function DeleteModal({ item, onClose }: DeleteModalProps) {
  const [loading, setLoading] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleDelete = async () => {
    setLoading(true)
    try {
      await mediaApi.delete(item.id)
      queryClient.invalidateQueries('media')
      toast.success(`« ${item.title} » supprimé définitivement.`)
      onClose()
    } catch {
      toast.error('Impossible de supprimer le fichier.')
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
        <div className="mb-4 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
              <AlertTriangle size={16} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-vault-text">Supprimer définitivement</h2>
              <p className="text-xs text-vault-muted">Cette action est irréversible.</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-vault-dim hover:text-vault-text">
            <X size={15} />
          </button>
        </div>

        <p className="mb-4 rounded-lg bg-vault-bg px-3 py-2 text-xs text-vault-muted">
          Le fichier chiffré{' '}
          <span className="font-mono text-vault-text">« {item.title} »</span>{' '}
          sera supprimé du vault et de la base de données. Il ne pourra pas être récupéré.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-vault-border py-2 text-xs text-vault-muted hover:text-vault-text transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleDelete}
            disabled={loading}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium text-white transition-colors',
              loading ? 'cursor-not-allowed bg-red-500/40' : 'bg-red-600 hover:bg-red-700',
            )}
          >
            {loading
              ? <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : <><Trash2 size={12} /> Supprimer</>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
