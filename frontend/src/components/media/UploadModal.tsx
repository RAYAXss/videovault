/**
 * UploadModal — Import d'un fichier avec chiffrement côté serveur.
 *
 * Le drag-and-drop utilise react-dropzone qui gère les cas edge
 * (fichiers multiples, types MIME, taille max) proprement.
 *
 * Le mot de passe est requis au moment de l'upload car il sert à dériver
 * la clé AES-256 qui chiffre le fichier. Sans mot de passe, pas de chiffrement.
 * Ce design garantit que même Anthropic/l'hébergeur ne peut pas déchiffrer
 * les fichiers sans le mot de passe de l'utilisateur.
 */

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X, Lock, Eye, EyeOff, File, CheckCircle } from 'lucide-react'
import { useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { mediaApi } from '@/api'
import { formatBytes } from '@/utils'

const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/x-matroska', 'video/x-msvideo', 'video/quicktime', 'video/webm',
  'application/pdf',
  'image/png', 'image/jpeg', 'image/tiff', 'image/webp',
]

interface UploadModalProps {
  onClose: () => void
}

export default function UploadModal({ onClose }: UploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const queryClient = useQueryClient()

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) setSelectedFile(acceptedFiles[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_MIME_TYPES.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxFiles: 1,
    maxSize: 4 * 1024 * 1024 * 1024, // 4 Go
    disabled: uploading || done,
  })

  const handleUpload = async () => {
    if (!selectedFile || password.length < 8) return
    setUploading(true)
    setProgress(0)
    try {
      await mediaApi.upload(selectedFile, password, (pct) => setProgress(pct))
      setDone(true)
      // Invalide le cache react-query pour recharger la liste.
      queryClient.invalidateQueries('media')
      toast.success(`« ${selectedFile.name} » chiffré et ajouté au vault.`)
      setTimeout(onClose, 1200)
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Erreur lors du chiffrement.'
      toast.error(msg)
      setUploading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="vault-card w-full max-w-md p-6 animate-slide-up mx-4">
        {/* Header */}
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-sm font-semibold text-vault-text">Ajouter un fichier</h2>
            <p className="mt-0.5 text-xs text-vault-muted">
              Le fichier sera chiffré en AES-256-GCM avant stockage.
            </p>
          </div>
          {!uploading && (
            <button onClick={onClose} className="rounded p-1 text-vault-dim hover:text-vault-text">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {/* Zone de dépôt */}
          <div
            {...getRootProps()}
            className={clsx(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors',
              isDragActive
                ? 'border-vault-accent bg-vault-accent/5 text-vault-text'
                : selectedFile
                ? 'border-vault-success/40 bg-vault-success/5'
                : 'border-vault-border text-vault-muted hover:border-vault-accent/40 hover:text-vault-text',
              (uploading || done) && 'pointer-events-none opacity-60',
            )}
          >
            <input {...getInputProps()} />
            {selectedFile ? (
              <>
                <File size={24} className="text-vault-success" />
                <div className="text-center">
                  <p className="text-xs font-medium text-vault-text">{selectedFile.name}</p>
                  <p className="font-mono text-[10px] text-vault-dim">{formatBytes(selectedFile.size)}</p>
                </div>
              </>
            ) : (
              <>
                <Upload size={24} />
                <div className="text-center">
                  <p className="text-xs">
                    {isDragActive ? 'Déposez le fichier…' : 'Glissez un fichier ou cliquez'}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-vault-dim">
                    mp4 · mkv · avi · mov · webm · pdf · png · jpg · tiff
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Mot de passe */}
          <div>
            <label className="mb-1 block text-xs text-vault-muted" htmlFor="upload-pwd">
              Mot de passe de chiffrement
            </label>
            <div className="relative">
              <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
              <input
                id="upload-pwd"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={uploading || done}
                minLength={8}
                className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-9 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-dim hover:text-vault-muted"
                disabled={uploading}
              >
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="mt-1 text-[10px] text-vault-dim">
              Ce mot de passe sert à dériver la clé de chiffrement. Il n'est jamais stocké.
            </p>
          </div>

          {/* Barre de progression */}
          {uploading && (
            <div>
              <div className="mb-1 flex justify-between">
                <span className="text-xs text-vault-muted">
                  {done ? 'Chiffrement terminé' : 'Chiffrement en cours…'}
                </span>
                <span className="font-mono text-xs text-vault-muted">{progress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-vault-border">
                <div
                  className="h-full rounded-full bg-vault-accent transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          {done ? (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-vault-success/10 py-2.5 text-sm text-vault-success">
              <CheckCircle size={16} />
              Ajouté au vault
            </div>
          ) : (
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={uploading}
                className="flex-1 rounded-lg border border-vault-border py-2 text-xs text-vault-muted hover:text-vault-text transition-colors disabled:opacity-40"
              >
                Annuler
              </button>
              <button
                onClick={handleUpload}
                disabled={!selectedFile || password.length < 8 || uploading}
                className={clsx(
                  'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-white transition-colors',
                  !selectedFile || password.length < 8 || uploading
                    ? 'cursor-not-allowed bg-vault-accent/40'
                    : 'bg-vault-accent hover:bg-vault-accent-hover',
                )}
              >
                {uploading ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <><Lock size={12} /> Chiffrer et stocker</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
