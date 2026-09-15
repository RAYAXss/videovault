import type { Config } from 'tailwindcss'

// Palette personnalisée : on n'utilise pas la palette Tailwind par défaut
// pour s'assurer que tous les éléments visuels sont cohérents avec le thème
// coffre-fort sombre de VideoVault.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        vault: {
          bg:      '#0D0D0F',   // Fond absolu — noir profond
          surface: '#111113',   // Surface principale (sidebar, cards)
          card:    '#161618',   // Cards et inputs
          border:  '#1E1E22',   // Bordures subtiles
          hover:   '#1A1A1E',   // Survol
          text:    '#E8E8E8',   // Texte principal
          muted:   '#6B6B7B',   // Texte secondaire
          dim:     '#4A4A55',   // Texte tertiaire
          accent:  '#C0392B',   // Rouge primaire (boutons, accents)
          'accent-hover': '#A93226', // Rouge survol
          'accent-dim':   '#C0392B22', // Rouge transparent
          success: '#27AE60',  // Vert pour les indicateurs
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}

export default config
