PRAGMA foreign_keys=OFF;

DROP TRIGGER IF EXISTS "JourneyRevision_workspace_guard";
DROP TRIGGER IF EXISTS "JourneyRevision_workspace_update_guard";
DROP TRIGGER IF EXISTS "WorkspaceSession_head_update_guard";
DROP TRIGGER IF EXISTS "WorkspaceRevision_lineage_insert_guard";
DROP TRIGGER IF EXISTS "WorkspaceRevision_identity_insert_guard";
DROP TRIGGER IF EXISTS "WorkspaceRevision_update_guard";
DROP TRIGGER IF EXISTS "WorkspaceRevision_delete_guard";

CREATE TABLE "new_WorkspaceRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "parentRevisionId" TEXT,
    "commandName" TEXT NOT NULL,
    "beforeGraphJson" TEXT NOT NULL,
    "afterGraphJson" TEXT NOT NULL,
    "patchJson" TEXT NOT NULL,
    "inversePatchJson" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceRevision_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "WorkspaceRevision_parent_check" CHECK (("revision" = 1 AND "parentRevisionId" IS NULL) OR ("revision" > 1 AND "parentRevisionId" IS NOT NULL)),
    CONSTRAINT "WorkspaceRevision_json_check" CHECK (
      json_valid("beforeGraphJson") AND coalesce(json_type("beforeGraphJson", '$'), '') = 'object' AND
      json_valid("afterGraphJson") AND coalesce(json_type("afterGraphJson", '$'), '') = 'object' AND
      json_valid("patchJson") AND coalesce(json_type("patchJson", '$'), '') = 'array' AND
      json_valid("inversePatchJson") AND coalesce(json_type("inversePatchJson", '$'), '') = 'array'
    ),
    CONSTRAINT "WorkspaceRevision_graph_identity_check" CHECK (
      coalesce(json_type("beforeGraphJson", '$.id'), '') = 'text' AND
      coalesce(json_type("beforeGraphJson", '$.ownerId'), '') = 'text' AND
      coalesce(json_type("afterGraphJson", '$.id'), '') = 'text' AND
      coalesce(json_type("afterGraphJson", '$.ownerId'), '') = 'text' AND
      json_extract("beforeGraphJson", '$.id') = json_extract("afterGraphJson", '$.id') AND
      json_extract("beforeGraphJson", '$.ownerId') = json_extract("afterGraphJson", '$.ownerId')
    ),
    CONSTRAINT "WorkspaceRevision_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    ),
    CONSTRAINT "WorkspaceRevision_command_check" CHECK ("commandName" IN ('journey.add_event', 'journey.update_event', 'journey.move_event', 'journey.place_event', 'journey.retire_event', 'journey.replace_event', 'journey.add_link', 'journey.retire_link', 'journey.select_branch', 'journey.plan_transit', 'journey.select_transit_plan', 'journey.confirm_actual', 'journey.skip_event', 'journey.cancel_event', 'journey.attach_asset', 'journey.add_observation', 'journey.link_source_item', 'journey.undo', 'journey.apply_draft', 'workspace.refresh', 'workspace.replay', 'workspace.fork', 'workspace.commit')),
    CONSTRAINT "WorkspaceRevision_key_check" CHECK (length(trim("idempotencyKey")) > 0),
    CONSTRAINT "WorkspaceRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceRevision_workspaceId_parentRevisionId_fkey" FOREIGN KEY ("workspaceId", "parentRevisionId") REFERENCES "WorkspaceRevision" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_WorkspaceRevision" ("id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "actorAgentRunId", "idempotencyKey", "createdAt")
SELECT "id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "actorAgentRunId", "idempotencyKey", "createdAt"
FROM "WorkspaceRevision";

DROP TABLE "WorkspaceRevision";
ALTER TABLE "new_WorkspaceRevision" RENAME TO "WorkspaceRevision";

CREATE INDEX "WorkspaceRevision_createdAt_idx" ON "WorkspaceRevision"("createdAt");
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_revision_key" ON "WorkspaceRevision"("workspaceId", "revision");
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_id_key" ON "WorkspaceRevision"("workspaceId", "id");
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_parentRevisionId_key" ON "WorkspaceRevision"("workspaceId", "parentRevisionId");
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_idempotencyKey_key" ON "WorkspaceRevision"("workspaceId", "idempotencyKey");

CREATE TRIGGER "WorkspaceRevision_lineage_insert_guard"
BEFORE INSERT ON "WorkspaceRevision"
WHEN NEW."revision" > 1 AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceRevision" parent
  WHERE parent."id" = NEW."parentRevisionId"
    AND parent."workspaceId" = NEW."workspaceId"
    AND parent."revision" = NEW."revision" - 1
)
BEGIN SELECT RAISE(ABORT, 'WorkspaceRevision parent must be the immediately preceding revision'); END;

CREATE TRIGGER "WorkspaceRevision_identity_insert_guard"
BEFORE INSERT ON "WorkspaceRevision"
WHEN NOT EXISTS (
  SELECT 1 FROM "WorkspaceSession" workspace
  WHERE workspace."id" = NEW."workspaceId"
    AND json_extract(NEW."afterGraphJson", '$.ownerId') = workspace."ownerId"
    AND (workspace."sourceJourneyId" IS NULL OR json_extract(NEW."afterGraphJson", '$.id') = workspace."sourceJourneyId")
)
BEGIN SELECT RAISE(ABORT, 'WorkspaceRevision graph must preserve Workspace Journey identity and owner'); END;

CREATE TRIGGER "WorkspaceRevision_update_guard"
BEFORE UPDATE ON "WorkspaceRevision"
BEGIN SELECT RAISE(ABORT, 'Workspace revisions are append-only'); END;

CREATE TRIGGER "WorkspaceRevision_delete_guard"
BEFORE DELETE ON "WorkspaceRevision"
WHEN EXISTS (
  SELECT 1 FROM "WorkspaceSession" workspace
  WHERE workspace."id" = OLD."workspaceId"
)
BEGIN SELECT RAISE(ABORT, 'Workspace revisions cannot be deleted while their Workspace exists'); END;

CREATE TRIGGER "JourneyRevision_workspace_guard"
BEFORE INSERT ON "JourneyRevision"
WHEN NEW."workspaceRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceRevision" revision
  WHERE revision."id" = NEW."workspaceRevisionId"
    AND json_extract(revision."afterGraphJson", '$.id') = NEW."journeyId"
)
BEGIN SELECT RAISE(ABORT, 'committed WorkspaceRevision must describe the same Journey'); END;

CREATE TRIGGER "JourneyRevision_workspace_update_guard"
BEFORE UPDATE OF "workspaceRevisionId" ON "JourneyRevision"
WHEN NEW."workspaceRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceRevision" revision
  WHERE revision."id" = NEW."workspaceRevisionId"
    AND json_extract(revision."afterGraphJson", '$.id') = NEW."journeyId"
)
BEGIN SELECT RAISE(ABORT, 'committed WorkspaceRevision must describe the same Journey'); END;

CREATE TRIGGER "WorkspaceSession_head_update_guard"
BEFORE UPDATE OF "headWorkspaceRevision" ON "WorkspaceSession"
WHEN NEW."headWorkspaceRevision" <> OLD."headWorkspaceRevision" AND (
  NEW."headWorkspaceRevision" <> OLD."headWorkspaceRevision" + 1 OR NOT EXISTS (
    SELECT 1 FROM "WorkspaceRevision" revision
    WHERE revision."workspaceId" = NEW."id"
      AND revision."revision" = NEW."headWorkspaceRevision"
  )
)
BEGIN SELECT RAISE(ABORT, 'Workspace head must advance by one to a persisted WorkspaceRevision'); END;

PRAGMA foreign_keys=ON;
