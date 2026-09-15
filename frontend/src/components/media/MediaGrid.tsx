import MediaCard from './MediaCard'
import type { MediaItem } from '@/types'

interface MediaGridProps {
  items: MediaItem[]
  loading?: boolean
  onPlay: (item: MediaItem) => void
  onDelete: (item: MediaItem) => void
  onRename: (item: MediaItem) => void
}

function SkeletonCard() {
  return (
    <div className="flex flex-col gap-2">
      <div className="shimmer rounded-lg" style={{ aspectRatio: '16/9' }} />
      <div className="shimmer h-3 w-3/4 rounded" />
      <div className="shimmer h-2.5 w-1/2 rounded" />
    </div>
  )
}

export default function MediaGrid({ items, loading, onPlay, onDelete, onRename }: MediaGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {items.map((item) => (
        <MediaCard
          key={item.id}
          item={item}
          onPlay={onPlay}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  )
}
