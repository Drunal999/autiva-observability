const SOUND_PATHS = {
  success: '/sounds/success.mp3',
} as const

export type SoundName = keyof typeof SOUND_PATHS

export function playSound(name: SoundName, muted: boolean): void {
  if (muted) return
  try {
    const audio = new Audio(SOUND_PATHS[name])
    audio.play()?.catch(() => {
      // missing/blocked audio is non-fatal — the visual feedback still fires
    })
  } catch {
    // Audio unavailable in this environment (e.g. SSR) — no-op
  }
}
