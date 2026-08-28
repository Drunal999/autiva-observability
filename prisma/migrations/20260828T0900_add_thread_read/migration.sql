-- Per-user, per-thread read watermark. One row per thread a user has opened.
CREATE TABLE "ThreadRead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadRead_pkey" PRIMARY KEY ("id")
);

-- The upsert target. Tenant is in the key so the same user id under two
-- tenants cannot collide.
CREATE UNIQUE INDEX "ThreadRead_tenantId_userId_subjectType_subjectId_key"
    ON "ThreadRead"("tenantId", "userId", "subjectType", "subjectId");

-- Serves the per-screen unread join, which filters by tenant + user + kind.
CREATE INDEX "ThreadRead_tenantId_userId_subjectType_idx"
    ON "ThreadRead"("tenantId", "userId", "subjectType");

ALTER TABLE "ThreadRead" ADD CONSTRAINT "ThreadRead_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadRead" ADD CONSTRAINT "ThreadRead_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
