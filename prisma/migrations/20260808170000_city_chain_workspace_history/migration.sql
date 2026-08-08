PRAGMA foreign_keys=OFF;

DROP TRIGGER IF EXISTS "WorkspaceRevision_delete_guard";
DROP TRIGGER IF EXISTS "WorkspaceRevision_identity_insert_guard";
DROP TRIGGER IF EXISTS "JourneyEvent_type_update_guard";
DROP TRIGGER IF EXISTS "ProviderUsageLog_agent_run_update_guard";
DROP TRIGGER IF EXISTS "TransitPlan_delete_guard";
DROP TRIGGER IF EXISTS "TransitSegment_delete_guard";
DROP TRIGGER IF EXISTS "TransitPlanningRun_delete_guard";

-- This is a breaking CITY-only cutover. Remove whole aggregates that cannot
-- satisfy the new contract instead of leaving partial DAY/THEME state behind.
CREATE TEMP TABLE "_legacy_journey_ids" AS
SELECT DISTINCT journey."id"
FROM "Journey" journey
WHERE EXISTS (
  SELECT 1
  FROM "JourneyEvent" event
  LEFT JOIN "SectionEventDetail" detail ON detail."eventId" = event."id"
  WHERE event."journeyId" = journey."id"
    AND event."type" = 'SECTION'
    AND (
      event."parentSectionEventId" IS NOT NULL OR
      detail."eventId" IS NULL OR
      detail."kind" <> 'CITY' OR
      detail."timezone" IS NULL OR
      length(trim(detail."timezone")) = 0
    )
) OR EXISTS (
  SELECT 1
  FROM "JourneyRevision" revision
  WHERE revision."journeyId" = journey."id"
    AND (
      coalesce(json_type(revision."snapshotJson", '$.events'), '') <> 'array' OR
      EXISTS (
        SELECT 1
        FROM json_each(revision."snapshotJson", '$.events') event
        WHERE json_extract(event.value, '$.type') = 'SECTION'
          AND (
            json_extract(event.value, '$.parentSectionEventId') IS NOT NULL OR
            coalesce(json_extract(event.value, '$.detail.kind'), '') <> 'CITY' OR
            coalesce(json_extract(event.value, '$.detail.timeZone'), '') = ''
          )
      )
    )
);

CREATE TEMP TABLE "_legacy_workspace_ids" AS
SELECT workspace."id"
FROM "WorkspaceSession" workspace
WHERE workspace."status" = 'EXPIRED'
  OR workspace."sourceJourneyId" IN (
    SELECT "id" FROM "_legacy_journey_ids"
  )
  OR coalesce(json_type(workspace."headGraphJson", '$.events'), '') <> 'array'
  OR EXISTS (
    SELECT 1
    FROM json_each(workspace."headGraphJson", '$.events') event
    WHERE json_extract(event.value, '$.type') = 'SECTION'
      AND (
        json_extract(event.value, '$.parentSectionEventId') IS NOT NULL OR
        coalesce(json_extract(event.value, '$.detail.kind'), '') <> 'CITY' OR
        coalesce(json_extract(event.value, '$.detail.timeZone'), '') = ''
      )
  )
  OR EXISTS (
    SELECT 1
    FROM "WorkspaceRevision" revision
    WHERE revision."workspaceId" = workspace."id"
      AND (
        coalesce(json_type(revision."beforeGraphJson", '$.events'), '') <> 'array' OR
        coalesce(json_type(revision."afterGraphJson", '$.events'), '') <> 'array' OR
        EXISTS (
          SELECT 1
          FROM json_each(revision."beforeGraphJson", '$.events') event
          WHERE json_extract(event.value, '$.type') = 'SECTION'
            AND (
              json_extract(event.value, '$.parentSectionEventId') IS NOT NULL OR
              coalesce(json_extract(event.value, '$.detail.kind'), '') <> 'CITY' OR
              coalesce(json_extract(event.value, '$.detail.timeZone'), '') = ''
            )
        ) OR EXISTS (
          SELECT 1
          FROM json_each(revision."afterGraphJson", '$.events') event
          WHERE json_extract(event.value, '$.type') = 'SECTION'
            AND (
              json_extract(event.value, '$.parentSectionEventId') IS NOT NULL OR
              coalesce(json_extract(event.value, '$.detail.kind'), '') <> 'CITY' OR
              coalesce(json_extract(event.value, '$.detail.timeZone'), '') = ''
            )
        )
      )
  );

UPDATE "ProviderUsageLog"
SET "workspaceId" = NULL, "agentRunId" = NULL
WHERE "workspaceId" IN (SELECT "id" FROM "_legacy_workspace_ids")
OR "agentRunId" IN (
  SELECT "id" FROM "WorkspaceAgentRun"
  WHERE "workspaceId" IN (SELECT "id" FROM "_legacy_workspace_ids")
);
UPDATE "JourneyRevision"
SET "workspaceRevisionId" = NULL
WHERE "workspaceRevisionId" IN (
  SELECT "id" FROM "WorkspaceRevision"
  WHERE "workspaceId" IN (SELECT "id" FROM "_legacy_workspace_ids")
);
DELETE FROM "WorkspaceMessage"
WHERE "workspaceId" IN (SELECT "id" FROM "_legacy_workspace_ids");
DELETE FROM "WorkspaceSuggestion"
WHERE "workspaceId" IN (SELECT "id" FROM "_legacy_workspace_ids");
DELETE FROM "WorkspaceRevision"
WHERE "workspaceId" IN (SELECT "id" FROM "_legacy_workspace_ids");
DELETE FROM "WorkspaceAgentRun"
WHERE "workspaceId" IN (SELECT "id" FROM "_legacy_workspace_ids");
DELETE FROM "WorkspaceSession"
WHERE "id" IN (SELECT "id" FROM "_legacy_workspace_ids");

CREATE TEMP TABLE "_legacy_event_ids" AS
SELECT "id" FROM "JourneyEvent"
WHERE "journeyId" IN (SELECT "id" FROM "_legacy_journey_ids");

DELETE FROM "Journey"
WHERE "id" IN (SELECT "id" FROM "_legacy_journey_ids");
DELETE FROM "JourneyBranchSelection"
WHERE "journeyId" IN (SELECT "id" FROM "_legacy_journey_ids");
DELETE FROM "JourneyEventReplacement"
WHERE "journeyId" IN (SELECT "id" FROM "_legacy_journey_ids");
DELETE FROM "JourneyEventLink"
WHERE "journeyId" IN (SELECT "id" FROM "_legacy_journey_ids");
DELETE FROM "EventAssetLink"
WHERE "journeyId" IN (SELECT "id" FROM "_legacy_journey_ids");
DELETE FROM "EventSourceLink"
WHERE "journeyId" IN (SELECT "id" FROM "_legacy_journey_ids");
DELETE FROM "TransitSegment"
WHERE "transitPlanId" IN (
  SELECT "id" FROM "TransitPlan"
  WHERE "transitEventId" IN (SELECT "id" FROM "_legacy_event_ids")
);
DELETE FROM "TransitPlan"
WHERE "transitEventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "TransitPlanningRun"
WHERE "transitEventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "JourneyEvent"
WHERE "id" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "SectionEventDetail"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "VisitEventDetail"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "StayEventDetail"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "MealEventDetail"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "ActivityEventDetail"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "TransitEventDetail"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "NoteEventDetail"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "EventObservation"
WHERE "eventId" IN (SELECT "id" FROM "_legacy_event_ids");
DELETE FROM "JourneyRevision"
WHERE "journeyId" IN (SELECT "id" FROM "_legacy_journey_ids");

DROP TABLE "_legacy_event_ids";
DROP TABLE "_legacy_workspace_ids";
DROP TABLE "_legacy_journey_ids";

CREATE TABLE "new_SectionEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "timezone" TEXT,
    "placeId" TEXT,
    "lat" REAL,
    "lng" REAL,
    "coordinateSystem" TEXT,
    CONSTRAINT "SectionEventDetail_kind_check" CHECK ("kind" = 'CITY'),
    CONSTRAINT "SectionEventDetail_shape_check" CHECK (
      "timezone" IS NOT NULL AND length(trim("timezone")) > 0 AND
      ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND
      ("lng" IS NULL OR "lng" BETWEEN -180 AND 180) AND
      ("coordinateSystem" IS NULL OR "coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'))
    ),
    CONSTRAINT "SectionEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SectionEventDetail_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_SectionEventDetail" ("eventId", "kind", "timezone", "placeId", "lat", "lng", "coordinateSystem")
SELECT "eventId", "kind", "timezone", "placeId", "lat", "lng", "coordinateSystem"
FROM "SectionEventDetail"
WHERE "kind" = 'CITY';

DROP TABLE "SectionEventDetail";
ALTER TABLE "new_SectionEventDetail" RENAME TO "SectionEventDetail";
CREATE INDEX "SectionEventDetail_placeId_idx" ON "SectionEventDetail"("placeId");

CREATE TRIGGER "SectionEventDetail_insert_guard"
BEFORE INSERT ON "SectionEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'SECTION')
BEGIN SELECT RAISE(ABORT, 'SectionEventDetail requires a SECTION Event'); END;

CREATE TRIGGER "SectionEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "SectionEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'SECTION')
BEGIN SELECT RAISE(ABORT, 'SectionEventDetail requires a SECTION Event'); END;

CREATE TRIGGER "SectionEventDetail_delete_guard"
BEFORE DELETE ON "SectionEventDetail"
WHEN EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId")
BEGIN SELECT RAISE(ABORT, 'SectionEventDetail can only be deleted by deleting its Event'); END;

CREATE TRIGGER "JourneyEvent_type_update_guard"
BEFORE UPDATE OF "type" ON "JourneyEvent"
WHEN NEW."type" <> OLD."type" AND (
  EXISTS (SELECT 1 FROM "SectionEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "VisitEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "TransitEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "StayEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "MealEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "ActivityEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "NoteEventDetail" WHERE "eventId" = OLD."id")
)
BEGIN
  SELECT RAISE(ABORT, 'Event type is immutable once a typed detail exists');
END;

DROP TRIGGER IF EXISTS "JourneyEvent_parent_insert_guard";
DROP TRIGGER IF EXISTS "JourneyEvent_parent_update_guard";

CREATE TRIGGER "JourneyEvent_parent_insert_guard"
BEFORE INSERT ON "JourneyEvent"
WHEN NEW."parentSectionEventId" IS NOT NULL AND (
  NEW."type" = 'SECTION' OR NOT EXISTS (
    SELECT 1 FROM "JourneyEvent" parent
    WHERE parent."journeyId" = NEW."journeyId"
      AND parent."id" = NEW."parentSectionEventId"
      AND parent."type" = 'SECTION'
      AND parent."retiredRevision" IS NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'only non-SECTION Events may belong to an active CITY Section in the same Journey');
END;

CREATE TRIGGER "JourneyEvent_parent_update_guard"
BEFORE UPDATE OF "parentSectionEventId", "journeyId", "type" ON "JourneyEvent"
WHEN NEW."parentSectionEventId" IS NOT NULL AND (
  NEW."type" = 'SECTION' OR NOT EXISTS (
    SELECT 1 FROM "JourneyEvent" parent
    WHERE parent."journeyId" = NEW."journeyId"
      AND parent."id" = NEW."parentSectionEventId"
      AND parent."type" = 'SECTION'
      AND parent."retiredRevision" IS NULL
  )
)
BEGIN
  SELECT RAISE(ABORT, 'only non-SECTION Events may belong to an active CITY Section in the same Journey');
END;

CREATE TABLE "new_WorkspaceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "sourceJourneyId" TEXT,
    "baseJourneyRevision" INTEGER,
    "headWorkspaceRevision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "headGraphJson" TEXT NOT NULL,
    "lastAccessAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "WorkspaceSession_base_check" CHECK (("sourceJourneyId" IS NULL) = ("baseJourneyRevision" IS NULL)),
    CONSTRAINT "WorkspaceSession_revision_check" CHECK ("headWorkspaceRevision" >= 0 AND ("baseJourneyRevision" IS NULL OR "baseJourneyRevision" > 0)),
    CONSTRAINT "WorkspaceSession_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "WorkspaceSession_archive_check" CHECK (("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL)),
    CONSTRAINT "WorkspaceSession_json_check" CHECK (json_valid("headGraphJson") AND coalesce(json_type("headGraphJson", '$'), '') = 'object'),
    CONSTRAINT "WorkspaceSession_graph_identity_check" CHECK (
      coalesce(json_type("headGraphJson", '$.ownerId'), '') = 'text' AND
      json_extract("headGraphJson", '$.ownerId') = "ownerId" AND
      ("sourceJourneyId" IS NULL OR (coalesce(json_type("headGraphJson", '$.id'), '') = 'text' AND json_extract("headGraphJson", '$.id') = "sourceJourneyId"))
    ),
    CONSTRAINT "WorkspaceSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceSession_sourceJourneyId_fkey" FOREIGN KEY ("sourceJourneyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceSession_sourceJourneyId_baseJourneyRevision_fkey" FOREIGN KEY ("sourceJourneyId", "baseJourneyRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "lastAccessAt", "createdAt", "updatedAt", "archivedAt")
SELECT "id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "lastAccessAt", "createdAt", "updatedAt", "archivedAt"
FROM "WorkspaceSession"
WHERE "status" <> 'EXPIRED';

DROP TABLE "WorkspaceSession";
ALTER TABLE "new_WorkspaceSession" RENAME TO "WorkspaceSession";
CREATE INDEX "WorkspaceSession_ownerId_status_idx" ON "WorkspaceSession"("ownerId", "status");
CREATE INDEX "WorkspaceSession_sourceJourneyId_idx" ON "WorkspaceSession"("sourceJourneyId");

CREATE TRIGGER "WorkspaceSession_owner_insert_guard"
BEFORE INSERT ON "WorkspaceSession"
WHEN NEW."sourceJourneyId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = NEW."sourceJourneyId" AND journey."ownerId" = NEW."ownerId"
)
BEGIN SELECT RAISE(ABORT, 'Workspace source Journey must belong to its owner'); END;

CREATE TRIGGER "WorkspaceSession_owner_update_guard"
BEFORE UPDATE OF "ownerId", "sourceJourneyId" ON "WorkspaceSession"
WHEN NEW."ownerId" <> OLD."ownerId" OR (
  NEW."sourceJourneyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Journey" journey
    WHERE journey."id" = NEW."sourceJourneyId" AND journey."ownerId" = NEW."ownerId"
  )
)
BEGIN SELECT RAISE(ABORT, 'Workspace owner is immutable and its source Journey must belong to that owner'); END;

CREATE TRIGGER "WorkspaceSession_head_insert_guard"
BEFORE INSERT ON "WorkspaceSession"
WHEN NEW."headWorkspaceRevision" <> 0
BEGIN SELECT RAISE(ABORT, 'new Workspace must start at head revision 0'); END;

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

CREATE TRIGGER "WorkspaceRevision_delete_guard"
BEFORE DELETE ON "WorkspaceRevision"
WHEN EXISTS (
  SELECT 1 FROM "WorkspaceSession" workspace
  WHERE workspace."id" = OLD."workspaceId"
)
BEGIN SELECT RAISE(ABORT, 'Workspace revisions cannot be deleted while their Workspace exists'); END;

CREATE TRIGGER "WorkspaceRevision_identity_insert_guard"
BEFORE INSERT ON "WorkspaceRevision"
WHEN NOT EXISTS (
  SELECT 1 FROM "WorkspaceSession" workspace
  WHERE workspace."id" = NEW."workspaceId"
    AND json_extract(NEW."afterGraphJson", '$.ownerId') = workspace."ownerId"
    AND (workspace."sourceJourneyId" IS NULL OR json_extract(NEW."afterGraphJson", '$.id') = workspace."sourceJourneyId")
)
BEGIN SELECT RAISE(ABORT, 'WorkspaceRevision graph must preserve Workspace Journey identity and owner'); END;

CREATE TRIGGER "ProviderUsageLog_agent_run_update_guard"
BEFORE UPDATE OF "workspaceId", "agentRunId" ON "ProviderUsageLog"
WHEN NEW."agentRunId" IS NOT NULL AND (
  NEW."workspaceId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "WorkspaceAgentRun" run
    WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
  )
) AND NOT (
  OLD."workspaceId" IS NOT NULL AND
  NEW."workspaceId" IS NULL AND
  NEW."agentRunId" IS OLD."agentRunId" AND
  NOT EXISTS (
    SELECT 1 FROM "WorkspaceSession" workspace
    WHERE workspace."id" = OLD."workspaceId"
  )
)
BEGIN SELECT RAISE(ABORT, 'Provider usage Agent run must belong to the attributed Workspace'); END;

CREATE TRIGGER "TransitPlan_delete_guard"
BEFORE DELETE ON "TransitPlan"
WHEN EXISTS (
  SELECT 1 FROM "TransitPlanningRun" run
  WHERE run."id" = OLD."planningRunId" AND run."status" <> 'PLANNING'
)
BEGIN SELECT RAISE(ABORT, 'Plans cannot be deleted after a run leaves PLANNING'); END;

CREATE TRIGGER "TransitSegment_delete_guard"
BEFORE DELETE ON "TransitSegment"
WHEN EXISTS (
  SELECT 1 FROM "TransitPlan" plan
  JOIN "TransitPlanningRun" run ON run."id" = plan."planningRunId"
  WHERE plan."id" = OLD."transitPlanId" AND run."status" <> 'PLANNING'
)
BEGIN SELECT RAISE(ABORT, 'Segments cannot be deleted after a run leaves PLANNING'); END;

CREATE TRIGGER "TransitPlanningRun_delete_guard"
BEFORE DELETE ON "TransitPlanningRun"
WHEN OLD."status" <> 'PLANNING' AND EXISTS (
  SELECT 1 FROM "TransitEventDetail" detail
  WHERE detail."eventId" = OLD."transitEventId"
)
BEGIN SELECT RAISE(ABORT, 'finalized planning runs can only be deleted by purging their Transit Event'); END;

PRAGMA foreign_keys=ON;
