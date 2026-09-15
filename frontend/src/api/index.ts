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
   * Upload d'un fichier chiffré.
   * Le mot de passe est envoyé dans un FormData (corps de requête POST HTTPS),
   * jamais dans l'URL ou les headers visibles.
   */
  upload: (file: File, password: string, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    form.append('password', password)
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
   * Stream d'un fichier déchiffré.
   * POST (et non GET) pour que le mot de passe passe dans le corps, pas dans l'URL.
   * responseType: 'blob' → le navigateur reçoit les bytes et peut les lire
   * avec URL.createObjectURL().
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
