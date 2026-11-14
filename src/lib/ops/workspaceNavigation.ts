export type WorkspaceMode = 'simple' | 'team'
/** `short` is the one-word label the phone tab bar uses. */
export const SIMPLE_NAV = [
  {label:'Home', short:'Home', href:'/city', glyph:'⌂'},
  {label:'Pipeline', short:'Pipeline', href:'/pipeline', glyph:'☰'},
  {label:'Bots', short:'Bots', href:'/bots', glyph:'⚙'},
  {label:'Approvals', short:'Approvals', href:'/approvals', glyph:'✓'},
  {label:'Messages', short:'Messages', href:'/chat', glyph:'◍'},
  {label:'Brain', short:'Brain', href:'/brain', glyph:'✺'},
] as const
/** The Brain page, where Bolo (the voice assistant) also lives. On a phone it is the round Bolo button beside the tab bar, not a tab. */
export const ASSISTANT_HREF = '/brain'
export const TEAM_NAV = [
  {label:'Mission & board', href:'/board', glyph:'◈'},
  {label:'Calendar', href:'/calendar', glyph:'▦'},
  {label:'Job Hunt', href:'/job-hunt', glyph:'▤'},
  {label:'Fleet', href:'/fleet', glyph:'◇'},
  {label:'Automations', href:'/automations', glyph:'↻'},
  {label:'Trace', href:'/trace', glyph:'⑂'},
  {label:'Terminal', href:'/terminal', glyph:'$'},
  {label:'States', href:'/states', glyph:'◐'},
  {label:'Motion', href:'/motion', glyph:'∿'},
] as const
export function workspaceMode(value: string | null): WorkspaceMode {
  return value === 'team' ? 'team' : 'simple'
}
