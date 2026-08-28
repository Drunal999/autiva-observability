CREATE TYPE "EventChannel" AS ENUM ('BOARD', 'FLEET', 'RUNS', 'APPROVALS', 'SYSTEM');

CREATE TABLE "Event" (
  "id"       TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "channel"  "EventChannel" NOT NULL,
  "type"     TEXT NOT NULL,
  "payload"  JSONB NOT NULL,
  "at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- Replay reads "this tenant, since a cursor" and, when a subscriber filters,
-- "this tenant, these channels, since a cursor".
CREATE INDEX "Event_tenantId_at_idx"          ON "Event"("tenantId", "at");
CREATE INDEX "Event_tenantId_channel_at_idx"  ON "Event"("tenantId", "channel", "at");

ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
