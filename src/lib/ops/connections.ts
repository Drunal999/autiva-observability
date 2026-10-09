/**
 * Tools a workflow can use. Two honest states only:
 *  - 'stack'   : set up in the AUTIVA system today (outside this dashboard).
 *                Not yet wired into an individual workflow from here.
 *  - 'package' : comes with a paid package; nothing is connected yet.
 * Nothing here claims a live connection the dashboard cannot see.
 */
export type ToolState = 'stack' | 'package'
export interface Tool { id: string; name: string; does: string; state: ToolState; mark: string }

export const TOOLS: Tool[] = [
 { id: 'claude', name: 'Claude', does: 'Reasoning and writing for agents', state: 'stack', mark: 'C' },
 { id: 'codex', name: 'Codex', does: 'Coding agent', state: 'stack', mark: '<>' },
 { id: 'hermes', name: 'Hermes', does: 'Worker agent for routine jobs', state: 'stack', mark: 'H' },
 { id: 'elevenlabs', name: 'ElevenLabs', does: 'Voice for Bolo and the Brain', state: 'stack', mark: '|||' },
 { id: 'calendar', name: 'Google Calendar', does: 'Book and read meetings', state: 'package', mark: '31' },
 { id: 'apollo', name: 'Apollo', does: 'Lead lists and contact data', state: 'package', mark: 'A' },
 { id: 'higgsfield', name: 'Higgsfield', does: 'AI video for marketing', state: 'package', mark: '▶' },
]
