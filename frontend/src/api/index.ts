import { api } from './client'
import type { AuthResponse, MediaItem, MediaListResponse, SortField, MediaType, User } from '@/types'

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/login', { username, password }),

  register: (username: string, password: string) =>
    api.post<AuthResponse>('/auth/register', { username, password }),

  logout: () => api.post('/auth/logout'),

  me: () => api.get<User>('/auth/me'),

  refresh: () => api.post('/auth/refresh'),

  changePassword: (current_password: string, new_password: string) =>
    api.post('/auth/change-password', { current_password, new_password }),

  updateEmail: (email: string) =>
    api.patch('/auth/email', { email }),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }),
}

// ── Media ─────────────────────────────────────────────────────────────────────

export const mediaApi = {
  list: (params: {
    search?: string
    media_type?: MediaType
    sort_by?: SortField
    descending?: boolean
    page?: number
    per_page?: number
  }) => api.get<MediaListResponse>('/media', { params }),

  /**
   * Upload d'un fichier.
   * password = null → stockage sans chiffrement (l'utilisateur a été averti).
   * password = string → chiffrement AES-256-GCM.
   */
  upload: (file: File, password: string | null, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    if (password !== null) {
      form.append('password', password)
      form.append('encrypted', 'true')
    } else {
      form.append('encrypted', 'false')
    }
    return api.post<MediaItem>('/media/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total))
        }
      },
    })
  },

  /**
   * Import depuis une URL externe (YouTube, Vimeo, etc.) via yt-dlp backend.
   * password = null → pas de chiffrement.
   */
  importUrl: (url: string, password: string | null) => {
    return api.post<MediaItem>('/media/import-url', {
      url,
      password: password ?? null,
      encrypted: password !== null,
    })
  },

  /**
   * Stream / déchiffrement.
   * Si le fichier n'est pas chiffré, password est ignoré côté backend.
   */
  stream: (mediaId: number, password: string) => {
    const form = new FormData()
    form.append('password', password)
    return api.post<Blob>(`/media/${mediaId}/stream`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
    })
  },

  rename: (mediaId: number, title: string) =>
    api.patch<MediaItem>(`/media/${mediaId}/title`, { title }),

  delete: (mediaId: number) =>
    api.delete(`/media/${mediaId}`),
}
