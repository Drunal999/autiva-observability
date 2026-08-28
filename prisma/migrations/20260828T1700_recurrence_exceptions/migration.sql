-- Occurrences of a repeating event have no rows; they are computed at read
-- time. So an edit or deletion of ONE occurrence needs somewhere to live.

-- EXDATE: instants skipped when expanding this series.
ALTER TABLE "CalendarEvent" ADD COLUMN "exdates" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[];

-- RECURRENCE-ID: on an override row, the occurrence it replaces.
ALTER TABLE "CalendarEvent" ADD COLUMN "recurrenceId" TIMESTAMP(3);
ALTER TABLE "CalendarEvent" ADD COLUMN "recurrenceParentId" TEXT;

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_recurrenceParentId_fkey"
    FOREIGN KEY ("recurrenceParentId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One override per occurrence: a double submit cannot split an occurrence in two.
CREATE UNIQUE INDEX "CalendarEvent_recurrenceParentId_recurrenceId_key"
    ON "CalendarEvent"("recurrenceParentId", "recurrenceId");
