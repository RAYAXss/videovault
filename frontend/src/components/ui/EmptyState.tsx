import { Lock, Upload } from 'lucide-react'
import { useSettingsCtx } from '@/context/SettingsContext'

interface EmptyStateProps {
  hasSearch: boolean
  onUpload: () => void
}

export default function EmptyState({ hasSearch, onUpload }: EmptyStateProps) {
  const { t } = useSettingsCtx()

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-vault-border bg-vault-surface">
        <Lock size={28} className="text-vault-dim" />
      </div>
      <h3 className="text-sm font-medium text-vault-text">
        {hasSearch ? t('empty_no_results') : t('empty_vault')}
      </h3>
      <p className="mt-1 max-w-xs text-xs text-vault-dim">
        {hasSearch ? t('empty_search_desc') : t('empty_vault_desc')}
      </p>
      {!hasSearch && (
        <button
          onClick={onUpload}
          className="mt-5 flex items-center gap-2 rounded-lg bg-vault-accent px-4 py-2 text-xs font-medium text-white hover:bg-vault-accent-hover transition-colors"
        >
          <Upload size={13} />
          {t('empty_add')}
        </button>
      )}
    </div>
  )
}
