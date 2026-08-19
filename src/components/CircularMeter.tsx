const SIZE = 40
const STROKE = 2.5
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function CircularMeter({ value, label, color }: { value: number; label: string; color: string }) {
  const clamped = Math.min(100, Math.max(0, value))
  const offset = CIRCUMFERENCE * (1 - clamped / 100)

  return (
    <div className="flex items-center gap-2.5">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={STROKE} />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-500 ease-fluid"
        />
        <text
          x={SIZE / 2}
          y={SIZE / 2}
          textAnchor="middle"
          dominantBaseline="central"
          transform={`rotate(90 ${SIZE / 2} ${SIZE / 2})`}
          className="fill-white/80 font-mono text-[8px] font-bold"
        >
          {Math.round(clamped)}
        </text>
      </svg>
      <div className="leading-tight">
        <p className="font-mono text-[9px] uppercase tracking-widest text-white/30">{label}</p>
        <p className="font-mono text-xs font-bold text-white/70">{Math.round(clamped)}%</p>
      </div>
    </div>
  )
}
