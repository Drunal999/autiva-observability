CREATE TYPE "CalendarEventKind" AS ENUM ('HUMAN', 'SCHEDULED_RUN', 'DEADLINE', 'MILESTONE');
CREATE TYPE "AttendeeResponse"  AS ENUM ('YES', 'NO', 'MAYBE', 'PENDING');

CREATE TABLE "CalendarEvent" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "kind"        "CalendarEventKind" NOT NULL DEFAULT 'HUMAN',
  "title"       TEXT NOT NULL,
  "description" TEXT,
  "startsAt"    TIMESTAMP(3) NOT NULL,
  "endsAt"      TIMESTAMP(3) NOT NULL,
  "allDay"      BOOLEAN NOT NULL DEFAULT false,
  -- RFC 5545 RRULE, or null for a one-off. Never a bespoke repeat format.
  "rrule"       TEXT,
  "moduleId"    TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- The grid always asks "this tenant, this window", sometimes narrowed by layer.
CREATE INDEX "CalendarEvent_tenantId_startsAt_idx"      ON "CalendarEvent"("tenantId", "startsAt");
CREATE INDEX "CalendarEvent_tenantId_kind_startsAt_idx" ON "CalendarEvent"("tenantId", "kind", "startsAt");

CREATE TABLE "CalendarAttendee" (
  "eventId"  TEXT NOT NULL,
  "userId"   TEXT NOT NULL,
  "response" "AttendeeResponse" NOT NULL DEFAULT 'PENDING',
  CONSTRAINT "CalendarAttendee_pkey" PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "CalendarAttendee_userId_idx" ON "CalendarAttendee"("userId");

ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CalendarAttendee" ADD CONSTRAINT "CalendarAttendee_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarAttendee" ADD CONSTRAINT "CalendarAttendee_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
