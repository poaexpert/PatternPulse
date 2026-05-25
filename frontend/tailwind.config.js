/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          bg: '#0a0b0e',
          card: '#111318',
          border: '#1e2028',
          'border-light': '#2d303e',
          'text-primary': '#e2e8f0',
          'text-secondary': '#64748b',
          'text-muted': '#475569',
          green: '#10b981',
          'green-bright': '#22c55e',
          'green-dim': '#064e3b',
          red: '#ef4444',
          'red-dim': '#7f1d1d',
          yellow: '#f59e0b',
          'yellow-dim': '#78350f',
          cyan: '#06b6d4',
          'cyan-dim': '#164e63',
          purple: '#8b5cf6',
          'purple-dim': '#3b0764',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'pulse-green': 'pulse-green 1s ease-in-out 3',
        'pulse-red': 'pulse-red 1s ease-in-out 3',
        'ticker': 'ticker 30s linear infinite',
        'flash-green': 'flash-green 0.5s ease-out',
        'flash-red': 'flash-red 0.5s ease-out',
        'spin-slow': 'spin 2s linear infinite',
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        'pulse-green': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)' },
          '50%': { boxShadow: '0 0 0 4px rgba(16, 185, 129, 0.2)' },
        },
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0)' },
          '50%': { boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.2)' },
        },
        'ticker': {
          'from': { transform: 'translateX(0)' },
          'to': { transform: 'translateX(-50%)' },
        },
        'flash-green': {
          'from': { color: '#10b981' },
          'to': { color: 'inherit' },
        },
        'flash-red': {
          'from': { color: '#ef4444' },
          'to': { color: 'inherit' },
        },
        'fadeIn': {
          'from': { opacity: '0' },
          'to': { opacity: '1' },
        },
        'slideUp': {
          'from': { transform: 'translateY(10px)', opacity: '0' },
          'to': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
