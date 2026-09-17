import { formatBytes } from '@/utils'
import type { MediaListResponse } from '@/types'
import { useSettingsCtx } from '@/context/SettingsContext'

interface StatsBarProps {
  data?: MediaListResponse
  loading?: boolean
}

export default function StatsBar({ data, loading }: StatsBarProps) {
  const { t } = useSettingsCtx()

  const stats = [
    {
      value: loading ? '—' : data?.total.toString() ?? '0',
      label: t('stats_encrypted'),
    },
    {
      value: loading ? '—' : formatBytes(
        data?.items.reduce((acc, i) => acc + i.size_bytes, 0) ?? 0
      ),
      label: t('stats_in_view'),
    },
    { value: 'AES-256', label: 'GCM · PBKDF2' },
    { value: 'httpOnly', label: 'cookies JWT' },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map(({ value, label }) => (
        <div key={label} className="rounded-lg border border-vault-border bg-vault-surface px-3 py-2.5">
          <div className="font-mono text-base font-semibold text-vault-text">{value}</div>
          <div className="mt-0.5 text-[10px] text-vault-dim">{label}</div>
        </div>
      ))}
    </div>
  )
}
