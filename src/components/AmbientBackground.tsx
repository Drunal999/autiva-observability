import styles from './AmbientBackground.module.css'

/**
 * Perpetual-dusk wallpaper with Bolo's orb fixed behind every surface.
 *
 * Static apart from the orb's slow colour turn: the glass chrome and widgets
 * blur whatever sits here, so it needs warm colour and one bright form to
 * pick up, and a still plate costs nothing on a phone.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className={styles.wall}>
      <div className={styles.orb}>
        <div className={styles.glow} />
        <div className={styles.core} />
      </div>
    </div>
  )
}
