import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { OfflineProvider } from './offline/OfflineContext'

// Apply saved accessibility settings before render
const font = localStorage.getItem('neuronest_font') || 'medium'
document.body.classList.add(`font-${font}`)
if (localStorage.getItem('neuronest_contrast') === 'on') {
  document.body.classList.add('high-contrast')
}

// Register service worker for PWA / offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* SW registration failed — app still works without it */
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <OfflineProvider>
        <App />
      </OfflineProvider>
    </BrowserRouter>
  </React.StrictMode>
)
