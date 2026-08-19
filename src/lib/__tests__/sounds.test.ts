import { describe, it, expect, vi, beforeEach } from 'vitest'
import { playSound } from '../sounds'

describe('playSound', () => {
  let playMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    playMock = vi.fn().mockResolvedValue(undefined)
    // Must be a `function`, not an arrow function — vitest's mock spy
    // requires a constructible implementation when used with `new`.
    global.Audio = vi.fn().mockImplementation(function () {
      return { play: playMock }
    }) as unknown as typeof Audio
  })

  it('plays the sound when not muted', () => {
    playSound('success', false)
    expect(playMock).toHaveBeenCalled()
  })

  it('does not play the sound when muted', () => {
    playSound('success', true)
    expect(playMock).not.toHaveBeenCalled()
  })

  it('does not throw if playback fails (e.g. missing file)', () => {
    playMock.mockRejectedValue(new Error('no source'))
    expect(() => playSound('success', false)).not.toThrow()
  })
})
