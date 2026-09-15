import { ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

interface PaginationProps {
  page: number
  total: number
  perPage: number
  onChange: (page: number) => void
}

export default function Pagination({ page, total, perPage, onChange }: PaginationProps) {
  const totalPages = Math.ceil(total / perPage)
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-center gap-1 pt-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="flex h-7 w-7 items-center justify-center rounded text-vault-muted hover:bg-vault-hover hover:text-vault-text disabled:opacity-30 transition-colors"
      >
        <ChevronLeft size={14} />
      </button>

      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={clsx(
              'flex h-7 w-7 items-center justify-center rounded font-mono text-xs transition-colors',
              p === page
                ? 'bg-vault-accent text-white'
                : 'text-vault-muted hover:bg-vault-hover hover:text-vault-text',
            )}
          >
            {p}
          </button>
        )
      })}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="flex h-7 w-7 items-center justify-center rounded text-vault-muted hover:bg-vault-hover hover:text-vault-text disabled:opacity-30 transition-colors"
      >
        <ChevronRight size={14} />
      </button>

      <span className="ml-2 font-mono text-[10px] text-vault-dim">
        {total} fichier{total !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
