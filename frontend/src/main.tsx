import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from 'react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'

// QueryClient avec retry limité : on ne réessaie pas les erreurs 4xx
// (auth, validation) car elles ne seront pas résolues par un retry.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.response?.status >= 400 && error?.response?.status < 500) return false
        return failureCount < 2
      },
      staleTime: 30_000, // 30 secondes avant de re-fetcher
      refetchOnWindowFocus: false,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#161618',
            color: '#E8E8E8',
            border: '1px solid #1E1E22',
            fontFamily: 'Inter, sans-serif',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: '#27AE60', secondary: '#161618' } },
          error: { iconTheme: { primary: '#C0392B', secondary: '#161618' } },
        }}
      />
    </QueryClientProvider>
  </React.StrictMode>,
)
