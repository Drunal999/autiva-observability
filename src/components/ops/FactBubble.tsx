'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A small diversion in the bottom-right corner: tap it, get a fact.
 *
 * The facts are a fixed list rather than a model call. This is a button someone
 * presses out of idle curiosity, possibly several times in a row — routing that
 * through an API would spend real money per press and add a spinner to a thing
 * whose entire appeal is that it answers instantly. Every line below is also
 * checkably true, which a generated one would not be.
 */

interface Fact {
  text: string
  /** Kept so a claim can be checked rather than taken on faith. */
  year?: string
}

const FACTS: Fact[] = [
  { text: 'The first computer bug was a real one — a moth, trapped in a relay of the Harvard Mark II. It was taped into the logbook, and the log still exists.', year: '1947' },
  { text: 'Ada Lovelace wrote what is generally considered the first published algorithm intended for a machine, for an engine that was never built.', year: '1843' },
  { text: 'The word "computer" was a job title for about three hundred years before it was a machine. It meant a person who computed.' },
  { text: 'The Apollo Guidance Computer ran the Moon landing with about 4KB of RAM. This sentence, stored as plain text, is a rounding error against that.', year: '1969' },
  { text: 'Grace Hopper popularised the idea that programs could be written in something close to English, when the prevailing view was that computers only understood numbers.', year: '1959' },
  { text: 'The term "artificial intelligence" was coined for a summer workshop proposal. The authors thought a significant advance could be made by ten people over two months.', year: '1956' },
  { text: 'ELIZA convinced people it understood them using pattern matching and no memory of the conversation. Its author was disturbed by how readily they confided in it.', year: '1966' },
  { text: 'Backpropagation, the algorithm underneath most modern neural networks, was written off for years because nobody had the data or the compute to make it pay.', year: '1986' },
  { text: 'A transformer has no built-in notion of word order. Position has to be added deliberately, or "dog bites man" and "man bites dog" look identical to it.', year: '2017' },
  { text: 'The QWERTY layout was not designed to slow typists down — that is a myth. It grouped common letter pairs to reduce typebar jams.' },
  { text: 'There is no universal way to tell whether an arbitrary program will ever finish. Turing proved no such method can exist.', year: '1936' },
  { text: 'A neural network does not store facts anywhere you can point to. Everything it "knows" is spread across weights that individually mean nothing.' },
  { text: 'The first webcam watched a coffee pot at Cambridge, so researchers could see whether a trip down the stairs was worth it.', year: '1991' },
  { text: 'Shannon proved information could be measured in bits, independent of what it meant. Nearly all digital communication rests on that one idea.', year: '1948' },
  { text: 'Most of the cost of running a large model is not training it. It is answering, over and over, forever.' },
  { text: 'Hofstadter’s law: it always takes longer than you expect, even when you take Hofstadter’s law into account.', year: '1979' },
  { text: 'The C programming language was written to port a game. Unix followed from wanting somewhere to run it.', year: '1972' },
  { text: 'RSA encryption rests on multiplication being easy and undoing it being hard. No one has proved it is hard — only that nobody has managed it yet.', year: '1977' },
  { text: 'The first message sent over ARPANET was meant to be "LOGIN". The system crashed after "LO".', year: '1969' },
  { text: 'A language model does not know when it does not know. Confidence and correctness are separate things it was never taught to tell apart.' },
]

export function FactBubble() {
  const [open, setOpen] = useState(false)
  const [fact, setFact] = useState<Fact | null>(null)
  const seen = useRef<Set<number>>(new Set())
  const panelRef = useRef<HTMLDivElement>(null)

  /**
   * Never the same fact twice until the list is exhausted.
   *
   * `Math.random()` alone repeats often enough to feel broken — pressing a
   * button labelled "another one" and getting the one you just read reads as a
   * bug, not as chance.
   */
  const next = useCallback(() => {
    if (seen.current.size >= FACTS.length) seen.current.clear()
    let i = Math.floor(Math.random() * FACTS.length)
    let guard = 0
    while (seen.current.has(i) && guard++ < FACTS.length * 2) {
      i = Math.floor(Math.random() * FACTS.length)
    }
    seen.current.add(i)
    setFact(FACTS[i])
  }, [])

  function toggle() {
    if (!open) next()
    setOpen((o) => !o)
  }

  // Escape closes it, and focus returns to the button that opened it.
  const buttonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {open && fact && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Did you know"
          className="w-[300px] rounded-[14px] border border-white/12 bg-[#0b1220]/95 p-3.5 shadow-2xl backdrop-blur-md"
          style={{ animation: 'riseIn 180ms cubic-bezier(0.16,1,0.3,1) both' }}
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300/70">
              Did you know
            </span>
            {fact.year && (
              <span className="rounded-[5px] bg-white/[0.07] px-1.5 py-[1px] font-mono text-[11px] tabular-nums text-white/45">
                {fact.year}
              </span>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="font-mono text-[12px] text-white/35 transition hover:text-white/75 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60"
            >
              esc
            </button>
          </div>

          {/* aria-live so a screen reader hears the new fact when "another"
              is pressed — the panel does not re-open, only its text changes. */}
          <p aria-live="polite" className="text-[13.5px] leading-[1.55] text-white/78">
            {fact.text}
          </p>

          <button
            type="button"
            onClick={next}
            className="mt-2.5 h-7 rounded-[8px] border border-cyan-400/35 bg-cyan-400/10 px-2.5 font-mono text-[12px] text-cyan-300 transition hover:bg-cyan-400/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
          >
            another one
          </button>
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Show a fact about computers and AI"
        title="A fact about computers and AI"
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-[#0b1220]/85 text-[18px] shadow-2xl backdrop-blur-md transition hover:border-cyan-400/45 hover:text-cyan-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      >
        <span aria-hidden="true">?</span>
      </button>
    </div>
  )
}
