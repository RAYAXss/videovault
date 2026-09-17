import { Lock, Film, FileText, Image, Clock, LogOut } from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '@/hooks/useAuth'
import { useSettingsCtx } from '@/context/SettingsContext'
import type { MediaType } from '@/types'

interface SidebarProps {
  activeFilter: MediaType | null
  onFilterChange: (filter: MediaType | null) => void
  onOpenSettings: () => void
}

export default function Sidebar({ activeFilter, onFilterChange, onOpenSettings }: SidebarProps) {
  const { user, logout } = useAuth()
  const { t } = useSettingsCtx()

  const NAV_ITEMS = [
    { label: t('nav_library'), value: null, icon: Lock },
    { label: t('nav_videos'), value: 'video' as MediaType, icon: Film },
    { label: t('nav_documents'), value: 'document' as MediaType, icon: FileText },
    { label: t('nav_scans'), value: 'scan' as MediaType, icon: Image },
  ]

  return (
    <aside className="flex h-full w-48 flex-col border-r border-vault-border bg-vault-surface">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-vault-border px-4 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-vault-accent">
          <Lock size={14} className="text-white" />
        </div>
        <span className="text-sm font-semibold text-vault-text">VideoVault</span>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 p-2 pt-3">
        <span className="mb-1 px-2 text-[10px] uppercase tracking-widest text-vault-dim">
          {t('nav_library')}
        </span>
        {NAV_ITEMS.map(({ label, value, icon: Icon }) => (
          <button
            key={label}
            onClick={() => onFilterChange(value)}
            className={clsx(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-colors',
              activeFilter === value
                ? 'bg-vault-hover text-vault-text'
                : 'text-vault-muted hover:bg-vault-hover hover:text-vault-text',
            )}
          >
            <Icon
              size={14}
              className={activeFilter === value ? 'text-vault-accent' : 'text-vault-dim'}
            />
            {label}
          </button>
        ))}

        <div className="my-2 h-px bg-vault-border" />

        <span className="mb-1 px-2 text-[10px] uppercase tracking-widest text-vault-dim">
          {t('nav_access')}
        </span>
        <button className="flex items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium text-vault-muted hover:bg-vault-hover hover:text-vault-text transition-colors">
          <Clock size={14} className="text-vault-dim" />
          {t('nav_recent')}
        </button>
      </nav>

      {/* User section */}
      <div className="mt-auto p-2">
        <div className="rounded-lg border border-vault-border bg-vault-card p-2.5">
          {/* Click on avatar/username → settings */}
          <button
            onClick={onOpenSettings}
            className="flex w-full items-center gap-2 rounded-md p-1 hover:bg-vault-hover transition-colors"
            title={t('nav_settings')}
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-vault-accent/10 border border-vault-accent/20">
              <span className="font-mono text-[10px] font-semibold text-vault-accent">
                {user?.username.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-xs font-medium text-vault-text">{user?.username}</div>
              <div className="font-mono text-[10px] text-vault-dim">
                {user?.is_admin ? 'admin' : 'user'} · {t('nav_settings')}
              </div>
            </div>
          </button>

          {/* Logout only */}
          <div className="mt-1.5">
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] text-vault-muted hover:bg-vault-hover hover:text-red-400 transition-colors"
            >
              <LogOut size={11} />
              {t('nav_logout')}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
