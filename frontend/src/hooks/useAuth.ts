import { useQuery, useQueryClient } from 'react-query'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authApi } from '@/api'
import type { User } from '@/types'

export function useAuth() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: user, isLoading } = useQuery<User | null>(
    'currentUser',
    async () => {
      try {
        const res = await authApi.me()
        return res.data
      } catch {
        return null
      }
    },
    {
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
  )

  const login = async (username: string, password: string) => {
    const res = await authApi.login(username, password)
    queryClient.setQueryData('currentUser', res.data.user)
    navigate('/')
  }

  const register = async (username: string, password: string) => {
    const res = await authApi.register(username, password)
    queryClient.setQueryData('currentUser', res.data.user)
    navigate('/')
  }

  const logout = async () => {
    await authApi.logout()
    queryClient.clear()
    navigate('/login')
    toast.success('Déconnecté.')
  }

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login,
    register,
    logout,
  }
}
