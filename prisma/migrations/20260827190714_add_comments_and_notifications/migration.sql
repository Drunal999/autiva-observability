CREATE TYPE "SubjectType" AS ENUM ('RUN', 'APPROVAL', 'AGENT', 'MODULE', 'TENANT');
CREATE TYPE "AuthorKind"  AS ENUM ('HUMAN', 'AGENT', 'SYSTEM');

ALTER TYPE "EventChannel" ADD VALUE IF NOT EXISTS 'COMMENTS';

CREATE TABLE "Comment" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "subjectType" "SubjectType" NOT NULL,
  "subjectId"   TEXT NOT NULL,
  "authorId"    TEXT,
  "authorKind"  "AuthorKind" NOT NULL DEFAULT 'HUMAN',
  "authorName"  TEXT NOT NULL,
  "body"        TEXT NOT NULL,
  "mentions"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt"    TIMESTAMP(3),
  "deletedAt"   TIMESTAMP(3),
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- A thread is always read as "this tenant, this subject, oldest first".
CREATE INDEX "Comment_tenantId_subjectType_subjectId_createdAt_idx"
  ON "Comment"("tenantId", "subjectType", "subjectId", "createdAt");
CREATE INDEX "Comment_tenantId_createdAt_idx" ON "Comment"("tenantId", "createdAt");

CREATE TABLE "Notification" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "commentId"   TEXT,
  "subjectType" "SubjectType" NOT NULL,
  "subjectId"   TEXT NOT NULL,
  "preview"     TEXT NOT NULL,
  "readAt"      TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_readAt_createdAt_idx"
  ON "Notification"("userId", "readAt", "createdAt");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- A deleted account's past comments keep their authorName, so the thread still
-- reads correctly; only the link detaches.
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey"
  FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
