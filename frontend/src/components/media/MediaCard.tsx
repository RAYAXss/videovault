import { useState } from 'react'
import { Play, Eye, Trash2, Pencil } from 'lucide-react'
import clsx from 'clsx'
import type { MediaItem } from '@/types'
import { formatBytes, formatDuration, getExtensionIcon } from '@/utils'

interface MediaCardProps {
  item: MediaItem
  onPlay: (item: MediaItem) => void
  onDelete: (item: MediaItem) => void
  onRename: (item: MediaItem) => void
}

// Palette de fonds : variation subtile par type de média pour différencier
// visuellement les catégories sans agresser l'œil.
const THUMB_GRADIENTS: Record<string, string> = {
  video: 'from-[#1E1A2E] to-[#2E1E1E]',
  document: 'from-[#1A1E2E] to-[#2A1A24]',
  scan: 'from-[#1A2418] to-[#1E2A1E]',
}

export default function MediaCard({ item, onPlay, onDelete, onRename }: MediaCardProps) {
  const [hovered, setHovered] = useState(false)

  const icon = getExtensionIcon(item.extension)
  const isVideo = item.media_type === 'video'
  const PlayIcon = isVideo ? Play : Eye
  const gradient = THUMB_GRADIENTS[item.media_type] ?? 'from-vault-surface to-vault-card'

  return (
    <div
      className="group relative flex flex-col"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Vignette */}
      <div
        className={clsx(
          'relative overflow-hidden rounded-lg border transition-all duration-200',
          hovered
            ? 'border-vault-accent/40 scale-[1.02] shadow-lg shadow-vault-accent/10'
            : 'border-vault-border',
        )}
        style={{ aspectRatio: '16/9' }}
      >
        {/* Fond dégradé propre à chaque type */}
        <div className={clsx('absolute inset-0 bg-gradient-to-br', gradient)} />

        {/* Icône centrale */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl opacity-20 select-none">{icon}</span>
        </div>

        {/* Badge "enc" — rappel visuel que le fichier est chiffré */}
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded border border-vault-border bg-black/60 px-1.5 py-0.5">
          <div className="h-1.5 w-1.5 rounded-full bg-vault-success" />
          <span className="font-mono text-[9px] text-vault-muted">enc</span>
        </div>

        {/* Badge extension */}
        <div className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5">
          <span className="font-mono text-[9px] uppercase text-vault-dim">
            {item.extension.replace('.', '')}
          </span>
        </div>

        {/* Overlay d'actions au survol */}
        <div
          className={clsx(
            'absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity duration-200',
            hovered ? 'opacity-100' : 'opacity-0',
          )}
        >
          {/* Bouton principal : lire / voir */}
          <button
            onClick={() => onPlay(item)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-vault-accent shadow-lg transition-transform hover:scale-110"
            aria-label={isVideo ? `Lire ${item.title}` : `Voir ${item.title}`}
          >
            <PlayIcon size={16} className="text-white" />
          </button>

          {/* Actions secondaires */}
          <div className="absolute bottom-2 right-2 flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onRename(item) }}
              className="flex h-6 w-6 items-center justify-center rounded bg-vault-card/80 text-vault-muted hover:text-vault-text transition-colors"
              aria-label="Renommer"
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(item) }}
              className="flex h-6 w-6 items-center justify-center rounded bg-vault-card/80 text-vault-muted hover:text-red-400 transition-colors"
              aria-label="Supprimer"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* Métadonnées sous la vignette */}
      <div className="mt-2 min-w-0">
        <p className="truncate text-xs font-medium text-vault-text" title={item.title}>
          {item.title}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-vault-dim">
          {formatBytes(item.size_bytes)}
          {item.duration_seconds ? ` · ${formatDuration(item.duration_seconds)}` : ''}
        </p>
      </div>
    </div>
  )
}
