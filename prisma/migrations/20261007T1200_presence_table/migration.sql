-- Presence moves from process memory to the database so every server
-- instance sees the same roster. One row per person, overwritten by each
-- heartbeat and deleted once stale: this is "who is here now", never a log.
CREATE TABLE "Presence" (
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "viewing" TEXT NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Presence_pkey" PRIMARY KEY ("tenantId","userId")
);

CREATE INDEX "Presence_tenantId_lastSeen_idx" ON "Presence"("tenantId", "lastSeen");
