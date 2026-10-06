/**
 * Perpetual-dusk wallpaper behind every surface.
 *
 * Static gradients only: the glass chrome and widgets blur whatever sits
 * here, so it needs warm colour to pick up, and a still plate costs nothing
 * on a phone (the old 4K desert loop was replaced for exactly that look).
 */
export function AmbientBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10"
      style={{
        background: [
          'radial-gradient(900px 600px at 85% -5%, rgba(150,64,98,0.55), transparent 60%)',
          'radial-gradient(800px 560px at 5% 105%, rgba(214,106,52,0.42), transparent 60%)',
          'radial-gradient(700px 500px at 45% 55%, rgba(64,48,140,0.35), transparent 65%)',
          'linear-gradient(160deg, #0f0c1d, #1b1226 55%, #120d16)',
        ].join(', '),
      }}
    />
  )
}
