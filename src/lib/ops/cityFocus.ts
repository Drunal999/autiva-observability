/**
 * "Show this module in the City", from anywhere in the dashboard (the assistant orb uses it).
 *
 * The City view may not be mounted yet (the orb navigates there after asking), so the request is
 * kept in sessionStorage for the view to pick up on mount, and also announced as an event for a
 * view that is already open. Client-only.
 */
const KEY = 'autiva-focus-module'
export const CITY_FOCUS_EVENT = 'autiva:focus-module'

export function requestCityFocus(moduleId: string) {
  try { sessionStorage.setItem(KEY, moduleId) } catch {}
  window.dispatchEvent(new CustomEvent(CITY_FOCUS_EVENT, { detail: moduleId }))
}

/** The pending request, if any, cleared once read. */
export function takeCityFocus(): string | null {
  try {
    const id = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return id
  } catch {
    return null
  }
}
