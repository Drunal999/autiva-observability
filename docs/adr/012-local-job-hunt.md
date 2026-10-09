# Local private Job Hunt

The /job-hunt page reuses OpsShell and NextAuth. Its POST API derives the user ID from the session and rejects foreign origins. A server-only JOB_HUNT_URL/JOB_HUNT_TOKEN connects to the Windows dashboard_service.py RPC. Browser-selected profiles are never forwarded.

Windows JOB_HUNT_USERS maps authenticated AUTIVA user IDs to factual local profiles. No automatic mapping by name/email is permitted. Runal remains unconnected until his own profile exists. Matching, factual pack generation and manual status validation reuse Job Hunter's existing core. No new database tables or dependencies.

Refresh reloads recorded shortlist/status; it does not launch a scan. Employer links open official forms and submission is manually confirmed. Profile downloads use a closed filename allowlist and resolved output boundary. Local worker/auth/configuration failures remain visible. Worker state is separate from shortlist freshness.

Startup and exact Windows commands: C:/Projects/job-hunter/docs/AUTIVA-INTEGRATION.md. No service was started or restarted during implementation. WSL-to-Windows loopback reachability and user mapping need local configuration. Vercel cannot reach laptop loopback; remote phone access and always-on hosting remain unimplemented.

Files: src/app/job-hunt/page.tsx; src/components/ops/JobHuntView.tsx and module CSS; src/lib/ops/workspaceNavigation.ts (one entry); src/app/api/job-hunt/[...path]/route.ts and __tests__/route.test.ts. Windows: dashboard_service.py, test_dashboard_service.py and integration documentation. Existing unrelated edits preserved.
