-- The GitHub login, lowercased: what a person actually types after an @.
--
-- Mentions resolved against "githubId", which holds the NUMERIC account id, so
-- no mention ever matched a GitHub-created user and no notification was ever
-- sent — while the comment still rendered the mention as if it had been.
ALTER TABLE "User" ADD COLUMN "handle" TEXT;
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
