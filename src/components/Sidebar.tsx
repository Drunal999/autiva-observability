'use client'

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col justify-between border-r border-white/5 bg-[#0a0a0c]/70 p-6 backdrop-blur-xl md:flex">
      <div>
        <div className="mb-10 flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500" />
          <span className="text-lg font-extrabold tracking-tight text-white">JARVIS.</span>
        </div>
        <nav className="space-y-1">
          <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5 text-sm font-medium text-cyan-400">
            Board
          </div>
        </nav>
      </div>
      <div className="glass-sm flex items-center gap-2.5 rounded-2xl px-3 py-2.5">
        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
        <span className="text-xs font-semibold text-white/60">System Active</span>
      </div>
    </aside>
  )
}
