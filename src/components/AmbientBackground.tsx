import styles from './AmbientBackground.module.css'

/**
 * Wallpaper behind every surface: near-black with soft smoky light, the
 * way a dark iOS home screen looks. Static and colourless on purpose: the
 * glass picks up the light, and colour comes only from content.
 */
export function AmbientBackground() {
  return (
    <div aria-hidden="true" className={styles.wall}>
      <div className={`${styles.smoke} ${styles.a}`} />
      <div className={`${styles.smoke} ${styles.b}`} />
      <div className={`${styles.smoke} ${styles.c}`} />
      <div className={`${styles.smoke} ${styles.d}`} />
    </div>
  )
}
