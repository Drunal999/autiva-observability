'use client'

import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  AnimatePresence,
  type MotionValue,
  type SpringOptions,
} from 'framer-motion'
import { useRef, useState } from 'react'

/**
 * A macOS-style magnification dock, adapted to this app.
 *
 * WHERE IT LIVES, AND WHY IT IS NOT THE ONLY NAVIGATION.
 *
 * Magnification is a POINTER affordance: it reacts to where a cursor is, and
 * says nothing at all on a touchscreen. So this renders only where a fine
 * pointer exists, and the labelled top nav stays as the wayfinding everywhere
 * — it carries the approvals badge, shows labels without hovering, and is the
 * only navigation on touch. The dock is the fast, characterful path on a
 * desktop, not a replacement for knowing where you are.
 *
 * FOUR THINGS CHANGED FROM THE SOURCE COMPONENT, each a real defect:
 *
 *  1. `pageX` vs `getBoundingClientRect()`. The original fed `pageX` — which
 *     includes scroll offset — into a distance computed against `rect.x`,
 *     which is viewport-relative. The two agree only at scroll position zero;
 *     anywhere else every item magnifies at the wrong cursor position. Uses
 *     `clientX` now, which is the same frame of reference as the rect.
 *  2. `useMemo(..., [magnification])` omitted `dockHeight`, so changing that
 *     prop left the height stale. This project lints react-hooks, so it was
 *     also a build error waiting to happen.
 *  3. `role="button"` with `tabIndex={0}` and no key handler: reachable by
 *     keyboard, impossible to activate with one. These are links, so they are
 *     anchors now and get activation, focus and open-in-new-tab for free.
 *  4. `aria-haspopup="true"` announced a popup menu that does not exist. The
 *     label is a tooltip, so it is `aria-describedby` instead.
 *
 * The styling is this app's, not the source's shadcn tokens: `bg-card` and
 * friends belong to a palette the ops surface does not use, so a dock built
 * from them would sit visibly apart from everything around it.
 */

export interface DockItem {
  href: string
  label: string
  glyph: string
  /** Rendered in the corner, for anything that needs attention. */
  badge?: number
  active?: boolean
}

const DEFAULT_SPRING: SpringOptions = { mass: 0.1, stiffness: 150, damping: 12 }

function DockTile({
  item,
  mouseX,
  spring,
  distance,
  baseItemSize,
  magnification,
  reduced,
  onNavigate,
}: {
  item: DockItem
  mouseX: MotionValue<number>
  spring: SpringOptions
  distance: number
  baseItemSize: number
  magnification: number
  reduced: boolean
  onNavigate: (href: string) => void
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const [hovered, setHovered] = useState(false)

  const mouseDistance = useTransform(mouseX, (val) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return Number.POSITIVE_INFINITY
    // Measured against the tile's CENTRE, in the same viewport coordinates the
    // rect reports, so the peak of the curve sits under the cursor.
    return val - rect.x - rect.width / 2
  })

  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize]
  )
  const size = useSpring(targetSize, spring)

  const labelId = `dock-label-${item.href.replace(/\W/g, '') || 'root'}`

  return (
    <motion.a
      ref={ref}
      href={item.href}
      onClick={(e) => {
        // Client-side navigation, but only for a plain click: modified clicks
        // and middle clicks must keep working as real links.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        onNavigate(item.href)
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={item.label}
      aria-describedby={hovered ? labelId : undefined}
      aria-current={item.active ? 'page' : undefined}
      // Reduced motion gets a fixed size: the whole point of this control is
      // motion, so the honest fallback is a plain, still dock rather than a
      // smaller amount of the same animation.
      style={reduced ? { width: baseItemSize, height: baseItemSize } : { width: size, height: size }}
      className="relative flex shrink-0 items-center justify-center rounded-[14px] border no-underline outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-400/70"
      whileTap={reduced ? undefined : { scale: 0.92 }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-[14px] border"
        style={{
          borderColor: item.active ? 'rgba(34,211,238,0.55)' : 'rgba(255,255,255,0.10)',
          background: item.active ? 'rgba(34,211,238,0.14)' : 'rgba(255,255,255,0.05)',
        }}
      />
      <span
        aria-hidden="true"
        className="relative font-mono leading-none"
        style={{
          color: item.active ? '#67e8f9' : 'rgba(255,255,255,0.62)',
          // Scales with the tile so the glyph fills it rather than floating in
          // the middle of a growing box.
          fontSize: Math.round(baseItemSize * 0.42),
        }}
      >
        {item.glyph}
      </span>

      {item.badge != null && item.badge > 0 && (
        <span
          className="absolute -right-1 -top-1 z-10 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-amber-400 px-1 font-mono text-[12px] font-bold tabular-nums text-amber-950"
          aria-label={`${item.badge} waiting`}
        >
          {item.badge}
        </span>
      )}

      <AnimatePresence>
        {hovered && (
          <motion.span
            id={labelId}
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: -8 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: reduced ? 0 : 0.18 }}
            style={{ x: '-50%' }}
            className="pointer-events-none absolute -top-8 left-1/2 w-fit whitespace-pre rounded-[7px] border border-white/12 bg-[#0b1220] px-2 py-1 font-mono text-[12px] text-white/85 shadow-lg"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.a>
  )
}

export function Dock({
  items,
  onNavigate,
  className = '',
  spring = DEFAULT_SPRING,
  magnification = 68,
  distance = 150,
  panelHeight = 58,
  baseItemSize = 40,
}: {
  items: DockItem[]
  onNavigate: (href: string) => void
  className?: string
  spring?: SpringOptions
  magnification?: number
  distance?: number
  panelHeight?: number
  baseItemSize?: number
}) {
  const mouseX = useMotionValue(Number.POSITIVE_INFINITY)
  const reduced = useReducedMotion() ?? false

  return (
    <motion.nav
      aria-label="Quick switcher"
      onMouseMove={({ clientX }) => mouseX.set(clientX)}
      onMouseLeave={() => mouseX.set(Number.POSITIVE_INFINITY)}
      className={`flex items-end gap-2 rounded-[20px] border border-white/10 bg-[#0b1220]/70 px-3 pb-2 pt-2 shadow-2xl backdrop-blur-md ${className}`}
      // The panel keeps a FIXED height and lets tiles grow past its top edge.
      // The original animated the container from 64px to 256px on hover, which
      // is a 200-pixel layout jump every time the cursor passes over it.
      style={{ height: panelHeight }}
    >
      {items.map((item) => (
        <DockTile
          key={item.href}
          item={item}
          mouseX={mouseX}
          spring={spring}
          distance={distance}
          baseItemSize={baseItemSize}
          magnification={magnification}
          reduced={reduced}
          onNavigate={onNavigate}
        />
      ))}
    </motion.nav>
  )
}
