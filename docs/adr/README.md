# Architecture decision records

Short records of decisions that were argued once and should not be argued
again. Each states what was decided, what it costs, and what would justify
revisiting it.

If you are about to change one of these, read the "when to revisit" line first
— it usually names the condition, and the condition is usually not met yet.

| # | Decision | Status |
|---|---|---|
| [001](001-status-vocabulary.md) | Four backend run states; display labels derived | Accepted |
| [002](002-tenant-boundary-without-rls.md) | Tenant boundary in server routes, not RLS | Accepted, with a known gap |
| [003](003-one-realtime-stream.md) | One event stream for dashboard and city | Accepted |
| [004](004-embedded-jitsi.md) | Embed Jitsi rather than build WebRTC signalling | Accepted |
| [005](005-calendar-library-and-ics-only.md) | rrule.js for recurrence; ICS export only in v1 | Accepted |
| [006](006-internal-and-client-modes.md) | One component, two modes | Accepted |
| [007](007-read-state-as-a-watermark.md) | Thread read-state is a watermark, not a receipt | Accepted |
| [008](008-continuous-timeline-zoom.md) | One continuous timeline scale, not four views | Accepted |
