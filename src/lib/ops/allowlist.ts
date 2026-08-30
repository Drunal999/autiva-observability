/**
 * Who may sign in at all.
 *
 * Until now, ANY GitHub account on earth could authenticate. The provider
 * accepted whoever GitHub vouched for, the signIn callback created them a user
 * row, and `getTenantContext()` handed every signed-in user the internal tenant
 * — so a stranger reached the approvals queue, the run history and the costs.
 * Nothing in the product said no, because nothing was ever asked to.
 *
 * This is that no. It is an allowlist of GitHub logins, and it is the only
 * thing standing between the sign-in button and the data.
 *
 * IT FAILS CLOSED. An empty or missing list denies everyone rather than
 * admitting everyone. The opposite default is the one that looks fine in
 * testing and is a breach in production, and a locked-out team notices in
 * seconds while an open door can go unnoticed indefinitely. The boot check in
 * instrumentation.ts refuses to start without a list, so misconfiguring it is
 * loud rather than silent.
 *
 * It is deliberately NOT an authorization model. Everyone on the list can do
 * everything: decide approvals, add agents, edit anything (ADR-002). This
 * decides who is in the room, not what they may touch once inside.
 */

export const ALLOWLIST_VAR = 'ALLOWED_GITHUB_LOGINS'

/**
 * GitHub logins are case-insensitive, so the list is folded on both sides.
 * Someone typing `HardikWork05` into the env file should not lock Hardik out.
 */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

export function allowedLogins(): string[] {
  return parseAllowlist(process.env[ALLOWLIST_VAR])
}

/**
 * Whether a GitHub login may sign in.
 *
 * An empty list means nobody — see the fail-closed note above.
 */
export function isAllowedLogin(login: string | null | undefined): boolean {
  if (!login) return false
  return allowedLogins().includes(login.trim().toLowerCase())
}

/** Thrown at boot rather than discovered when a stranger signs in. */
export function assertAllowlistConfigured(): void {
  if (allowedLogins().length === 0) {
    throw new Error(
      `${ALLOWLIST_VAR} is empty or unset, so nobody could sign in.\n` +
        `Set it to the GitHub logins allowed to use this dashboard, comma separated:\n` +
        `  ${ALLOWLIST_VAR}="drunal999,hardikwork05,adityamondal-ai-spec"\n` +
        `It fails closed on purpose: an unset list denies everyone rather than admitting everyone.`
    )
  }
}
