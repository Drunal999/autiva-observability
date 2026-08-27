export type AgentStatus = 'IDLE' | 'RUNNING' | 'AWAITING_APPROVAL' | 'FAILED' | 'SUCCESS'
export type RunStatus = 'RUNNING' | 'SUCCESS' | 'FAILED' | 'AWAITING_APPROVAL'
export type RunTrigger = 'MANUAL' | 'CRON' | 'WEBHOOK' | 'AGENT'
export type SpanType = 'LLM' | 'TOOL' | 'SHELL' | 'FILE' | 'SUBAGENT'
export type SpanStatus = 'OK' | 'RUNNING' | 'ERROR' | 'WARN'
export type LogStream = 'STDOUT' | 'STDERR' | 'SYSTEM'
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'
export type FileStatus = 'READING' | 'WRITING' | 'MODIFIED' | 'COMMITTED'
export type NodeKind = 'TRIGGER' | 'CONDITION' | 'ACTION'

export type ViewMode = 'internal' | 'client'

export interface AgentModule {
  key: string
  displayName: string
  targetMs: number
}

export interface Agent {
  id: string
  name: string
  model: string
  status: AgentStatus
  currentStep: string | null
  startedAt: string | null
  tokensIn: number
  tokensOut: number
  costInr: number
  stepMs: number[]
  module?: AgentModule | null
}

/** /api/agents returns the mode alongside the rows — the client never picks it. */
export interface FleetResponse {
  mode: ViewMode
  agents: Agent[]
}

export interface Span {
  id: string
  runId: string
  parentId: string | null
  type: SpanType
  name: string
  startMs: number
  durMs: number
  status: SpanStatus
  model: string | null
  tokens: number | null
  error: string | null
  critical: boolean
}

export type LogKind = 'TEXT' | 'TOOL' | 'DIFF' | 'STACK'

export interface LogLine {
  id: string
  runId: string
  ts: string
  stream: LogStream
  level: LogLevel
  text: string
  kind: LogKind
  args: string | null
  meta: string | null
  lines: string[]
}

export interface WorkspaceFile {
  id: string
  runId: string
  path: string
  status: FileStatus
  added: number
  removed: number
  diff: string[]
}

export interface Run {
  id: string
  ref: string
  agentId: string
  agent?: Pick<Agent, 'id' | 'name' | 'model'>
  trigger: RunTrigger
  status: RunStatus
  summary: string | null
  exitCode: number | null
  tokens: number
  costInr: number
  startedAt: string
  endedAt: string | null
}

/** A run with everything the Trace and Terminal screens need in one payload. */
export interface RunDetail extends Run {
  spans: Span[]
  logLines: LogLine[]
  files: WorkspaceFile[]
}

export interface FlowNode {
  id: string
  flowId: string
  kind: NodeKind
  title: string
  meta: string | null
  x: number
  y: number
  runs: number
  p95Ms: number
  failures: number
  edgesTo: string[]
}

export interface FlowRun {
  id: string
  ref: string
  flowId: string
  status: SpanStatus
  summary: string
  durMs: number
  at: string
}

export interface Flow {
  id: string
  name: string
  trigger: RunTrigger
  enabled: boolean
  runsToday: number
  p95Ms: number
  failures1h: number
  nodes: FlowNode[]
  runsLog: FlowRun[]
}
