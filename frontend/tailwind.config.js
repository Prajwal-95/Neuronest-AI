/** @type {import('tailwindcss').Config} */
export default {
  // Class-based dark mode: the `.dark` class is toggled on <html> by
  // services/theme.js, so `dark:` variants and the `.dark .card` overrides in
  // index.css both activate together.
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef4fb',
          100: '#d9e6f5',
          200: '#b8d1ea',
          300: '#8bb5da',
          400: '#5e97c8',
          500: '#3a7ab5',
          600: '#1e3a5f',
          700: '#16294a',
          800: '#0f1f3d',
          900: '#0a1628',
          950: '#060e1a',
        },
        teal: {
          50: '#e8f7f0',
          100: '#c8efe1',
          200: '#a3e5d1',
          300: '#6dd5b9',
          400: '#3cc3a0',
          500: '#2bb3a3',
          600: '#1e9a8c',
          700: '#178478',
          800: '#136b62',
          900: '#0f5750',
        },
        mint: {
          50: '#f0fdf9',
          100: '#d1fae5',
          200: '#a7f3d0',
        },
        mind: '#e8f7f0',
        cream: '#faf9f5',
        surface: {
          light: '#ffffff',
          warm: '#fdfcf9',
          cool: '#f7f9fc',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass': '0 8px 32px -4px rgba(15, 31, 61, 0.08), 0 2px 8px -2px rgba(15, 31, 61, 0.04)',
        'glass-lg': '0 16px 48px -8px rgba(15, 31, 61, 0.12), 0 4px 12px -2px rgba(15, 31, 61, 0.06)',
        'glow-teal': '0 0 24px -4px rgba(43, 179, 163, 0.35)',
        'glow-teal-lg': '0 0 40px -8px rgba(43, 179, 163, 0.4)',
        'card-hover': '0 20px 60px -12px rgba(15, 31, 61, 0.2), 0 8px 20px -6px rgba(15, 31, 61, 0.08)',
        'inner-glow': 'inset 0 1px 2px rgba(43, 179, 163, 0.15)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      animation: {
        'float': 'nx-float 5s ease-in-out infinite',
        'glow-pulse': 'nx-glow 3s ease-in-out infinite',
        'shimmer': 'nx-shimmer 2.4s linear infinite',
        'spin-slow': 'spin 8s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
