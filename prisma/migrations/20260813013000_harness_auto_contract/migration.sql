PRAGMA foreign_keys=OFF;

ALTER TABLE "WorkspaceSession" ADD COLUMN "agentContextSourceRunId" TEXT;
ALTER TABLE "WorkspaceSession" ADD COLUMN "agentContextStatus" TEXT;
ALTER TABLE "WorkspaceSession" ADD COLUMN "agentContextAttemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "WorkspaceSession" ADD COLUMN "agentContextLastError" TEXT;
ALTER TABLE "WorkspaceSession" ADD COLUMN "agentContextUpdatedAt" DATETIME;

DROP TABLE IF EXISTS "WorkspaceSuggestion";

PRAGMA foreign_keys=ON;
