/**
 * The shape every task leaves the API in — reads AND realtime payloads.
 *
 * These had drifted: GET included the assignee; create, update and the overdue
 * cron did not. A live update therefore replaced an enriched task in the client
 * with a bare row, so your own task silently fell out of "My tasks" and into
 * "Unassigned" until the next poll twenty seconds later.
 *
 * It lives here rather than in a route so that every producer imports the same
 * constant instead of one route importing another.
 */
export const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const
