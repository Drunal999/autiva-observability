'use client'

import { useEffect, useRef } from 'react'

/**
 * Ambient desert plate behind every surface.
 *
 * The still is the poster, so the first paint is instant and the video fades
 * in only once it can play — a 4K loop must never hold up the dashboard. The
 * scrim above it is what keeps every text/background pair at the contrast it
 * had on the flat canvas.
 */
export function AmbientBackground() {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Motion here is pure atmosphere, so it is the first thing to go when the
    // viewer has asked for less of it — the poster still remains.
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      if (reduce.matches) el.pause()
      else void el.play().catch(() => {})
    }
    apply()
    reduce.addEventListener('change', apply)

    // A background loop has no business burning frames on a hidden tab.
    const onVisibility = () => {
      if (document.hidden) el.pause()
      else if (!reduce.matches) void el.play().catch(() => {})
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      reduce.removeEventListener('change', apply)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <video
        ref={ref}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        poster="/purple-desert.jpg"
        className="h-full w-full object-cover"
        style={{ opacity: 0.55 }}
      >
        <source src="/purple-desert.mp4" type="video/mp4" />
      </video>

      {/* Darker at the top where the dense chrome and type live, lighter at the
          horizon so the dunes stay just readable. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,12,0.94) 0%, rgba(10,10,12,0.88) 45%, rgba(10,10,12,0.80) 100%)',
        }}
      />
    </div>
  )
}
