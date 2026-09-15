/**
 * client.ts — Instance Axios configurée pour VideoVault.
 *
 * withCredentials: true est REQUIS pour que le navigateur envoie automatiquement
 * les cookies httpOnly avec chaque requête. Sans cela, les cookies seraient ignorés
 * même s'ils sont présents.
 *
 * Intercepteur de réponse :
 *   Sur une 401, on tente un refresh silencieux du token d'accès.
 *   Si le refresh échoue, on redirige vers /login.
 *   Ce pattern "transparent token refresh" évite de demander le mot de passe
 *   à l'utilisateur toutes les 15 minutes.
 */

import axios, { AxiosError } from 'axios'

export const api = axios.create({
  baseURL: '/api',
  // CRITIQUE : envoie les cookies httpOnly avec chaque requête.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

let isRefreshing = false
let failedQueue: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }> = []

function processQueue(error: AxiosError | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(undefined)
  })
  failedQueue = []
}

// Intercepteur : refresh automatique sur 401.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any

    // Ne pas boucler sur les appels /refresh et /login eux-mêmes.
    if (
      error.response?.status === 401 &&
        !originalRequest._retry &&
        !originalRequest.url?.includes('/auth/refresh') &&
        !originalRequest.url?.includes('/auth/login') &&
        !originalRequest.url?.includes('/auth/me')
      ) {
      if (isRefreshing) {
        // Mettre en file d'attente les requêtes qui arrivent pendant le refresh.
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(() => api(originalRequest))
      }

      originalRequest._retry = true
      isRefreshing = true

      try {
        await api.post('/auth/refresh')
        processQueue(null)
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError as AxiosError)
        // Refresh échoué → session expirée, redirection vers login.
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  },
)
