export type WorkspaceMode = 'simple' | 'team'
/** `short` is the one-word label the phone tab bar uses. */
export const SIMPLE_NAV = [
  {label:'Your city', short:'City', href:'/city', glyph:'⌂'},
  {label:'Messages', short:'Messages', href:'/chat', glyph:'◍'},
  {label:'Needs your approval', short:'Approvals', href:'/approvals', glyph:'✓'},
  {label:'Calendar', short:'Calendar', href:'/calendar', glyph:'▦'},
  {label:'Bolo', short:'Bolo', href:'/brain', glyph:'✺'},
] as const
/** The voice assistant's route. On a phone it is the round button beside the tab bar, not a tab. */
export const ASSISTANT_HREF = '/brain'
export const TEAM_NAV = [
  {label:'Mission & board', href:'/board', glyph:'◈'},
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
