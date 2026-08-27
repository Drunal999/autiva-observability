-- Latency has to be judged against each engine's own target: 3.5s is fine for
-- a weekly digest and unacceptable for an inbound reply someone is waiting on.
-- A null moduleId is the fleet-wide rollup; a set one scopes the bucket to one
-- engine.
ALTER TABLE "MetricBucket" ADD COLUMN "moduleId" TEXT;

-- The old uniqueness was one bucket per hour per tenant, which now has to
-- admit one per engine per hour as well. Postgres treats NULLs as distinct in
-- a unique index, so the fleet-wide row is additionally guarded below.
DROP INDEX IF EXISTS "MetricBucket_tenantId_at_key";
DROP INDEX IF EXISTS "MetricBucket_tenantId_at_idx";

CREATE UNIQUE INDEX "MetricBucket_tenantId_moduleId_at_key"
  ON "MetricBucket"("tenantId", "moduleId", "at");
-- NULLS NOT DISTINCT is not available on every Postgres version, so the
-- fleet-wide row gets its own partial unique index.
CREATE UNIQUE INDEX "MetricBucket_tenant_fleetwide_at_key"
  ON "MetricBucket"("tenantId", "at") WHERE "moduleId" IS NULL;

CREATE INDEX "MetricBucket_tenantId_at_idx"          ON "MetricBucket"("tenantId", "at");
CREATE INDEX "MetricBucket_tenantId_moduleId_at_idx" ON "MetricBucket"("tenantId", "moduleId", "at");

ALTER TABLE "MetricBucket" ADD CONSTRAINT "MetricBucket_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
