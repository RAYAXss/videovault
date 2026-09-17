import { useEffect } from 'react'
import { X, Download } from 'lucide-react'
import { revokeBlobUrl } from '@/utils'
import type { MediaItem } from '@/types'

interface PlayerModalProps {
  item: MediaItem
  blobUrl: string
  onClose: () => void
}

export default function PlayerModal({ item, blobUrl, onClose }: PlayerModalProps) {
  const isVideo = item.media_type === 'video'
  const isPdf = item.extension === '.pdf'

  useEffect(() => {
    return () => revokeBlobUrl(blobUrl)
  }, [blobUrl])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog" aria-modal="true" aria-label={`Lecture : ${item.title}`}
    >
      <div className="relative flex w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-vault-border bg-black animate-slide-up mx-4">
        <div className="flex items-center justify-between border-b border-vault-border bg-vault-surface px-4 py-2.5">
          <span className="truncate text-sm font-medium text-vault-text">{item.title}</span>
          <div className="flex items-center gap-1">
            <a
              href={blobUrl}
              download={item.original_filename}
              className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs text-vault-muted hover:bg-vault-hover hover:text-vault-text transition-colors"
            >
              <Download size={12} /> Sauvegarder
            </a>
            <button onClick={onClose} className="rounded p-1 text-vault-dim hover:text-vault-text transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="bg-black">
          {isVideo ? (
            <video src={blobUrl} controls autoPlay className="w-full max-h-[75vh]" style={{ display: 'block' }} />
          ) : isPdf ? (
            <iframe src={blobUrl} title={item.title} className="h-[75vh] w-full border-0" />
          ) : (
            <img src={blobUrl} alt={item.title} className="mx-auto max-h-[75vh] max-w-full object-contain" />
          )}
        </div>
      </div>
    </div>
  )
}
