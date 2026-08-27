'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Ambient desert plate behind every surface.
 *
 * The still is the poster, so the first paint is instant and the video fades
 * in only once it can actually play — a 4K loop must never hold up the
 * dashboard, and a hard cut-in reads as a glitch. The scrim above it is what
 * keeps every text/background pair at the contrast it had on a flat canvas.
 */
export function AmbientBackground() {
  const ref = useRef<HTMLVideoElement>(null)
  // Held false until the video can play through, so the swap from poster to
  // motion is a crossfade rather than a jump.
  const [ready, setReady] = useState(false)

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

    // readyState 3+ means it can play without stalling. If the video was
    // already buffered before this effect ran, reveal it straight away.
    if (el.readyState >= 3) setReady(true)

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
        onCanPlayThrough={() => setReady(true)}
        className="h-full w-full object-cover"
        style={{
          // Brightened so the dunes read as landscape rather than noise, with
          // a touch of saturation so the violet survives the scrim above it.
          filter: 'brightness(1.55) saturate(1.12) contrast(1.02)',
          opacity: ready ? 0.78 : 0.6,
          // Slow, eased crossfade — atmosphere should arrive, not appear.
          transition: 'opacity 1200ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <source src="/purple-desert.mp4" type="video/mp4" />
      </video>

      {/* Navy scrim. Densest at the top where the chrome and dense type live,
          easing off toward the horizon so the dunes stay visible. Five stops
          rather than three so the falloff has no visible banding. */}
      <div
        className="absolute inset-0"
        style={{
          background: [
            'linear-gradient(180deg,',
            'rgba(10,16,32,0.93) 0%,',
            'rgba(10,16,32,0.88) 22%,',
            'rgba(10,16,32,0.80) 48%,',
            'rgba(10,16,32,0.70) 74%,',
            'rgba(10,16,32,0.62) 100%)',
          ].join(' '),
        }}
      />

      {/* A wash of the canvas navy over the whole plate, so the desert's warm
          purple sits in the same family as the UI rather than beside it. */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(10,16,32,0.30)', mixBlendMode: 'color' }}
      />

      {/* Vignette — pulls the eye to the centre and keeps the corners, where
          the nav and status chrome sit, quiet. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 90% at 50% 45%, transparent 40%, rgba(10,16,32,0.55) 100%)',
        }}
      />
    </div>
  )
}
