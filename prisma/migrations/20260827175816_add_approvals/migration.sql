CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "ApprovalRisk"   AS ENUM ('MONEY', 'PUBLISH', 'BULK_MESSAGE', 'DATA_DELETE', 'OTHER');

CREATE TABLE "Approval" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "runId"       TEXT,
  "moduleId"    TEXT,
  "action"      TEXT NOT NULL,
  "detail"      TEXT,
  "risk"        "ApprovalRisk" NOT NULL DEFAULT 'OTHER',
  "amountInr"   DOUBLE PRECISION,
  "status"      "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedById" TEXT,
  "decidedAt"   TIMESTAMP(3),
  "reason"      TEXT,
  CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- The queue is always read as "pending, oldest first, for one tenant".
CREATE INDEX "Approval_tenantId_status_requestedAt_idx"
  ON "Approval"("tenantId", "status", "requestedAt");

ALTER TABLE "Approval" ADD CONSTRAINT "Approval_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A decided approval outlives the run and the module it referred to: the audit
-- trail must survive cleanup of either, so these detach rather than cascade.
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
