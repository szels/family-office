import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted (not loaded from Google's CDN): avoids sending every
// visitor's IP to Google on a page whose whole premise is "all data stays
// local" — Google Fonts' default CDN delivery was ruled a GDPR violation
// by LG München in 2022 for exactly this reason.
import '@fontsource/spectral/400.css'
import '@fontsource/spectral/500.css'
import '@fontsource/spectral/600.css'
import '@fontsource/spectral/400-italic.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
