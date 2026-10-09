-- Workspace look and assistant settings, one JSON value per user.
ALTER TABLE "User" ADD COLUMN "prefs" JSONB;
