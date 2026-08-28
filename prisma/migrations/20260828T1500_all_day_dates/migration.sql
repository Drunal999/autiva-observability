-- Serves the overlap half of the calendar window query. Without it, matching
-- `endsAt >= from` scans every row that ever started before `to`.
CREATE INDEX "CalendarEvent_tenantId_endsAt_idx" ON "CalendarEvent"("tenantId", "endsAt");

-- Normalise existing all-day events to UTC midnight.
--
-- They were written as LOCAL midnight with no record of which local, so the
-- date is only recoverable by assuming the timezone they were created in.
-- This install is operated from India (en-IN, INR throughout), so that is the
-- assumption, and it is stated here rather than buried: an all-day row created
-- from another timezone may shift by a day once, at this migration.
--
-- The columns are `timestamp without time zone` holding UTC, so the value is
-- read back as UTC, reinterpreted in IST to recover the wall-clock date, and
-- truncated to that day. The naive result is exactly the UTC midnight wanted.
UPDATE "CalendarEvent"
SET "startsAt" = date_trunc('day', ("startsAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'),
    "endsAt"   = date_trunc('day', ("endsAt"   AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')
WHERE "allDay" = true;
