import { useNavigate } from 'react-router-dom'
import ComposeBox from '../components/ComposeBox'
import { ArrowLeft } from 'lucide-react'

export default function ComposePage() {
  const navigate = useNavigate()
  return (
    <div>
      <div className="sticky top-0 bg-[#0f172a]/90 backdrop-blur border-b border-slate-700/50 px-4 py-3 flex items-center gap-3 z-10">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition">
          <ArrowLeft size={20} />
        </button>
        <h1 className="font-semibold text-white">New Post</h1>
      </div>
      <ComposeBox onPost={() => navigate('/')} autoFocus />
    </div>
  )
}
