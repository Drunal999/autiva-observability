'use client'
import useSWR from 'swr'
import type { PresenceEntry } from './Presence'
import styles from './TeamPresence.module.css'

interface Member { id: string; name: string; handle: string | null; avatarUrl: string | null; me: boolean }
export interface Teammate extends Member { live: PresenceEntry | undefined }

const fetcher = async (url: string) => { const r = await fetch(url); if (!r.ok) throw new Error('team unavailable'); return r.json() }

/**
 * Everyone on the team, each marked live only while their own tab is sending
 * presence heartbeats. Nobody is ever shown as active on a guess.
 */
export function useTeam(roster: PresenceEntry[]): Teammate[] {
  const { data } = useSWR<{ members: Member[] }>('/api/team', fetcher, { refreshInterval: 60_000 })
  return (data?.members ?? []).map((m) => ({ ...m, live: roster.find((r) => r.userId === m.id) }))
}

const firstName = (name: string) => name.replace(/\s*\(.*\)$/, '').split(/\s+/)[0] || name
const initial = (name: string) => firstName(name).slice(0, 1).toUpperCase()

function status(t: Teammate): string {
  if (t.me) return 'You'
  return t.live ? `Active now · ${t.live.viewing}` : 'Offline'
}

function Avatar({ t, size }: { t: Teammate; size: number }) {
  return (
    <span className={styles.avatar} data-live={t.me || !!t.live} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {t.avatarUrl ? <img src={t.avatarUrl} alt="" /> : initial(t.name)}
      <i className={styles.dot} aria-hidden="true" />
    </span>
  )
}

/** Header faces: who is on the team and who is here right now. You are always here:
 *  your own entry can briefly lapse when a reload races its leave and arrive beats. */
export function TeamAvatars({ team }: { team: Teammate[] }) {
  if (team.length === 0) return null
  return (
    <div className={styles.faces} role="list" aria-label="Team">
      {team.map((t) => (
        <span key={t.id} role="listitem" title={`${firstName(t.name)}: ${status(t)}`} aria-label={`${firstName(t.name)}, ${status(t)}`}>
          <Avatar t={t} size={30} />
        </span>
      ))}
    </div>
  )
}

/** Sidebar list: names, live state, and what a teammate is looking at. */
export function TeamList({ team }: { team: Teammate[] }) {
  if (team.length === 0) return null
  return (
    <section className={styles.list} aria-label="Team">
      <p className={styles.heading}>Team</p>
      {team.map((t) => (
        <div key={t.id} className={styles.row}>
          <Avatar t={t} size={34} />
          <div className={styles.text}>
            <span className={styles.name}>{firstName(t.name)}</span>
            <span className={styles.state} data-live={!!t.live && !t.me}>{status(t)}</span>
          </div>
        </div>
      ))}
    </section>
  )
}
