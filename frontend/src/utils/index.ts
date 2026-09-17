import type { MediaType } from '@/types'

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 o'
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function formatDuration(seconds: number | null): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function getMediaTypeLabel(type: MediaType): string {
  return { video: 'Vidéo', scan: 'Scan', document: 'Document' }[type] ?? type
}

export function getExtensionIcon(extension: string): string {
  const videoExts = ['.mp4', '.mkv', '.avi', '.mov', '.webm']
  if (videoExts.includes(extension)) return '🎬'
  if (extension === '.pdf') return '📄'
  return '🖼'
}

export function createBlobUrl(blob: Blob): string {
  return URL.createObjectURL(blob)
}

export function revokeBlobUrl(url: string): void {
  URL.revokeObjectURL(url)
}

export function maskPassword(password: string): string {
  return password.slice(0, 2) + '•'.repeat(Math.max(0, password.length - 2))
}
