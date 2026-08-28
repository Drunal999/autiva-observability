import { ACCENT, QUEUED, BLOCKED, OK, ERR } from './tokens'

/**
 * The four backend run states are the single source of truth. Everything the
 * UI shows — label, colour, whether it animates — is derived here and nowhere
 * else. No status string is hardcoded in more than one file.
 *
 * IDLE is deliberately absent from RunStatus: an idle agent has no active run,
 * so it is an agent-level state, not a run state.
 */
export type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'AWAITING_APPROVAL'
export type AgentStatus = RunStatus | 'IDLE'

const LABEL: Record<AgentStatus, string> = {
  RUNNING: 'Running',
  SUCCESS: 'Done',
  FAILED: 'Failed',
  AWAITING_APPROVAL: 'Blocked',
  IDLE: 'Idle',
}

const COLOR: Record<AgentStatus, string> = {
  RUNNING: ACCENT,
  SUCCESS: OK,
  FAILED: ERR,
  AWAITING_APPROVAL: BLOCKED,
  IDLE: QUEUED,
}

/**
 * Never rely on colour alone: each state also carries a glyph, so the status
 * survives greyscale, colour-blindness and a bad monitor.
 */
const GLYPH: Record<AgentStatus, string> = {
  RUNNING: '▶',
  SUCCESS: '✓',
  FAILED: '✕',
  AWAITING_APPROVAL: '⏸',
  IDLE: '○',
}

/** Fleet ordering: anything on fire reaches the operator first. */
const ORDER: Record<AgentStatus, number> = {
  FAILED: 0,
  RUNNING: 1,
  AWAITING_APPROVAL: 2,
  SUCCESS: 3,
  IDLE: 4,
}

export function statusLabel(status: AgentStatus): string {
  return LABEL[status] ?? status
}

export function statusColor(status: AgentStatus): string {
  return COLOR[status] ?? QUEUED
}

export function statusGlyph(status: AgentStatus): string {
  return GLYPH[status] ?? '○'
}

export function statusOrder(status: AgentStatus): number {
  return ORDER[status] ?? 99
}

/** Only genuinely continuous work animates. Motion means work. */
export function statusIsLive(status: AgentStatus): boolean {
  return status === 'RUNNING'
}
