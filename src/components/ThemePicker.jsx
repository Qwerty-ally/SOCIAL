import { useState } from 'react'
import { Palette, Check } from 'lucide-react'
import { useTheme, themes } from '../context/ThemeContext'

const darkThemes = Object.entries(themes).filter(([, t]) => t.type === 'dark')
const lightThemes = Object.entries(themes).filter(([, t]) => t.type === 'light')

export default function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-slate-400 hover:text-white hover:bg-slate-800 w-full"
      >
        <Palette size={22} />
        Theme
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-full bottom-0 ml-2 bg-[#1e293b] border border-slate-700 rounded-2xl shadow-2xl z-50 p-4 w-64">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Dark Themes</p>
            <div className="grid grid-cols-1 gap-1 mb-4">
              {darkThemes.map(([id, t]) => (
                <ThemeRow key={id} id={id} t={t} active={theme === id} onSelect={() => { setTheme(id); setOpen(false) }} />
              ))}
            </div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-3">Pastel Themes</p>
            <div className="grid grid-cols-1 gap-1">
              {lightThemes.map(([id, t]) => (
                <ThemeRow key={id} id={id} t={t} active={theme === id} onSelect={() => { setTheme(id); setOpen(false) }} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ThemeRow({ id, t, active, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition text-left w-full ${active ? 'bg-slate-700' : 'hover:bg-slate-700/50'}`}
    >
      <div className="w-5 h-5 rounded-full border-2 border-white/20 shrink-0" style={{ background: t.bg, boxShadow: `inset 0 0 0 2px ${t.accent}` }} />
      <span className="text-sm text-white flex-1">{t.emoji} {t.name}</span>
      {active && <Check size={14} className="text-sky-400 shrink-0" />}
    </button>
  )
}
