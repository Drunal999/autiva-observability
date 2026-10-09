import styles from './AmbientBackground.module.css'

/**
 * Wallpaper behind every surface. Dark: a still of the glowing city, softly
 * blurred and drifting very slowly, so every glass panel on every page picks
 * up its colour (Home draws the live 3D city on top of it). Light: a pale wall
 * with faint pastel light.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className={styles.wall}>
      <div className={styles.city} />
      <div className={`${styles.smoke} ${styles.a}`} />
      <div className={`${styles.smoke} ${styles.b}`} />
      <div className={`${styles.smoke} ${styles.c}`} />
      <div className={`${styles.smoke} ${styles.d}`} />
    </div>
  )
}
