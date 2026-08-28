-- Cost is INR from here on. Rename rather than drop/recreate so existing
-- rows survive the change.
ALTER TABLE "Agent" RENAME COLUMN "costUsd" TO "costInr";
ALTER TABLE "Run" RENAME COLUMN "costUsd" TO "costInr";
ALTER TABLE "MetricBucket" RENAME COLUMN "costUsd" TO "costInr";

-- AgentStatus: both removed values map cleanly onto a new name, so an
-- in-place rename keeps every existing row valid with no USING cast.
ALTER TYPE "AgentStatus" RENAME VALUE 'BLOCKED' TO 'AWAITING_APPROVAL';
ALTER TYPE "AgentStatus" RENAME VALUE 'DONE' TO 'SUCCESS';

-- RunStatus: QUEUED disappears entirely, so the type has to be swapped.
-- Queued work is not yet running but is not a distinct backend state in the
-- four-value vocabulary, so it folds into RUNNING.
CREATE TYPE "RunStatus_new" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'AWAITING_APPROVAL');
ALTER TABLE "Run" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Run" ALTER COLUMN "status" TYPE "RunStatus_new" USING (
  CASE "status"::text
    WHEN 'QUEUED' THEN 'RUNNING'
    WHEN 'DONE'   THEN 'SUCCESS'
    ELSE "status"::text
  END
)::"RunStatus_new";
ALTER TABLE "Run" ALTER COLUMN "status" SET DEFAULT 'RUNNING';
DROP TYPE "RunStatus";
ALTER TYPE "RunStatus_new" RENAME TO "RunStatus";
