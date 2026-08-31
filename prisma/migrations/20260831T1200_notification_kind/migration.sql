-- Why somebody is being told about something.
--
-- Every notification so far has been a mention. Without a kind, a work alert
-- would be counted under the header's "@" badge and announced as a mention —
-- a lie in the direction that matters, since a mention is a person asking YOU
-- for something and an alert is the system saying something went wrong.
CREATE TYPE "NotificationKind" AS ENUM ('MENTION', 'RUN_FAILED');

-- Existing rows keep the only meaning they ever had.
ALTER TABLE "Notification" ADD COLUMN "kind" "NotificationKind" NOT NULL DEFAULT 'MENTION';
