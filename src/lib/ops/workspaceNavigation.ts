export type WorkspaceMode = 'simple' | 'team'
export const SIMPLE_NAV = [
  {label:'Your city', href:'/city', glyph:'⌂'},
  {label:'Messages', href:'/chat', glyph:'◍'},
  {label:'Needs your approval', href:'/approvals', glyph:'✓'},
  {label:'Calendar', href:'/calendar', glyph:'▦'},
  {label:'Assistant', href:'/brain', glyph:'✺'},
] as const
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
