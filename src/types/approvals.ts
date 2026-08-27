export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED'
export type ApprovalRisk = 'MONEY' | 'PUBLISH' | 'BULK_MESSAGE' | 'DATA_DELETE' | 'OTHER'

export interface Approval {
  id: string
  tenantId: string
  runId: string | null
  moduleId: string | null
  action: string
  detail: string | null
  risk: ApprovalRisk
  amountInr: number | null
  status: ApprovalStatus
  requestedAt: string
  decidedAt: string | null
  reason: string | null
  module?: { key: string; displayName: string } | null
  run?: { ref: string; agent: { name: string } } | null
  decidedBy?: { name: string } | null
}

export interface ApprovalsResponse {
  mode: 'internal' | 'client'
  pending: Approval[]
  decided: Approval[]
}
