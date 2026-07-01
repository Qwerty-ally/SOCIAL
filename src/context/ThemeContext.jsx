import { createContext, useContext, useState, useEffect } from 'react'

export const themes = {
  midnight:       { name: 'Midnight',     emoji: '🌙', type: 'dark',  bg: '#0f172a', surface: '#1e293b', surfaceHover: '#243044', border: '#334155', text: '#f8fafc', textMuted: '#94a3b8', accent: '#0ea5e9', accentHover: '#38bdf8' },
  obsidian:       { name: 'Obsidian',     emoji: '🖤', type: 'dark',  bg: '#000000', surface: '#111111', surfaceHover: '#1c1c1c', border: '#282828', text: '#ffffff',  textMuted: '#888888', accent: '#8b5cf6', accentHover: '#a78bfa' },
  forest:         { name: 'Forest',       emoji: '🌲', type: 'dark',  bg: '#0a1a0a', surface: '#122212', surfaceHover: '#1a321a', border: '#2d4a2d', text: '#ecfdf5', textMuted: '#6ee7b7', accent: '#22c55e', accentHover: '#4ade80' },
  crimson:        { name: 'Crimson',      emoji: '🔴', type: 'dark',  bg: '#1a000a', surface: '#2a000e', surfaceHover: '#3a0016', border: '#5c001e', text: '#fff1f2', textMuted: '#fda4af', accent: '#f43f5e', accentHover: '#fb7185' },
  'indigo-night': { name: 'Indigo Night', emoji: '✨', type: 'dark',  bg: '#0e0b1e', surface: '#17133a', surfaceHover: '#221a50', border: '#2d2560', text: '#ede9fe', textMuted: '#a78bfa', accent: '#7c3aed', accentHover: '#8b5cf6' },
  'rose-petal':   { name: 'Rose Petal',   emoji: '🌸', type: 'light', bg: '#fff0f3', surface: '#ffffff', surfaceHover: '#ffe4e8', border: '#fecdd3', text: '#1f0a10', textMuted: '#9f4155', accent: '#f43f5e', accentHover: '#e11d48' },
  'sky-blue':     { name: 'Sky Blue',     emoji: '☁️', type: 'light', bg: '#f0f9ff', surface: '#ffffff', surfaceHover: '#e0f2fe', border: '#bae6fd', text: '#0c1a26', textMuted: '#0369a1', accent: '#0284c7', accentHover: '#0369a1' },
  mint:           { name: 'Mint',         emoji: '🌿', type: 'light', bg: '#f0fdf4', surface: '#ffffff', surfaceHover: '#dcfce7', border: '#bbf7d0', text: '#052e16', textMuted: '#166534', accent: '#16a34a', accentHover: '#15803d' },
  lavender:       { name: 'Lavender',     emoji: '💜', type: 'light', bg: '#faf5ff', surface: '#ffffff', surfaceHover: '#ede9fe', border: '#ddd6fe', text: '#1e1030', textMuted: '#7c3aed', accent: '#7c3aed', accentHover: '#6d28d9' },
  peach:          { name: 'Peach',        emoji: '🍑', type: 'light', bg: '#fff7ed', surface: '#ffffff', surfaceHover: '#ffedd5', border: '#fed7aa', text: '#1c0a00', textMuted: '#c2410c', accent: '#ea580c', accentHover: '#c2410c' },
}

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('anchor-theme') || 'midnight')

  useEffect(() => {
    const t = themes[theme] || themes.midnight
    const root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-theme-type', t.type)
    root.style.setProperty('--bg', t.bg)
    root.style.setProperty('--surface', t.surface)
    root.style.setProperty('--surface-hover', t.surfaceHover)
    root.style.setProperty('--border', t.border)
    root.style.setProperty('--text', t.text)
    root.style.setProperty('--text-muted', t.textMuted)
    root.style.setProperty('--accent', t.accent)
    root.style.setProperty('--accent-hover', t.accentHover)
    localStorage.setItem('anchor-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes, current: themes[theme] || themes.midnight }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
