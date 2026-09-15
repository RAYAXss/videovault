/**
 * HomePage — Vue principale du vault.
 *
 * Orchestration :
 *   - useQuery('media') : liste paginée des fichiers via react-query.
 *   - États locaux pour les modales : un seul item actif à la fois (selectedItem).
 *   - Le mot de passe n'est jamais stocké dans un état React persistant :
 *     il vit uniquement dans PasswordModal pendant la saisie, puis est passé
 *     directement à handleDecrypt, puis disparaît.
 *   - blobUrl : URL Blob créée après déchiffrement, révoquée à la fermeture
 *     du PlayerModal (voir PlayerModal.tsx).
 */

import { useState, useCallback } from 'react'
import { useQuery } from 'react-query'
import { Search, Upload, ArrowUpDown, SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'

import { mediaApi } from '@/api'
import { useAuth } from '@/hooks/useAuth'
import { createBlobUrl } from '@/utils'
import type { MediaItem, MediaType, SortField } from '@/types'

import Sidebar from '@/components/layout/Sidebar'
import MediaGrid from '@/components/media/MediaGrid'
import MediaCard from '@/components/media/MediaCard'
import PasswordModal from '@/components/media/PasswordModal'
import PlayerModal from '@/components/media/PlayerModal'
import UploadModal from '@/components/media/UploadModal'
import RenameModal from '@/components/media/RenameModal'
import DeleteModal from '@/components/media/DeleteModal'
import StatsBar from '@/components/ui/StatsBar'
import EmptyState from '@/components/ui/EmptyState'
import Pagination from '@/components/ui/Pagination'

type ModalState =
  | { type: 'upload' }
  | { type: 'password'; item: MediaItem }
  | { type: 'player'; item: MediaItem; blobUrl: string }
  | { type: 'rename'; item: MediaItem }
  | { type: 'delete'; item: MediaItem }
  | null

export default function HomePage() {
  const { user } = useAuth()

  // ── Filtres & tri ────────────────────────────────────────────────────────
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<MediaType | null>(null)
  const [sortBy, setSortBy] = useState<SortField>('created_at')
  const [descending, setDescending] = useState(true)
  const [page, setPage] = useState(1)

  // ── Modale active ────────────────────────────────────────────────────────
  const [modal, setModal] = useState<ModalState>(null)
  const [decrypting, setDecrypting] = useState(false)

  // ── Données ───────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery(
    ['media', { search, filterType, sortBy, descending, page }],
    () =>
      mediaApi.list({
        search: search || undefined,
        media_type: filterType ?? undefined,
        sort_by: sortBy,
        descending,
        page,
        per_page: 24,
      }).then((r) => r.data),
    { keepPreviousData: true },
  )

  // ── Actions ───────────────────────────────────────────────────────────────

  const handlePlay = useCallback((item: MediaItem) => {
    setModal({ type: 'password', item })
  }, [])

  const handleDecrypt = useCallback(async (password: string) => {
    if (modal?.type !== 'password') return
    const { item } = modal
    setDecrypting(true)
    try {
      const res = await mediaApi.stream(item.id, password)
      const blobUrl = createBlobUrl(res.data)
      setModal({ type: 'player', item, blobUrl })
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Mot de passe incorrect ou fichier corrompu.'
      toast.error(msg)
    } finally {
      setDecrypting(false)
    }
  }, [modal])

  const toggleSort = (field: SortField) => {
    if (sortBy === field) setDescending((d) => !d)
    else { setSortBy(field); setDescending(true) }
    setPage(1)
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const closeModal = () => setModal(null)

  const recentItems = data?.items.slice(0, 6) ?? []
  const hasResults = (data?.total ?? 0) > 0

  return (
    <div className="flex h-screen overflow-hidden bg-vault-bg">
      {/* Sidebar */}
      <Sidebar activeFilter={filterType} onFilterChange={(f) => { setFilterType(f); setPage(1) }} />

      {/* Contenu principal */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-3 border-b border-vault-border bg-vault-bg px-5 py-3">
          <h1 className="text-sm font-semibold text-vault-text">
            {filterType
              ? { video: 'Vidéos', scan: 'Scans', document: 'Documents' }[filterType]
              : 'Médiathèque'}
          </h1>

          {/* Tri rapide */}
          <div className="flex items-center gap-1">
            {(['created_at', 'title', 'size_bytes'] as SortField[]).map((field) => {
              const labels: Record<string, string> = {
                created_at: 'Date',
                title: 'Titre',
                size_bytes: 'Taille',
              }
              return (
                <button
                  key={field}
                  onClick={() => toggleSort(field)}
                  className={clsx(
                    'flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors',
                    sortBy === field
                      ? 'bg-vault-hover text-vault-text'
                      : 'text-vault-dim hover:text-vault-muted',
                  )}
                >
                  {labels[field]}
                  {sortBy === field && (
                    <ArrowUpDown size={9} className={descending ? 'rotate-0' : 'rotate-180'} />
                  )}
                </button>
              )
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Recherche */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-vault-dim" />
              <input
                type="search"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-48 rounded-lg border border-vault-border bg-vault-surface py-1.5 pl-7 pr-3 text-xs text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors"
              />
            </div>

            {/* Bouton upload */}
            <button
              onClick={() => setModal({ type: 'upload' })}
              className="flex items-center gap-1.5 rounded-lg bg-vault-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-vault-accent-hover transition-colors"
            >
              <Upload size={12} />
              Ajouter
            </button>
          </div>
        </header>

        {/* Scroll area */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Stats */}
          <StatsBar data={data} loading={isLoading} />

          {hasResults || isLoading ? (
            <div className="mt-5 flex flex-col gap-8">
              {/* Section "Récemment ajoutés" (première page, pas de filtre) */}
              {!search && !filterType && page === 1 && recentItems.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-medium text-vault-text">Récemment ajoutés</h2>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                    {isLoading
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="flex flex-col gap-2">
                            <div className="shimmer rounded-lg" style={{ aspectRatio: '16/9' }} />
                            <div className="shimmer h-2.5 w-3/4 rounded" />
                          </div>
                        ))
                      : recentItems.map((item) => (
                          <MediaCard
                            key={item.id}
                            item={item}
                            onPlay={handlePlay}
                            onDelete={(i) => setModal({ type: 'delete', item: i })}
                            onRename={(i) => setModal({ type: 'rename', item: i })}
                          />
                        ))}
                  </div>
                </section>
              )}

              {/* Grille principale */}
              <section>
                {(!search && !filterType && page === 1) && (
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-medium text-vault-text">
                      {filterType ? '' : 'Tous les fichiers'}
                    </h2>
                  </div>
                )}
                <MediaGrid
                  items={data?.items ?? []}
                  loading={isLoading}
                  onPlay={handlePlay}
                  onDelete={(i) => setModal({ type: 'delete', item: i })}
                  onRename={(i) => setModal({ type: 'rename', item: i })}
                />
              </section>

              {/* Pagination */}
              <Pagination
                page={page}
                total={data?.total ?? 0}
                perPage={data?.per_page ?? 24}
                onChange={setPage}
              />
            </div>
          ) : (
            <div className="mt-5">
              <EmptyState hasSearch={!!search} onUpload={() => setModal({ type: 'upload' })} />
            </div>
          )}
        </div>
      </main>

      {/* ── Modales ─────────────────────────────────────────────────────── */}
      {modal?.type === 'upload' && (
        <UploadModal onClose={closeModal} />
      )}
      {modal?.type === 'password' && (
        <PasswordModal
          item={modal.item}
          onConfirm={handleDecrypt}
          onClose={closeModal}
          loading={decrypting}
        />
      )}
      {modal?.type === 'player' && (
        <PlayerModal
          item={modal.item}
          blobUrl={modal.blobUrl}
          onClose={closeModal}
        />
      )}
      {modal?.type === 'rename' && (
        <RenameModal item={modal.item} onClose={closeModal} />
      )}
      {modal?.type === 'delete' && (
        <DeleteModal item={modal.item} onClose={closeModal} />
      )}
    </div>
  )
}
