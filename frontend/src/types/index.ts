export type MediaType = 'video' | 'scan' | 'document'

export type SortField = 'title' | 'created_at' | 'size_bytes' | 'duration_seconds'

export interface User {
  id: number
  username: string
  is_admin: boolean
}

export interface MediaItem {
  id: number
  title: string
  original_filename: string
  extension: string
  media_type: MediaType
  size_bytes: number
  duration_seconds: number | null
  created_at: string
  updated_at: string
}

export interface MediaListResponse {
  items: MediaItem[]
  total: number
  page: number
  per_page: number
}

export interface AuthResponse {
  user: User
  message: string
}
