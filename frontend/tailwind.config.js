/** @type {import('tailwindcss').Config} */
export default {
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
          600: '#1e3a5f',
          700: '#16294a',
          800: '#0f1f3d',
          900: '#0a1628',
        },
        teal: {
          500: '#2bb3a3',
          600: '#1e9a8c',
          700: '#178478',
        },
        mind: '#e8f7f0',
        cream: '#faf9f5',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
