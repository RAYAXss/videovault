/**
 * UploadModal — Import d'un fichier avec chiffrement optionnel + import via URL.
 *
 * Deux onglets :
 *  - "Depuis un fichier" : drag-and-drop classique, chiffrement optionnel
 *  - "Depuis une URL"   : YouTube/Vimeo/etc. via yt-dlp côté backend
 *
 * Chiffrement optionnel :
 *  Si l'utilisateur désactive le chiffrement, le fichier est envoyé en clair.
 *  Un avertissement visible informe que le fichier sera lisible par l'hébergeur.
 */

import { useState, useCallback, type FormEvent } from 'react'
import { useDropzone } from 'react-dropzone'
import {
  Upload, X, Lock, Eye, EyeOff, File, CheckCircle,
  Link2, AlertTriangle, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { useQueryClient } from 'react-query'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { mediaApi } from '@/api'
import { formatBytes } from '@/utils'
import { useSettingsCtx } from '@/context/SettingsContext'

const ALLOWED_MIME_TYPES = [
  'video/mp4', 'video/x-matroska', 'video/x-msvideo', 'video/quicktime', 'video/webm',
  'application/pdf',
  'image/png', 'image/jpeg', 'image/tiff', 'image/webp',
]

type UploadTab = 'file' | 'url'

interface UploadModalProps {
  onClose: () => void
}

export default function UploadModal({ onClose }: UploadModalProps) {
  const { t } = useSettingsCtx()
  const queryClient = useQueryClient()

  const [tab, setTab] = useState<UploadTab>('file')

  // File tab state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [encrypt, setEncrypt] = useState(true)
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)

  // URL tab state
  const [url, setUrl] = useState('')
  const [urlEncrypt, setUrlEncrypt] = useState(true)
  const [urlPassword, setUrlPassword] = useState('')
  const [urlShowPwd, setUrlShowPwd] = useState(false)
  const [urlFetching, setUrlFetching] = useState(false)
  const [urlDone, setUrlDone] = useState(false)

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setSelectedFile(accepted[0])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ALLOWED_MIME_TYPES.reduce((acc, type) => ({ ...acc, [type]: [] }), {}),
    maxFiles: 1,
    maxSize: 4 * 1024 * 1024 * 1024,
    disabled: uploading || done,
  })

  const handleUpload = async () => {
    if (!selectedFile) return
    if (encrypt && password.length < 8) return
    setUploading(true)
    setProgress(0)
    try {
      await mediaApi.upload(selectedFile, encrypt ? password : null, (pct) => setProgress(pct))
      setDone(true)
      queryClient.invalidateQueries('media')
      toast.success(`« ${selectedFile.name} » ${encrypt ? 'chiffré et ' : ''}ajouté au vault.`)
      setTimeout(onClose, 1200)
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? 'Erreur lors de l\'envoi.'
      toast.error(msg)
      setUploading(false)
    }
  }

  const handleUrlImport = async (e: FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    if (urlEncrypt && urlPassword.length < 8) return
    setUrlFetching(true)
    try {
      await mediaApi.importUrl(url.trim(), urlEncrypt ? urlPassword : null)
      setUrlDone(true)
      queryClient.invalidateQueries('media')
      toast.success(t('toast_url_done'))
      setTimeout(onClose, 1200)
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? t('toast_url_err')
      toast.error(msg)
    } finally {
      setUrlFetching(false)
    }
  }

  const canUpload = selectedFile && (!encrypt || password.length >= 8) && !uploading
  const canImportUrl = url.trim().length > 0 && (!urlEncrypt || urlPassword.length >= 8) && !urlFetching

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget && !uploading && !urlFetching) onClose() }}
      role="dialog"
      aria-modal="true"
    >
      <div className="vault-card w-full max-w-md animate-slide-up mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-vault-border px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-vault-text">{t('upload_title')}</h2>
            <p className="mt-0.5 text-xs text-vault-muted">
              {tab === 'file'
                ? (encrypt ? t('upload_subtitle_enc') : t('upload_subtitle_plain'))
                : (urlEncrypt ? t('upload_subtitle_enc') : t('upload_subtitle_plain'))}
            </p>
          </div>
          {!uploading && !urlFetching && (
            <button onClick={onClose} className="rounded p-1 text-vault-dim hover:text-vault-text">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-vault-border">
          <button
            onClick={() => setTab('file')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
              tab === 'file'
                ? 'border-b-2 border-vault-accent text-vault-text'
                : 'text-vault-muted hover:text-vault-text',
            )}
          >
            <Upload size={12} />
            {t('upload_file_tab')}
          </button>
          <button
            onClick={() => setTab('url')}
            className={clsx(
              'flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors',
              tab === 'url'
                ? 'border-b-2 border-vault-accent text-vault-text'
                : 'text-vault-muted hover:text-vault-text',
            )}
          >
            <Link2 size={12} />
            {t('upload_url_tab')}
          </button>
        </div>

        <div className="p-5 flex flex-col gap-3">
          {tab === 'file' && (
            <>
              {/* Dropzone */}
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
                        {isDragActive ? t('upload_drag_active') : t('upload_dropzone')}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-vault-dim">
                        mp4 · mkv · avi · mov · webm · pdf · png · jpg · tiff
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Encrypt toggle */}
              <EncryptToggle
                value={encrypt}
                onChange={setEncrypt}
                label={t('upload_encrypt_toggle')}
                warning={t('upload_encrypt_warning')}
                disabled={uploading || done}
              />

              {/* Password (only if encrypt) */}
              {encrypt && (
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  show={showPwd}
                  onToggleShow={() => setShowPwd(v => !v)}
                  label={t('upload_pwd_label')}
                  hint={t('upload_pwd_hint')}
                  disabled={uploading || done}
                  placeholder="••••••••"
                />
              )}

              {/* Progress */}
              {uploading && (
                <ProgressBar
                  progress={progress}
                  done={done}
                  labelDone={t('upload_progress_done')}
                  labelProgress={encrypt ? t('upload_progress_enc') : t('upload_progress_plain')}
                />
              )}

              {/* Actions */}
              {done ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-vault-success/10 py-2.5 text-sm text-vault-success">
                  <CheckCircle size={16} />
                  {t('upload_added')}
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={onClose}
                    disabled={uploading}
                    className="flex-1 rounded-lg border border-vault-border py-2 text-xs text-vault-muted hover:text-vault-text transition-colors disabled:opacity-40"
                  >
                    {t('upload_cancel')}
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!canUpload}
                    className={clsx(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-white transition-colors',
                      !canUpload
                        ? 'cursor-not-allowed bg-vault-accent/40'
                        : 'bg-vault-accent hover:bg-vault-accent-hover',
                    )}
                  >
                    {uploading ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <>{encrypt ? <Lock size={12} /> : <Upload size={12} />} {encrypt ? t('upload_btn_enc') : t('upload_btn_plain')}</>
                    )}
                  </button>
                </div>
              )}
            </>
          )}

          {tab === 'url' && (
            <form onSubmit={handleUrlImport} className="flex flex-col gap-3">
              {/* URL input */}
              <div>
                <label className="mb-1 block text-xs text-vault-muted">{t('upload_url_label')}</label>
                <div className="relative">
                  <Link2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
                  <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder={t('upload_url_placeholder')}
                    disabled={urlFetching || urlDone}
                    className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-3 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors disabled:opacity-50"
                  />
                </div>
                <p className="mt-1 text-[10px] text-vault-dim">{t('upload_url_hint')}</p>
              </div>

              {/* Encrypt toggle */}
              <EncryptToggle
                value={urlEncrypt}
                onChange={setUrlEncrypt}
                label={t('upload_encrypt_toggle')}
                warning={t('upload_encrypt_warning')}
                disabled={urlFetching || urlDone}
              />

              {/* Password */}
              {urlEncrypt && (
                <PasswordField
                  value={urlPassword}
                  onChange={setUrlPassword}
                  show={urlShowPwd}
                  onToggleShow={() => setUrlShowPwd(v => !v)}
                  label={t('upload_pwd_label')}
                  hint={t('upload_pwd_hint')}
                  disabled={urlFetching || urlDone}
                  placeholder="••••••••"
                />
              )}

              {urlDone ? (
                <div className="flex items-center justify-center gap-2 rounded-lg bg-vault-success/10 py-2.5 text-sm text-vault-success">
                  <CheckCircle size={16} />
                  {t('upload_added')}
                </div>
              ) : (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={urlFetching}
                    className="flex-1 rounded-lg border border-vault-border py-2 text-xs text-vault-muted hover:text-vault-text transition-colors disabled:opacity-40"
                  >
                    {t('upload_cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={!canImportUrl}
                    className={clsx(
                      'flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium text-white transition-colors',
                      !canImportUrl
                        ? 'cursor-not-allowed bg-vault-accent/40'
                        : 'bg-vault-accent hover:bg-vault-accent-hover',
                    )}
                  >
                    {urlFetching ? (
                      <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> {t('upload_url_fetching')}</>
                    ) : (
                      <>{urlEncrypt ? <Lock size={12} /> : <Link2 size={12} />} {t('upload_url_fetch')}</>
                    )}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EncryptToggle({
  value, onChange, label, warning, disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  label: string
  warning: string
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className="flex items-center justify-between rounded-lg border border-vault-border bg-vault-surface px-3 py-2.5 transition-colors hover:border-vault-accent/30 disabled:opacity-50"
      >
        <div className="flex items-center gap-2">
          <Lock size={13} className={value ? 'text-vault-accent' : 'text-vault-dim'} />
          <span className="text-xs font-medium text-vault-text">{label}</span>
        </div>
        {value
          ? <ToggleRight size={20} className="text-vault-accent" />
          : <ToggleLeft size={20} className="text-vault-dim" />
        }
      </button>
      {!value && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-[11px] text-amber-300">{warning}</p>
        </div>
      )}
    </div>
  )
}

function PasswordField({
  value, onChange, show, onToggleShow, label, hint, disabled, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  label: string
  hint: string
  disabled?: boolean
  placeholder: string
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-vault-muted">{label}</label>
      <div className="relative">
        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-vault-dim" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="current-password"
          disabled={disabled}
          minLength={8}
          className="w-full rounded-lg border border-vault-border bg-vault-bg py-2 pl-9 pr-9 text-sm text-vault-text placeholder:text-vault-dim focus:border-vault-accent focus:outline-none transition-colors disabled:opacity-50"
        />
        <button type="button" onClick={onToggleShow} className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-dim hover:text-vault-muted" disabled={disabled}>
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-vault-dim">{hint}</p>
    </div>
  )
}

function ProgressBar({
  progress, done, labelDone, labelProgress,
}: {
  progress: number
  done: boolean
  labelDone: string
  labelProgress: string
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between">
        <span className="text-xs text-vault-muted">{done ? labelDone : labelProgress}</span>
        <span className="font-mono text-xs text-vault-muted">{progress}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-vault-border">
        <div
          className="h-full rounded-full bg-vault-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
