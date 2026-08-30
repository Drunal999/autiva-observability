-- Which project a run belongs to.
--
-- An agent is a PERSON here, and one person moves between projects all day, so
-- the project cannot hang off the agent. A plain label rather than a relation:
-- it arrives from a laptop as a directory name, and minting a Module for every
-- folder somebody opens would fill the engine list with noise.
ALTER TABLE "Run" ADD COLUMN "project" TEXT;

-- "What has happened on this project lately."
CREATE INDEX "Run_tenantId_project_startedAt_idx" ON "Run"("tenantId", "project", "startedAt");
