/**
 * Models the fleet knows how to run, and the rules for naming an agent.
 *
 * A lib rather than the route file: Next allows a route module to export only
 * handlers and a fixed set of config keys, and the create form needs the same
 * list so the dropdown and the server validation cannot drift apart.
 */
export const AGENT_MODELS = [
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
] as const

export type AgentModel = (typeof AGENT_MODELS)[number]

export function isAgentModel(value: unknown): value is AgentModel {
  return typeof value === 'string' && (AGENT_MODELS as readonly string[]).includes(value)
}

export const MAX_AGENT_NAME = 40

/**
 * Codenames are lowercase, hyphen-separated, and start with a letter. They end
 * up in URLs and log lines, so "Nightly Crawler " is refused rather than
 * silently slugified into something the person did not choose.
 */
export const AGENT_NAME_PATTERN = /^[a-z][a-z0-9-]{1,39}$/

export function isValidAgentName(name: string): boolean {
  return AGENT_NAME_PATTERN.test(name)
}
