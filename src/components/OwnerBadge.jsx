import { Crown } from 'lucide-react'

export default function OwnerBadge({ size = 'sm' }) {
  if (size === 'lg') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/40 text-amber-300 text-xs font-semibold">
        <Crown size={13} className="text-amber-400" />
        ANCHOR OFFICIAL
      </span>
    )
  }
  return (
    <span title="ANCHOR OFFICIAL" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400/20 border border-amber-400/50">
      <Crown size={9} className="text-amber-400" />
    </span>
  )
}
