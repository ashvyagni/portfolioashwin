import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/instrument-serif/400.css'
import '@fontsource/instrument-serif/400-italic.css'
import '@fontsource-variable/inter-tight'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource/tiro-devanagari-sanskrit/400.css'
import '@fontsource/cinzel/600.css'
import '@fontsource/rozha-one/400.css'
import '@fontsource/kalam/400.css'
import '@fontsource/kalam/700.css'
import '@fontsource/reenie-beanie/400.css'
import '@fontsource/zhi-mang-xing/latin-400.css'
import './styles/global.css'
import App from './App'

const lab = new URLSearchParams(location.search).get('lab')

if (import.meta.env.DEV && lab === 'hand') {
  void import('./lab/handLab').then((m) => m.mountHandLab())
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
