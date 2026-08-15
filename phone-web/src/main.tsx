import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { applyTheme, loadLang, loadTheme, saveLang } from './prefs.ts'
import './styles.css'

applyTheme(loadTheme())
saveLang(loadLang())

const root = document.getElementById('root')
if (!root) {
  throw new Error('missing #root')
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
