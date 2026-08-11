ALTER TABLE "WorkspaceSession"
ADD COLUMN "title" TEXT NOT NULL DEFAULT '新工作区';

UPDATE "WorkspaceSession"
SET "title" = coalesce(
  (
    SELECT substr(trim(message."content"), 1, 48)
    FROM "WorkspaceMessage" message
    WHERE message."workspaceId" = "WorkspaceSession"."id"
      AND message."role" = 'USER'
      AND length(trim(message."content")) > 0
    ORDER BY message."createdAt" ASC, message."id" ASC
    LIMIT 1
  ),
  '新工作区'
)
WHERE "title" = '新工作区';
