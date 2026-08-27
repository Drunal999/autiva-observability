-- Tenancy. Neon has no RLS, so tenantId is the scoping key and the boundary is
-- enforced in server routes (see lib/ops/tenant.ts, ADR-002).

CREATE TABLE "Tenant" (
  "id"         TEXT NOT NULL,
  "slug"       TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "isInternal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

CREATE TABLE "Module" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "targetMs"    INTEGER NOT NULL DEFAULT 2000,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Module_tenantId_key_key" ON "Module"("tenantId", "key");
CREATE INDEX "Module_tenantId_idx" ON "Module"("tenantId");

-- Seed the internal tenant first so existing rows have somewhere to belong.
INSERT INTO "Tenant" ("id", "slug", "name", "isInternal")
VALUES ('tnt_internal', 'autiva', 'Autiva (internal)', true);

-- Add tenantId nullable, backfill, then enforce NOT NULL. Adding it NOT NULL
-- outright would fail against existing rows.
ALTER TABLE "Agent"        ADD COLUMN "tenantId" TEXT, ADD COLUMN "moduleId" TEXT;
ALTER TABLE "Run"          ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Flow"         ADD COLUMN "tenantId" TEXT;
ALTER TABLE "MetricBucket" ADD COLUMN "tenantId" TEXT;

UPDATE "Agent"        SET "tenantId" = 'tnt_internal';
UPDATE "Run"          SET "tenantId" = 'tnt_internal';
UPDATE "Flow"         SET "tenantId" = 'tnt_internal';
UPDATE "MetricBucket" SET "tenantId" = 'tnt_internal';

ALTER TABLE "Agent"        ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Run"          ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "Flow"         ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "MetricBucket" ALTER COLUMN "tenantId" SET NOT NULL;

-- Names and hours are unique per tenant, not globally.
DROP INDEX IF EXISTS "Agent_name_key";
DROP INDEX IF EXISTS "Flow_name_key";
DROP INDEX IF EXISTS "MetricBucket_at_key";
DROP INDEX IF EXISTS "MetricBucket_at_idx";

CREATE UNIQUE INDEX "Agent_tenantId_name_key"      ON "Agent"("tenantId", "name");
CREATE INDEX        "Agent_tenantId_status_idx"    ON "Agent"("tenantId", "status");
CREATE INDEX        "Run_tenantId_startedAt_idx"   ON "Run"("tenantId", "startedAt");
CREATE UNIQUE INDEX "Flow_tenantId_name_key"       ON "Flow"("tenantId", "name");
CREATE INDEX        "Flow_tenantId_idx"            ON "Flow"("tenantId");
CREATE UNIQUE INDEX "MetricBucket_tenantId_at_key" ON "MetricBucket"("tenantId", "at");
CREATE INDEX        "MetricBucket_tenantId_at_idx" ON "MetricBucket"("tenantId", "at");

ALTER TABLE "Module"       ADD CONSTRAINT "Module_tenantId_fkey"       FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Agent"        ADD CONSTRAINT "Agent_tenantId_fkey"        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Agent"        ADD CONSTRAINT "Agent_moduleId_fkey"        FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Run"          ADD CONSTRAINT "Run_tenantId_fkey"          FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Flow"         ADD CONSTRAINT "Flow_tenantId_fkey"         FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MetricBucket" ADD CONSTRAINT "MetricBucket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
