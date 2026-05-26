/**
 * Frontend entrypoint that mounts React into `#root`.
 * Wraps the app with `BrowserRouter` and `AuthProvider` so routing and auth state are globally available.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App'
import { AuthProvider } from './auth'

// Initialize the React root and render the app within routing + auth providers.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)
