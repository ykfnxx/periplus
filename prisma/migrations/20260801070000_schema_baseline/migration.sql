-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "expiresAt" DATETIME NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,
    CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" DATETIME,
    "refreshTokenExpiresAt" DATETIME,
    "scope" TEXT,
    "password" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Journey_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "Journey_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'COMPLETED')),
    CONSTRAINT "Journey_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'UNLISTED', 'PUBLIC')),
    CONSTRAINT "Journey_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "Journey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "patchJson" TEXT NOT NULL,
    "inversePatchJson" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "parentRevisionId" TEXT,
    "workspaceRevisionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JourneyRevision_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "JourneyRevision_json_check" CHECK (
      json_valid("snapshotJson") AND coalesce(json_type("snapshotJson", '$'), '') = 'object' AND
      json_valid("patchJson") AND coalesce(json_type("patchJson", '$'), '') = 'array' AND
      json_valid("inversePatchJson") AND coalesce(json_type("inversePatchJson", '$'), '') = 'array'
    ),
    CONSTRAINT "JourneyRevision_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    ),
    CONSTRAINT "JourneyRevision_parent_check" CHECK (
      ("revision" = 1 AND "parentRevisionId" IS NULL) OR
      ("revision" > 1 AND "parentRevisionId" IS NOT NULL)
    ),
    CONSTRAINT "JourneyRevision_snapshot_identity_check" CHECK (
      coalesce(json_type("snapshotJson", '$.id'), '') = 'text' AND
      coalesce(json_type("snapshotJson", '$.revision'), '') = 'integer' AND
      json_extract("snapshotJson", '$.id') = "journeyId" AND
      json_extract("snapshotJson", '$.revision') = "revision"
    ),
    CONSTRAINT "JourneyRevision_text_check" CHECK (length(trim("operation")) > 0 AND length(trim("idempotencyKey")) > 0),
    CONSTRAINT "JourneyRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyRevision_journeyId_parentRevisionId_fkey" FOREIGN KEY ("journeyId", "parentRevisionId") REFERENCES "JourneyRevision" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyRevision_workspaceRevisionId_fkey" FOREIGN KEY ("workspaceRevisionId") REFERENCES "WorkspaceRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "parentSectionEventId" TEXT,
    "type" TEXT NOT NULL,
    "executionStatus" TEXT,
    "placementStatus" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "origin" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "plannedStartAt" DATETIME,
    "plannedEndAt" DATETIME,
    "actualStartAt" DATETIME,
    "actualEndAt" DATETIME,
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JourneyEvent_type_check" CHECK ("type" IN ('SECTION', 'VISIT', 'TRANSIT', 'STAY', 'MEAL', 'ACTIVITY', 'NOTE')),
    CONSTRAINT "JourneyEvent_execution_status_check" CHECK (
      ("type" IN ('SECTION', 'NOTE') AND "executionStatus" IS NULL) OR
      ("type" IN ('VISIT', 'TRANSIT', 'STAY', 'MEAL', 'ACTIVITY') AND "executionStatus" IN ('PLANNED', 'STARTED', 'CONFIRMED', 'SKIPPED', 'CANCELLED'))
    ),
    CONSTRAINT "JourneyEvent_section_time_check" CHECK (
      "type" <> 'SECTION' OR ("plannedStartAt" IS NULL AND "plannedEndAt" IS NULL AND "actualStartAt" IS NULL AND "actualEndAt" IS NULL)
    ),
    CONSTRAINT "JourneyEvent_placement_check" CHECK ("placementStatus" IN ('SCHEDULED', 'UNSCHEDULED')),
    CONSTRAINT "JourneyEvent_origin_check" CHECK ("origin" IN ('ORIGINAL', 'USER_INSERTED', 'AGENT_INSERTED', 'FORKED', 'SOURCE_DERIVED')),
    CONSTRAINT "JourneyEvent_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision")),
    CONSTRAINT "JourneyEvent_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "JourneyEvent_time_check" CHECK (
      ("plannedStartAt" IS NULL OR "plannedEndAt" IS NULL OR "plannedEndAt" >= "plannedStartAt") AND
      ("actualStartAt" IS NULL OR "actualEndAt" IS NULL OR "actualEndAt" >= "actualStartAt")
    ),
    CONSTRAINT "JourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEvent_journeyId_parentSectionEventId_fkey" FOREIGN KEY ("journeyId", "parentSectionEventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEvent_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEvent_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEventLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "fromEventId" TEXT NOT NULL,
    "toEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MAIN',
    "branchKey" TEXT,
    "rank" INTEGER NOT NULL,
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JourneyEventLink_kind_check" CHECK ("kind" IN ('MAIN', 'ALTERNATIVE')),
    CONSTRAINT "JourneyEventLink_branch_check" CHECK (("kind" = 'MAIN' AND "branchKey" IS NULL) OR ("kind" = 'ALTERNATIVE' AND "branchKey" IS NOT NULL)),
    CONSTRAINT "JourneyEventLink_rank_check" CHECK ("rank" >= 0),
    CONSTRAINT "JourneyEventLink_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision")),
    CONSTRAINT "JourneyEventLink_endpoint_check" CHECK ("fromEventId" <> "toEventId"),
    CONSTRAINT "JourneyEventLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventLink_journeyId_fromEventId_fkey" FOREIGN KEY ("journeyId", "fromEventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventLink_journeyId_toEventId_fkey" FOREIGN KEY ("journeyId", "toEventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventLink_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventLink_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEventReplacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "predecessorEventId" TEXT NOT NULL,
    "successorEventId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JourneyEventReplacement_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "JourneyEventReplacement_identity_check" CHECK ("predecessorEventId" <> "successorEventId"),
    CONSTRAINT "JourneyEventReplacement_reason_check" CHECK (length(trim("reason")) > 0),
    CONSTRAINT "JourneyEventReplacement_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventReplacement_journeyId_predecessorEventId_fkey" FOREIGN KEY ("journeyId", "predecessorEventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventReplacement_journeyId_successorEventId_fkey" FOREIGN KEY ("journeyId", "successorEventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventReplacement_journeyId_revision_fkey" FOREIGN KEY ("journeyId", "revision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyBranchSelection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "forkEventId" TEXT NOT NULL,
    "selectedLinkId" TEXT NOT NULL,
    "journeyRevision" INTEGER NOT NULL,
    "supersedesId" TEXT,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JourneyBranchSelection_revision_check" CHECK ("journeyRevision" > 0),
    CONSTRAINT "JourneyBranchSelection_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    ),
    CONSTRAINT "JourneyBranchSelection_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyBranchSelection_journeyId_forkEventId_fkey" FOREIGN KEY ("journeyId", "forkEventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyBranchSelection_journeyId_selectedLinkId_fkey" FOREIGN KEY ("journeyId", "selectedLinkId") REFERENCES "JourneyEventLink" ("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyBranchSelection_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "JourneyBranchSelection" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JourneyBranchSelection_journeyId_journeyRevision_fkey" FOREIGN KEY ("journeyId", "journeyRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "localDate" TEXT,
    "timezone" TEXT,
    "placeId" TEXT,
    "lat" REAL,
    "lng" REAL,
    "coordinateSystem" TEXT,
    "sourcePackId" TEXT,
    CONSTRAINT "SectionEventDetail_kind_check" CHECK ("kind" IN ('CITY', 'DAY', 'THEME')),
    CONSTRAINT "SectionEventDetail_shape_check" CHECK (
      ("kind" = 'DAY' AND "localDate" IS NOT NULL AND "localDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND "timezone" IS NOT NULL AND length(trim("timezone")) > 0 AND "placeId" IS NULL AND "lat" IS NULL AND "lng" IS NULL AND "coordinateSystem" IS NULL AND "sourcePackId" IS NULL) OR
      ("kind" = 'CITY' AND "localDate" IS NULL AND "timezone" IS NULL AND "sourcePackId" IS NULL AND ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND ("lng" IS NULL OR "lng" BETWEEN -180 AND 180) AND ("coordinateSystem" IS NULL OR "coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'))) OR
      ("kind" = 'THEME' AND "localDate" IS NULL AND "timezone" IS NULL AND "placeId" IS NULL AND "lat" IS NULL AND "lng" IS NULL AND "coordinateSystem" IS NULL)
    ),
    CONSTRAINT "SectionEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SectionEventDetail_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VisitEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" REAL NOT NULL,
    "plannedLng" REAL NOT NULL,
    "actualLat" REAL,
    "actualLng" REAL,
    "coordinateSystem" TEXT NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    CONSTRAINT "VisitEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL))),
    CONSTRAINT "VisitEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL')),
    CONSTRAINT "VisitEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0)),
    CONSTRAINT "VisitEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VisitEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VisitEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StayEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" REAL NOT NULL,
    "plannedLng" REAL NOT NULL,
    "actualLat" REAL,
    "actualLng" REAL,
    "coordinateSystem" TEXT NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "checkInNote" TEXT,
    CONSTRAINT "StayEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL))),
    CONSTRAINT "StayEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL')),
    CONSTRAINT "StayEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0)),
    CONSTRAINT "StayEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StayEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StayEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MealEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" REAL NOT NULL,
    "plannedLng" REAL NOT NULL,
    "actualLat" REAL,
    "actualLng" REAL,
    "coordinateSystem" TEXT NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "cuisine" TEXT,
    CONSTRAINT "MealEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL))),
    CONSTRAINT "MealEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL')),
    CONSTRAINT "MealEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0)),
    CONSTRAINT "MealEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MealEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivityEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" REAL NOT NULL,
    "plannedLng" REAL NOT NULL,
    "actualLat" REAL,
    "actualLng" REAL,
    "coordinateSystem" TEXT NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "bookingReference" TEXT,
    CONSTRAINT "ActivityEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL))),
    CONSTRAINT "ActivityEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL')),
    CONSTRAINT "ActivityEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0)),
    CONSTRAINT "ActivityEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ActivityEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ActivityEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransitEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "plannedFromEventId" TEXT,
    "plannedToEventId" TEXT,
    "actualFromEventId" TEXT,
    "actualToEventId" TEXT,
    "transportMode" TEXT NOT NULL,
    "requestMode" TEXT,
    "preference" TEXT,
    "plannedDepartAt" DATETIME,
    "actualDepartAt" DATETIME,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "plannedDistanceKm" REAL,
    "actualDistanceKm" REAL,
    "plannedCostEstimate" REAL,
    "actualCost" REAL,
    "activePlanningRunId" TEXT,
    "selectedPlanId" TEXT,
    "routeState" TEXT NOT NULL DEFAULT 'EMPTY',
    "notes" TEXT,
    CONSTRAINT "TransitEventDetail_transport_check" CHECK ("transportMode" IN ('FLIGHT', 'TRAIN', 'CAR', 'BUS', 'WALK', 'TAXI', 'SUBWAY', 'RENTAL')),
    CONSTRAINT "TransitEventDetail_request_check" CHECK ("requestMode" IS NULL OR "requestMode" IN ('DRIVE', 'WALK', 'TRANSIT')),
    CONSTRAINT "TransitEventDetail_preference_check" CHECK ("preference" IS NULL OR "preference" IN ('RECOMMENDED', 'FASTEST', 'LOW_COST', 'FEWER_TRANSFERS', 'LESS_WALKING')),
    CONSTRAINT "TransitEventDetail_value_check" CHECK (
      ("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND
      ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0) AND
      ("plannedDistanceKm" IS NULL OR "plannedDistanceKm" >= 0) AND
      ("actualDistanceKm" IS NULL OR "actualDistanceKm" >= 0) AND
      ("plannedCostEstimate" IS NULL OR "plannedCostEstimate" >= 0) AND
      ("actualCost" IS NULL OR "actualCost" >= 0)
    ),
    CONSTRAINT "TransitEventDetail_route_check" CHECK (
      ("routeState" = 'EMPTY' AND "activePlanningRunId" IS NULL AND "selectedPlanId" IS NULL) OR
      ("routeState" IN ('READY', 'ROUTE_STALE') AND "activePlanningRunId" IS NOT NULL AND "selectedPlanId" IS NOT NULL)
    ),
    CONSTRAINT "TransitEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_plannedFromEventId_fkey" FOREIGN KEY ("plannedFromEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_plannedToEventId_fkey" FOREIGN KEY ("plannedToEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_actualFromEventId_fkey" FOREIGN KEY ("actualFromEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_actualToEventId_fkey" FOREIGN KEY ("actualToEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_eventId_activePlanningRunId_fkey" FOREIGN KEY ("eventId", "activePlanningRunId") REFERENCES "TransitPlanningRun" ("transitEventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_eventId_activePlanningRunId_selectedPlanId_fkey" FOREIGN KEY ("eventId", "activePlanningRunId", "selectedPlanId") REFERENCES "TransitPlan" ("transitEventId", "planningRunId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    CONSTRAINT "NoteEventDetail_body_check" CHECK (length(trim("body")) > 0),
    CONSTRAINT "NoteEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransitPlanningRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transitEventId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "warning" TEXT,
    "calculatedAt" DATETIME NOT NULL,
    "validUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransitPlanningRun_status_check" CHECK ("status" IN ('PLANNING', 'READY', 'FAILED')),
    CONSTRAINT "TransitPlanningRun_failure_check" CHECK ("status" <> 'FAILED' OR "errorCode" IS NOT NULL OR "errorMessage" IS NOT NULL),
    CONSTRAINT "TransitPlanningRun_text_check" CHECK (length(trim("requestFingerprint")) > 0 AND length(trim("provider")) > 0),
    CONSTRAINT "TransitPlanningRun_time_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "calculatedAt"),
    CONSTRAINT "TransitPlanningRun_transitEventId_fkey" FOREIGN KEY ("transitEventId") REFERENCES "TransitEventDetail" ("eventId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransitPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planningRunId" TEXT NOT NULL,
    "transitEventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "distanceMeters" REAL NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "fareAmount" REAL,
    "trafficBasis" TEXT NOT NULL,
    "calculatedAt" DATETIME NOT NULL,
    "validUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransitPlan_value_check" CHECK ("rank" >= 0 AND "distanceMeters" >= 0 AND "durationSeconds" >= 0 AND ("fareAmount" IS NULL OR "fareAmount" >= 0)),
    CONSTRAINT "TransitPlan_traffic_check" CHECK ("trafficBasis" IN ('REALTIME', 'PREDICTED', 'TYPICAL', 'SCHEDULED', 'UNKNOWN')),
    CONSTRAINT "TransitPlan_text_check" CHECK (length(trim("provider")) > 0 AND length(trim("label")) > 0 AND length(trim("strategy")) > 0),
    CONSTRAINT "TransitPlan_time_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "calculatedAt"),
    CONSTRAINT "TransitPlan_transitEventId_planningRunId_fkey" FOREIGN KEY ("transitEventId", "planningRunId") REFERENCES "TransitPlanningRun" ("transitEventId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransitSegment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transitPlanId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "mode" TEXT NOT NULL,
    "fromName" TEXT,
    "toName" TEXT,
    "lineName" TEXT,
    "distanceMeters" REAL,
    "durationSeconds" INTEGER,
    "fareAmount" REAL,
    "departAt" DATETIME,
    "arriveAt" DATETIME,
    "coordinateSystem" TEXT NOT NULL,
    "geometryKind" TEXT NOT NULL,
    "positionsJson" TEXT NOT NULL,
    "trafficSectionsJson" TEXT,
    CONSTRAINT "TransitSegment_value_check" CHECK ("order" >= 0 AND ("distanceMeters" IS NULL OR "distanceMeters" >= 0) AND ("durationSeconds" IS NULL OR "durationSeconds" >= 0) AND ("fareAmount" IS NULL OR "fareAmount" >= 0)),
    CONSTRAINT "TransitSegment_mode_check" CHECK ("mode" IN ('WALK', 'DRIVE', 'BUS', 'SUBWAY', 'RAIL', 'TAXI', 'FLIGHT')),
    CONSTRAINT "TransitSegment_coordinate_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL')),
    CONSTRAINT "TransitSegment_geometry_check" CHECK ("geometryKind" IN ('ROAD_NETWORK', 'TRANSIT_LINE', 'SCHEMATIC', 'NONE')),
    CONSTRAINT "TransitSegment_json_check" CHECK (
      json_valid("positionsJson") AND coalesce(json_type("positionsJson", '$'), '') = 'array' AND
      ("trafficSectionsJson" IS NULL OR (json_valid("trafficSectionsJson") AND coalesce(json_type("trafficSectionsJson", '$'), '') = 'array'))
    ),
    CONSTRAINT "TransitSegment_time_check" CHECK ("departAt" IS NULL OR "arriveAt" IS NULL OR "arriveAt" >= "departAt"),
    CONSTRAINT "TransitSegment_transitPlanId_fkey" FOREIGN KEY ("transitPlanId") REFERENCES "TransitPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkspaceSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "sourceJourneyId" TEXT,
    "baseJourneyRevision" INTEGER,
    "headWorkspaceRevision" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "headGraphJson" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastAccessAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "WorkspaceSession_base_check" CHECK (("sourceJourneyId" IS NULL) = ("baseJourneyRevision" IS NULL)),
    CONSTRAINT "WorkspaceSession_revision_check" CHECK ("headWorkspaceRevision" >= 0 AND ("baseJourneyRevision" IS NULL OR "baseJourneyRevision" > 0)),
    CONSTRAINT "WorkspaceSession_status_check" CHECK ("status" IN ('ACTIVE', 'EXPIRED', 'ARCHIVED')),
    CONSTRAINT "WorkspaceSession_archive_check" CHECK (("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL)),
    CONSTRAINT "WorkspaceSession_json_check" CHECK (json_valid("headGraphJson") AND coalesce(json_type("headGraphJson", '$'), '') = 'object'),
    CONSTRAINT "WorkspaceSession_graph_identity_check" CHECK (
      coalesce(json_type("headGraphJson", '$.ownerId'), '') = 'text' AND
      json_extract("headGraphJson", '$.ownerId') = "ownerId" AND
      ("sourceJourneyId" IS NULL OR (coalesce(json_type("headGraphJson", '$.id'), '') = 'text' AND json_extract("headGraphJson", '$.id') = "sourceJourneyId"))
    ),
    CONSTRAINT "WorkspaceSession_time_check" CHECK ("expiresAt" > "createdAt" AND "lastAccessAt" >= "createdAt"),
    CONSTRAINT "WorkspaceSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceSession_sourceJourneyId_fkey" FOREIGN KEY ("sourceJourneyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceSession_sourceJourneyId_baseJourneyRevision_fkey" FOREIGN KEY ("sourceJourneyId", "baseJourneyRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkspaceRevision" (
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
    CONSTRAINT "WorkspaceRevision_command_check" CHECK ("commandName" IN ('journey.add_event', 'journey.update_event', 'journey.move_event', 'journey.place_event', 'journey.retire_event', 'journey.replace_event', 'journey.add_link', 'journey.retire_link', 'journey.select_branch', 'journey.plan_transit', 'journey.select_transit_plan', 'journey.confirm_actual', 'journey.skip_event', 'journey.cancel_event', 'journey.attach_asset', 'journey.add_observation', 'journey.link_source_item', 'journey.undo', 'workspace.refresh', 'workspace.replay', 'workspace.fork', 'workspace.commit')),
    CONSTRAINT "WorkspaceRevision_key_check" CHECK (length(trim("idempotencyKey")) > 0),
    CONSTRAINT "WorkspaceRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceRevision_workspaceId_parentRevisionId_fkey" FOREIGN KEY ("workspaceId", "parentRevisionId") REFERENCES "WorkspaceRevision" ("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkspaceMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "agentRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceMessage_role_check" CHECK ("role" IN ('USER', 'ASSISTANT', 'SYSTEM')),
    CONSTRAINT "WorkspaceMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMessage_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "WorkspaceAgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkspaceSuggestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "commandPayloadsJson" TEXT NOT NULL,
    "basedOnWorkspaceRevision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceSuggestion_revision_check" CHECK ("basedOnWorkspaceRevision" >= 0),
    CONSTRAINT "WorkspaceSuggestion_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'STALE')),
    CONSTRAINT "WorkspaceSuggestion_json_check" CHECK (json_valid("commandPayloadsJson") AND coalesce(json_type("commandPayloadsJson", '$'), '') = 'array'),
    CONSTRAINT "WorkspaceSuggestion_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "WorkspaceSuggestion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkspaceAgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceAgentRun_status_check" CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
    CONSTRAINT "WorkspaceAgentRun_completion_check" CHECK (("status" = 'RUNNING' AND "completedAt" IS NULL) OR ("status" <> 'RUNNING' AND "completedAt" IS NOT NULL)),
    CONSTRAINT "WorkspaceAgentRun_failure_check" CHECK ("status" <> 'FAILED' OR "errorCode" IS NOT NULL OR "errorMessage" IS NOT NULL),
    CONSTRAINT "WorkspaceAgentRun_time_check" CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt"),
    CONSTRAINT "WorkspaceAgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "capturedAt" DATETIME,
    "lat" REAL,
    "lng" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "Asset_kind_check" CHECK ("kind" IN ('IMAGE', 'VIDEO', 'AUDIO', 'FILE')),
    CONSTRAINT "Asset_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'JOURNEY', 'PUBLIC')),
    CONSTRAINT "Asset_size_check" CHECK ("sizeBytes" >= 0),
    CONSTRAINT "Asset_coordinate_check" CHECK ((("lat" IS NULL) = ("lng" IS NULL)) AND ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND ("lng" IS NULL OR "lng" BETWEEN -180 AND 180)),
    CONSTRAINT "Asset_text_check" CHECK (length(trim("storageKey")) > 0 AND length(trim("mimeType")) > 0 AND length(trim("checksum")) > 0),
    CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventAssetLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetChecksum" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "caption" TEXT,
    "visibility" TEXT NOT NULL,
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventAssetLink_role_check" CHECK ("role" IN ('COVER', 'GALLERY', 'RECEIPT', 'REFERENCE')),
    CONSTRAINT "EventAssetLink_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'JOURNEY', 'PUBLIC')),
    CONSTRAINT "EventAssetLink_rank_check" CHECK ("rank" >= 0),
    CONSTRAINT "EventAssetLink_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision")),
    CONSTRAINT "EventAssetLink_checksum_check" CHECK (length(trim("assetChecksum")) > 0),
    CONSTRAINT "EventAssetLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventAssetLink_journeyId_eventId_fkey" FOREIGN KEY ("journeyId", "eventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventAssetLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventAssetLink_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventAssetLink_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventObservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "body" TEXT,
    "valueJson" TEXT,
    "observedAt" DATETIME NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "supersedesId" TEXT,
    "visibility" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventObservation_kind_check" CHECK ("kind" IN ('NOTE', 'RATING', 'COST', 'WEATHER', 'FACT')),
    CONSTRAINT "EventObservation_phase_check" CHECK ("phase" IN ('PLANNED', 'ACTUAL')),
    CONSTRAINT "EventObservation_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'JOURNEY', 'PUBLIC')),
    CONSTRAINT "EventObservation_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    ),
    CONSTRAINT "EventObservation_value_check" CHECK (
      ("kind" IN ('NOTE', 'FACT') AND "body" IS NOT NULL AND length(trim("body")) > 0 AND "valueJson" IS NULL) OR
      ("kind" = 'RATING' AND json_valid("valueJson") AND json_type("valueJson", '$') IN ('integer', 'real') AND json_extract("valueJson", '$') BETWEEN 0 AND 5) OR
      ("kind" = 'COST' AND json_valid("valueJson") AND coalesce(json_type("valueJson", '$.amount'), '') IN ('integer', 'real') AND json_extract("valueJson", '$.amount') >= 0 AND coalesce(json_type("valueJson", '$.currency'), '') = 'text' AND json_extract("valueJson", '$.currency') GLOB '[A-Z][A-Z][A-Z]') OR
      ("kind" = 'WEATHER' AND json_valid("valueJson") AND coalesce(json_type("valueJson", '$.condition'), '') = 'text' AND length(trim(json_extract("valueJson", '$.condition'))) > 0 AND coalesce(json_type("valueJson", '$.temperatureCelsius'), '') IN ('integer', 'real'))
    ),
    CONSTRAINT "EventObservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventObservation_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "EventObservation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourcePack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "archivedAt" DATETIME,
    CONSTRAINT "SourcePack_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'SHARED')),
    CONSTRAINT "SourcePack_status_check" CHECK ("status" IN ('DRAFT', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED')),
    CONSTRAINT "SourcePack_archive_check" CHECK (("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL)),
    CONSTRAINT "SourcePack_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "SourcePack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourcePackId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pageCount" INTEGER,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceDocument_page_check" CHECK ("pageCount" IS NULL OR "pageCount" > 0),
    CONSTRAINT "SourceDocument_status_check" CHECK ("processingStatus" IN ('PENDING', 'PROCESSING', 'READY', 'FAILED')),
    CONSTRAINT "SourceDocument_text_check" CHECK (length(trim("checksum")) > 0 AND length(trim("title")) > 0),
    CONSTRAINT "SourceDocument_sourcePackId_fkey" FOREIGN KEY ("sourcePackId") REFERENCES "SourcePack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SourceDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceDocumentId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "sourceOrder" INTEGER NOT NULL,
    "page" TEXT,
    "confidence" REAL NOT NULL,
    "resolutionState" TEXT NOT NULL DEFAULT 'UNRESOLVED',
    "resolvedPlaceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SourceItem_kind_check" CHECK ("kind" IN ('PLACE', 'PERSON', 'EVENT', 'QUOTE', 'NOTE')),
    CONSTRAINT "SourceItem_order_check" CHECK ("sourceOrder" >= 0),
    CONSTRAINT "SourceItem_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
    CONSTRAINT "SourceItem_resolution_check" CHECK ("resolutionState" IN ('UNRESOLVED', 'CANDIDATE', 'CONFIRMED', 'REJECTED')),
    CONSTRAINT "SourceItem_title_check" CHECK (length(trim("title")) > 0),
    CONSTRAINT "SourceItem_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SourceItem_resolvedPlaceId_fkey" FOREIGN KEY ("resolvedPlaceId") REFERENCES "Place" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EventSourceLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceDocumentChecksum" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "excerpt" TEXT,
    "page" TEXT,
    "confidence" REAL NOT NULL,
    "rank" INTEGER NOT NULL,
    "approvedForJourneySharing" BOOLEAN NOT NULL DEFAULT false,
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventSourceLink_role_check" CHECK ("role" IN ('INSPIRATION', 'EVIDENCE', 'NAVIGATION')),
    CONSTRAINT "EventSourceLink_excerpt_check" CHECK ("excerpt" IS NULL OR length("excerpt") <= 500),
    CONSTRAINT "EventSourceLink_sharing_check" CHECK (NOT "approvedForJourneySharing" OR ("excerpt" IS NOT NULL AND length(trim("excerpt")) > 0)),
    CONSTRAINT "EventSourceLink_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
    CONSTRAINT "EventSourceLink_rank_check" CHECK ("rank" >= 0),
    CONSTRAINT "EventSourceLink_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision")),
    CONSTRAINT "EventSourceLink_checksum_check" CHECK (length(trim("sourceDocumentChecksum")) > 0),
    CONSTRAINT "EventSourceLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventSourceLink_journeyId_eventId_fkey" FOREIGN KEY ("journeyId", "eventId") REFERENCES "JourneyEvent" ("journeyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EventSourceLink_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventSourceLink_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventSourceLink_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EventSourceLink_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision" ("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "latWgs84" REAL,
    "lngWgs84" REAL,
    "latGcj02" REAL,
    "lngGcj02" REAL,
    "countryCode" TEXT,
    "province" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "description" TEXT,
    "popularityScore" REAL,
    "sourceQuality" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Place_category_check" CHECK ("category" IN ('SIGHT', 'PARK', 'MUSEUM', 'CULTURE', 'PERFORMANCE', 'SPORTS', 'ENTERTAINMENT', 'RESTAURANT', 'HOTEL', 'TRANSIT', 'OTHER')),
    CONSTRAINT "Place_source_quality_check" CHECK ("sourceQuality" IN ('VERIFIED', 'PROBABLE', 'CANDIDATE', 'NEEDS_REVIEW')),
    CONSTRAINT "Place_coordinate_check" CHECK (
      (("latWgs84" IS NULL) = ("lngWgs84" IS NULL)) AND ("latWgs84" IS NULL OR "latWgs84" BETWEEN -90 AND 90) AND ("lngWgs84" IS NULL OR "lngWgs84" BETWEEN -180 AND 180) AND
      (("latGcj02" IS NULL) = ("lngGcj02" IS NULL)) AND ("latGcj02" IS NULL OR "latGcj02" BETWEEN -90 AND 90) AND ("lngGcj02" IS NULL OR "lngGcj02" BETWEEN -180 AND 180)
    ),
    CONSTRAINT "Place_popularity_check" CHECK ("popularityScore" IS NULL OR "popularityScore" >= 0),
    CONSTRAINT "Place_name_check" CHECK (length(trim("name")) > 0 AND length(trim("normalizedName")) > 0)
);

-- CreateTable
CREATE TABLE "PlaceAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "locale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaceAlias_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaceSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawCategory" TEXT,
    "rawPayload" TEXT,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaceSource_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlaceProviderMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "coordinateSystem" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "address" TEXT,
    "adcode" TEXT,
    "typeCode" TEXT,
    "matchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaceProviderMatch_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
    CONSTRAINT "PlaceProviderMatch_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL')),
    CONSTRAINT "PlaceProviderMatch_coordinate_check" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180),
    CONSTRAINT "PlaceProviderMatch_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RawPlaceCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "queryHash" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT,
    "lat" REAL,
    "lng" REAL,
    "coordinateSystem" TEXT,
    "rawPayload" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CACHED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RawPlaceCandidate_category_check" CHECK ("category" IS NULL OR "category" IN ('SIGHT', 'PARK', 'MUSEUM', 'CULTURE', 'PERFORMANCE', 'SPORTS', 'ENTERTAINMENT', 'RESTAURANT', 'HOTEL', 'TRANSIT', 'OTHER')),
    CONSTRAINT "RawPlaceCandidate_system_check" CHECK ("coordinateSystem" IS NULL OR "coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL')),
    CONSTRAINT "RawPlaceCandidate_coordinate_check" CHECK ((("lat" IS NULL) = ("lng" IS NULL)) AND ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND ("lng" IS NULL OR "lng" BETWEEN -180 AND 180)),
    CONSTRAINT "RawPlaceCandidate_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1),
    CONSTRAINT "RawPlaceCandidate_name_check" CHECK (length(trim("name")) > 0 AND length(trim("normalizedName")) > 0)
);

-- CreateTable
CREATE TABLE "ProviderRequestCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProviderRequestCache_json_check" CHECK (json_valid("responseJson")),
    CONSTRAINT "ProviderRequestCache_text_check" CHECK (length(trim("provider")) > 0 AND length(trim("cacheKey")) > 0)
);

-- CreateTable
CREATE TABLE "ProviderUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "userId" TEXT,
    "workspaceId" TEXT,
    "agentRunId" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProviderUsageLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProviderUsageLog_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "WorkspaceAgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON "account"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "Journey_ownerId_idx" ON "Journey"("ownerId");

-- CreateIndex
CREATE INDEX "Journey_deletedAt_idx" ON "Journey"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRevision_workspaceRevisionId_key" ON "JourneyRevision"("workspaceRevisionId");

-- CreateIndex
CREATE INDEX "JourneyRevision_createdAt_idx" ON "JourneyRevision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRevision_journeyId_revision_key" ON "JourneyRevision"("journeyId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRevision_journeyId_id_key" ON "JourneyRevision"("journeyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRevision_journeyId_parentRevisionId_key" ON "JourneyRevision"("journeyId", "parentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyRevision_journeyId_idempotencyKey_key" ON "JourneyRevision"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_parentSectionEventId_idx" ON "JourneyEvent"("journeyId", "parentSectionEventId");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_type_idx" ON "JourneyEvent"("journeyId", "type");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_executionStatus_idx" ON "JourneyEvent"("journeyId", "executionStatus");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_placementStatus_idx" ON "JourneyEvent"("journeyId", "placementStatus");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_retiredRevision_idx" ON "JourneyEvent"("journeyId", "retiredRevision");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEvent_journeyId_id_key" ON "JourneyEvent"("journeyId", "id");

-- CreateIndex
CREATE INDEX "JourneyEventLink_journeyId_kind_retiredRevision_idx" ON "JourneyEventLink"("journeyId", "kind", "retiredRevision");

-- CreateIndex
CREATE INDEX "JourneyEventLink_journeyId_fromEventId_idx" ON "JourneyEventLink"("journeyId", "fromEventId");

-- CreateIndex
CREATE INDEX "JourneyEventLink_journeyId_toEventId_idx" ON "JourneyEventLink"("journeyId", "toEventId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEventLink_journeyId_id_key" ON "JourneyEventLink"("journeyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEventLink_journeyId_fromEventId_toEventId_kind_introducedRevision_key" ON "JourneyEventLink"("journeyId", "fromEventId", "toEventId", "kind", "introducedRevision");

-- CreateIndex
CREATE INDEX "JourneyEventReplacement_journeyId_revision_idx" ON "JourneyEventReplacement"("journeyId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEventReplacement_journeyId_predecessorEventId_key" ON "JourneyEventReplacement"("journeyId", "predecessorEventId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEventReplacement_journeyId_successorEventId_key" ON "JourneyEventReplacement"("journeyId", "successorEventId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyBranchSelection_supersedesId_key" ON "JourneyBranchSelection"("supersedesId");

-- CreateIndex
CREATE INDEX "JourneyBranchSelection_journeyId_forkEventId_createdAt_idx" ON "JourneyBranchSelection"("journeyId", "forkEventId", "createdAt");

-- CreateIndex
CREATE INDEX "JourneyBranchSelection_journeyId_journeyRevision_idx" ON "JourneyBranchSelection"("journeyId", "journeyRevision");

-- CreateIndex
CREATE INDEX "SectionEventDetail_placeId_idx" ON "SectionEventDetail"("placeId");

-- CreateIndex
CREATE INDEX "VisitEventDetail_plannedPlaceId_idx" ON "VisitEventDetail"("plannedPlaceId");

-- CreateIndex
CREATE INDEX "VisitEventDetail_actualPlaceId_idx" ON "VisitEventDetail"("actualPlaceId");

-- CreateIndex
CREATE INDEX "StayEventDetail_plannedPlaceId_idx" ON "StayEventDetail"("plannedPlaceId");

-- CreateIndex
CREATE INDEX "StayEventDetail_actualPlaceId_idx" ON "StayEventDetail"("actualPlaceId");

-- CreateIndex
CREATE INDEX "MealEventDetail_plannedPlaceId_idx" ON "MealEventDetail"("plannedPlaceId");

-- CreateIndex
CREATE INDEX "MealEventDetail_actualPlaceId_idx" ON "MealEventDetail"("actualPlaceId");

-- CreateIndex
CREATE INDEX "ActivityEventDetail_plannedPlaceId_idx" ON "ActivityEventDetail"("plannedPlaceId");

-- CreateIndex
CREATE INDEX "ActivityEventDetail_actualPlaceId_idx" ON "ActivityEventDetail"("actualPlaceId");

-- CreateIndex
CREATE INDEX "TransitEventDetail_plannedFromEventId_idx" ON "TransitEventDetail"("plannedFromEventId");

-- CreateIndex
CREATE INDEX "TransitEventDetail_plannedToEventId_idx" ON "TransitEventDetail"("plannedToEventId");

-- CreateIndex
CREATE INDEX "TransitEventDetail_actualFromEventId_idx" ON "TransitEventDetail"("actualFromEventId");

-- CreateIndex
CREATE INDEX "TransitEventDetail_actualToEventId_idx" ON "TransitEventDetail"("actualToEventId");

-- CreateIndex
CREATE INDEX "TransitPlanningRun_transitEventId_status_idx" ON "TransitPlanningRun"("transitEventId", "status");

-- CreateIndex
CREATE INDEX "TransitPlanningRun_requestFingerprint_idx" ON "TransitPlanningRun"("requestFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "TransitPlanningRun_transitEventId_id_key" ON "TransitPlanningRun"("transitEventId", "id");

-- CreateIndex
CREATE INDEX "TransitPlan_transitEventId_planningRunId_idx" ON "TransitPlan"("transitEventId", "planningRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TransitPlan_transitEventId_planningRunId_id_key" ON "TransitPlan"("transitEventId", "planningRunId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "TransitPlan_planningRunId_rank_key" ON "TransitPlan"("planningRunId", "rank");

-- CreateIndex
CREATE INDEX "TransitSegment_transitPlanId_idx" ON "TransitSegment"("transitPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "TransitSegment_transitPlanId_order_key" ON "TransitSegment"("transitPlanId", "order");

-- CreateIndex
CREATE INDEX "WorkspaceSession_ownerId_status_idx" ON "WorkspaceSession"("ownerId", "status");

-- CreateIndex
CREATE INDEX "WorkspaceSession_sourceJourneyId_idx" ON "WorkspaceSession"("sourceJourneyId");

-- CreateIndex
CREATE INDEX "WorkspaceSession_expiresAt_idx" ON "WorkspaceSession"("expiresAt");

-- CreateIndex
CREATE INDEX "WorkspaceRevision_createdAt_idx" ON "WorkspaceRevision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_revision_key" ON "WorkspaceRevision"("workspaceId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_id_key" ON "WorkspaceRevision"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_parentRevisionId_key" ON "WorkspaceRevision"("workspaceId", "parentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceRevision_workspaceId_idempotencyKey_key" ON "WorkspaceRevision"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkspaceMessage_workspaceId_createdAt_idx" ON "WorkspaceMessage"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceMessage_agentRunId_idx" ON "WorkspaceMessage"("agentRunId");

-- CreateIndex
CREATE INDEX "WorkspaceSuggestion_workspaceId_status_idx" ON "WorkspaceSuggestion"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WorkspaceAgentRun_workspaceId_status_idx" ON "WorkspaceAgentRun"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_ownerId_createdAt_idx" ON "Asset"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_checksum_idx" ON "Asset"("checksum");

-- CreateIndex
CREATE INDEX "Asset_deletedAt_idx" ON "Asset"("deletedAt");

-- CreateIndex
CREATE INDEX "EventAssetLink_journeyId_eventId_retiredRevision_idx" ON "EventAssetLink"("journeyId", "eventId", "retiredRevision");

-- CreateIndex
CREATE INDEX "EventAssetLink_assetId_idx" ON "EventAssetLink"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAssetLink_eventId_assetId_role_introducedRevision_key" ON "EventAssetLink"("eventId", "assetId", "role", "introducedRevision");

-- CreateIndex
CREATE UNIQUE INDEX "EventObservation_supersedesId_key" ON "EventObservation"("supersedesId");

-- CreateIndex
CREATE INDEX "EventObservation_eventId_observedAt_idx" ON "EventObservation"("eventId", "observedAt");

-- CreateIndex
CREATE INDEX "SourcePack_ownerId_status_idx" ON "SourcePack"("ownerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDocument_assetId_key" ON "SourceDocument"("assetId");

-- CreateIndex
CREATE INDEX "SourceDocument_sourcePackId_idx" ON "SourceDocument"("sourcePackId");

-- CreateIndex
CREATE INDEX "SourceDocument_checksum_idx" ON "SourceDocument"("checksum");

-- CreateIndex
CREATE INDEX "SourceItem_resolvedPlaceId_idx" ON "SourceItem"("resolvedPlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SourceItem_sourceDocumentId_sourceOrder_key" ON "SourceItem"("sourceDocumentId", "sourceOrder");

-- CreateIndex
CREATE INDEX "EventSourceLink_journeyId_eventId_retiredRevision_idx" ON "EventSourceLink"("journeyId", "eventId", "retiredRevision");

-- CreateIndex
CREATE INDEX "EventSourceLink_sourceItemId_idx" ON "EventSourceLink"("sourceItemId");

-- CreateIndex
CREATE INDEX "EventSourceLink_sourceDocumentId_idx" ON "EventSourceLink"("sourceDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventSourceLink_eventId_sourceItemId_role_introducedRevision_key" ON "EventSourceLink"("eventId", "sourceItemId", "role", "introducedRevision");

-- CreateIndex
CREATE INDEX "Place_normalizedName_idx" ON "Place"("normalizedName");

-- CreateIndex
CREATE INDEX "Place_city_idx" ON "Place"("city");

-- CreateIndex
CREATE INDEX "Place_category_idx" ON "Place"("category");

-- CreateIndex
CREATE INDEX "Place_sourceQuality_idx" ON "Place"("sourceQuality");

-- CreateIndex
CREATE INDEX "PlaceAlias_normalizedName_idx" ON "PlaceAlias"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceAlias_placeId_normalizedName_key" ON "PlaceAlias"("placeId", "normalizedName");

-- CreateIndex
CREATE INDEX "PlaceSource_placeId_idx" ON "PlaceSource"("placeId");

-- CreateIndex
CREATE INDEX "PlaceSource_provider_idx" ON "PlaceSource"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceSource_provider_providerId_key" ON "PlaceSource"("provider", "providerId");

-- CreateIndex
CREATE INDEX "PlaceProviderMatch_placeId_idx" ON "PlaceProviderMatch"("placeId");

-- CreateIndex
CREATE INDEX "PlaceProviderMatch_provider_idx" ON "PlaceProviderMatch"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceProviderMatch_provider_providerId_key" ON "PlaceProviderMatch"("provider", "providerId");

-- CreateIndex
CREATE INDEX "RawPlaceCandidate_provider_providerId_idx" ON "RawPlaceCandidate"("provider", "providerId");

-- CreateIndex
CREATE INDEX "RawPlaceCandidate_normalizedName_idx" ON "RawPlaceCandidate"("normalizedName");

-- CreateIndex
CREATE INDEX "RawPlaceCandidate_queryHash_idx" ON "RawPlaceCandidate"("queryHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderRequestCache_cacheKey_key" ON "ProviderRequestCache"("cacheKey");

-- CreateIndex
CREATE INDEX "ProviderRequestCache_provider_idx" ON "ProviderRequestCache"("provider");

-- CreateIndex
CREATE INDEX "ProviderRequestCache_expiresAt_idx" ON "ProviderRequestCache"("expiresAt");

-- CreateIndex
CREATE INDEX "ProviderUsageLog_provider_purpose_idx" ON "ProviderUsageLog"("provider", "purpose");

-- CreateIndex
CREATE INDEX "ProviderUsageLog_userId_idx" ON "ProviderUsageLog"("userId");

-- CreateIndex
CREATE INDEX "ProviderUsageLog_workspaceId_idx" ON "ProviderUsageLog"("workspaceId");

-- CreateIndex
CREATE INDEX "ProviderUsageLog_agentRunId_idx" ON "ProviderUsageLog"("agentRunId");

-- CreateIndex
CREATE INDEX "ProviderUsageLog_requestId_idx" ON "ProviderUsageLog"("requestId");

-- CreateIndex
CREATE INDEX "ProviderUsageLog_createdAt_idx" ON "ProviderUsageLog"("createdAt");

-- SQLite-only active-state indexes. Retired rows remain addressable history.
CREATE UNIQUE INDEX "JourneyEventLink_current_main_from_key"
ON "JourneyEventLink"("journeyId", "fromEventId")
WHERE "kind" = 'MAIN' AND "retiredRevision" IS NULL;

CREATE UNIQUE INDEX "JourneyEventLink_current_main_to_key"
ON "JourneyEventLink"("journeyId", "toEventId")
WHERE "kind" = 'MAIN' AND "retiredRevision" IS NULL;

CREATE UNIQUE INDEX "EventAssetLink_current_rank_key"
ON "EventAssetLink"("eventId", "role", "rank")
WHERE "retiredRevision" IS NULL;

CREATE UNIQUE INDEX "EventSourceLink_current_rank_key"
ON "EventSourceLink"("eventId", "role", "rank")
WHERE "retiredRevision" IS NULL;

-- Parent containment and active scope-local topology.
CREATE TRIGGER "JourneyEvent_parent_insert_guard"
BEFORE INSERT ON "JourneyEvent"
WHEN NEW."parentSectionEventId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "JourneyEvent" parent
  WHERE parent."journeyId" = NEW."journeyId"
    AND parent."id" = NEW."parentSectionEventId"
    AND parent."type" = 'SECTION'
    AND parent."retiredRevision" IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'parentSectionEventId must reference an active SECTION in the same Journey');
END;

CREATE TRIGGER "Journey_revision_update_guard"
BEFORE UPDATE OF "revision" ON "Journey"
WHEN NEW."revision" <> OLD."revision" AND (
  NEW."revision" <> OLD."revision" + 1 OR NOT EXISTS (
    SELECT 1 FROM "JourneyRevision" revision
    WHERE revision."journeyId" = NEW."id" AND revision."revision" = NEW."revision"
  )
)
BEGIN
  SELECT RAISE(ABORT, 'Journey revision must advance by one to a persisted JourneyRevision');
END;

CREATE TRIGGER "JourneyEvent_parent_update_guard"
BEFORE UPDATE OF "parentSectionEventId", "journeyId" ON "JourneyEvent"
WHEN NEW."parentSectionEventId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "JourneyEvent" parent
  WHERE parent."journeyId" = NEW."journeyId"
    AND parent."id" = NEW."parentSectionEventId"
    AND parent."type" = 'SECTION'
    AND parent."retiredRevision" IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'parentSectionEventId must reference an active SECTION in the same Journey');
END;

CREATE TRIGGER "JourneyEvent_active_topology_update_guard"
BEFORE UPDATE OF "parentSectionEventId", "placementStatus", "retiredRevision" ON "JourneyEvent"
WHEN EXISTS (
  SELECT 1 FROM "JourneyEventLink" link
  WHERE link."journeyId" = OLD."journeyId"
    AND (link."fromEventId" = OLD."id" OR link."toEventId" = OLD."id")
    AND link."retiredRevision" IS NULL
) AND (
  NEW."parentSectionEventId" IS NOT OLD."parentSectionEventId" OR
  NEW."placementStatus" = 'UNSCHEDULED' OR
  NEW."retiredRevision" IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'active links must be retired before moving, unscheduling, or retiring an Event');
END;

CREATE TRIGGER "JourneyEventLink_insert_guard"
BEFORE INSERT ON "JourneyEventLink"
WHEN NEW."retiredRevision" IS NULL AND NOT EXISTS (
  SELECT 1
  FROM "JourneyEvent" source
  JOIN "JourneyEvent" target
    ON target."journeyId" = source."journeyId"
   AND target."id" = NEW."toEventId"
  WHERE source."journeyId" = NEW."journeyId"
    AND source."id" = NEW."fromEventId"
    AND source."placementStatus" = 'SCHEDULED'
    AND target."placementStatus" = 'SCHEDULED'
    AND source."retiredRevision" IS NULL
    AND target."retiredRevision" IS NULL
    AND source."parentSectionEventId" IS target."parentSectionEventId"
)
BEGIN
  SELECT RAISE(ABORT, 'active Link endpoints must be active, scheduled, and in the same scope');
END;

CREATE TRIGGER "JourneyEventLink_update_guard"
BEFORE UPDATE OF "journeyId", "fromEventId", "toEventId", "retiredRevision" ON "JourneyEventLink"
WHEN NEW."retiredRevision" IS NULL AND NOT EXISTS (
  SELECT 1
  FROM "JourneyEvent" source
  JOIN "JourneyEvent" target
    ON target."journeyId" = source."journeyId"
   AND target."id" = NEW."toEventId"
  WHERE source."journeyId" = NEW."journeyId"
    AND source."id" = NEW."fromEventId"
    AND source."placementStatus" = 'SCHEDULED'
    AND target."placementStatus" = 'SCHEDULED'
    AND source."retiredRevision" IS NULL
    AND target."retiredRevision" IS NULL
    AND source."parentSectionEventId" IS target."parentSectionEventId"
)
BEGIN
  SELECT RAISE(ABORT, 'active Link endpoints must be active, scheduled, and in the same scope');
END;

CREATE TRIGGER "JourneyEventLink_current_selection_retire_guard"
BEFORE UPDATE OF "retiredRevision" ON "JourneyEventLink"
WHEN OLD."retiredRevision" IS NULL AND NEW."retiredRevision" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "JourneyBranchSelection" current
  WHERE current."journeyId" = OLD."journeyId"
    AND current."selectedLinkId" = OLD."id"
    AND NOT EXISTS (
      SELECT 1 FROM "JourneyBranchSelection" newer
      WHERE newer."supersedesId" = current."id"
    )
)
BEGIN
  SELECT RAISE(ABORT, 'current branch selection must be superseded before retiring its Link');
END;

-- Table-per-type rows may only attach to their matching Event discriminator.
CREATE TRIGGER "SectionEventDetail_insert_guard"
BEFORE INSERT ON "SectionEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'SECTION')
BEGIN SELECT RAISE(ABORT, 'SectionEventDetail requires a SECTION Event'); END;

CREATE TRIGGER "SectionEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "SectionEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'SECTION')
BEGIN SELECT RAISE(ABORT, 'SectionEventDetail requires a SECTION Event'); END;

CREATE TRIGGER "VisitEventDetail_insert_guard"
BEFORE INSERT ON "VisitEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'VISIT')
BEGIN SELECT RAISE(ABORT, 'VisitEventDetail requires a VISIT Event'); END;

CREATE TRIGGER "VisitEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "VisitEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'VISIT')
BEGIN SELECT RAISE(ABORT, 'VisitEventDetail requires a VISIT Event'); END;

CREATE TRIGGER "StayEventDetail_insert_guard"
BEFORE INSERT ON "StayEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'STAY')
BEGIN SELECT RAISE(ABORT, 'StayEventDetail requires a STAY Event'); END;

CREATE TRIGGER "StayEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "StayEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'STAY')
BEGIN SELECT RAISE(ABORT, 'StayEventDetail requires a STAY Event'); END;

CREATE TRIGGER "MealEventDetail_insert_guard"
BEFORE INSERT ON "MealEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'MEAL')
BEGIN SELECT RAISE(ABORT, 'MealEventDetail requires a MEAL Event'); END;

CREATE TRIGGER "MealEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "MealEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'MEAL')
BEGIN SELECT RAISE(ABORT, 'MealEventDetail requires a MEAL Event'); END;

CREATE TRIGGER "ActivityEventDetail_insert_guard"
BEFORE INSERT ON "ActivityEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'ACTIVITY')
BEGIN SELECT RAISE(ABORT, 'ActivityEventDetail requires an ACTIVITY Event'); END;

CREATE TRIGGER "ActivityEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "ActivityEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'ACTIVITY')
BEGIN SELECT RAISE(ABORT, 'ActivityEventDetail requires an ACTIVITY Event'); END;

CREATE TRIGGER "TransitEventDetail_insert_guard"
BEFORE INSERT ON "TransitEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'TRANSIT')
BEGIN SELECT RAISE(ABORT, 'TransitEventDetail requires a TRANSIT Event'); END;

CREATE TRIGGER "TransitEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "TransitEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'TRANSIT')
BEGIN SELECT RAISE(ABORT, 'TransitEventDetail requires a TRANSIT Event'); END;

CREATE TRIGGER "TransitEventDetail_endpoint_insert_guard"
BEFORE INSERT ON "TransitEventDetail"
WHEN EXISTS (
  SELECT 1 FROM "JourneyEvent" transit
  WHERE transit."id" = NEW."eventId" AND (
    (NEW."plannedFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."plannedToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL))
  )
)
BEGIN SELECT RAISE(ABORT, 'Transit endpoints must be active, scheduled, and in the same Journey scope'); END;

CREATE TRIGGER "TransitEventDetail_endpoint_update_guard"
BEFORE UPDATE OF "eventId", "plannedFromEventId", "plannedToEventId", "actualFromEventId", "actualToEventId" ON "TransitEventDetail"
WHEN EXISTS (
  SELECT 1 FROM "JourneyEvent" transit
  WHERE transit."id" = NEW."eventId" AND (
    (NEW."plannedFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."plannedToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL))
  )
)
BEGIN SELECT RAISE(ABORT, 'Transit endpoints must be active, scheduled, and in the same Journey scope'); END;

CREATE TRIGGER "NoteEventDetail_insert_guard"
BEFORE INSERT ON "NoteEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'NOTE')
BEGIN SELECT RAISE(ABORT, 'NoteEventDetail requires a NOTE Event'); END;

CREATE TRIGGER "NoteEventDetail_update_guard"
BEFORE UPDATE OF "eventId" ON "NoteEventDetail"
WHEN NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'NOTE')
BEGIN SELECT RAISE(ABORT, 'NoteEventDetail requires a NOTE Event'); END;

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

CREATE TRIGGER "JourneyEventReplacement_cycle_guard"
BEFORE INSERT ON "JourneyEventReplacement"
WHEN EXISTS (
  WITH RECURSIVE successor_chain("eventId") AS (
    SELECT NEW."successorEventId"
    UNION ALL
    SELECT replacement."successorEventId"
    FROM "JourneyEventReplacement" replacement
    JOIN successor_chain chain
      ON replacement."journeyId" = NEW."journeyId"
     AND replacement."predecessorEventId" = chain."eventId"
  )
  SELECT 1 FROM successor_chain WHERE "eventId" = NEW."predecessorEventId"
)
BEGIN
  SELECT RAISE(ABORT, 'replacement chain cannot contain a cycle');
END;

CREATE TRIGGER "JourneyEventReplacement_scope_guard"
BEFORE INSERT ON "JourneyEventReplacement"
WHEN NOT EXISTS (
  SELECT 1 FROM "JourneyEvent" predecessor
  JOIN "JourneyEvent" successor
    ON successor."journeyId" = predecessor."journeyId"
   AND successor."id" = NEW."successorEventId"
  WHERE predecessor."journeyId" = NEW."journeyId"
    AND predecessor."id" = NEW."predecessorEventId"
    AND predecessor."parentSectionEventId" IS successor."parentSectionEventId"
)
BEGIN
  SELECT RAISE(ABORT, 'replacement Events must remain in the same scope');
END;

CREATE TRIGGER "JourneyEventReplacement_update_guard"
BEFORE UPDATE ON "JourneyEventReplacement"
BEGIN SELECT RAISE(ABORT, 'replacement records are append-only'); END;

CREATE TRIGGER "JourneyEventReplacement_delete_guard"
BEFORE DELETE ON "JourneyEventReplacement"
WHEN EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = OLD."journeyId" AND journey."deletedAt" IS NULL
)
BEGIN SELECT RAISE(ABORT, 'replacement records can only be deleted during explicit Journey purge'); END;

CREATE TRIGGER "JourneyBranchSelection_insert_guard"
BEFORE INSERT ON "JourneyBranchSelection"
WHEN
  NOT EXISTS (
    SELECT 1 FROM "JourneyEventLink" link
    WHERE link."journeyId" = NEW."journeyId"
      AND link."id" = NEW."selectedLinkId"
      AND link."fromEventId" = NEW."forkEventId"
      AND link."retiredRevision" IS NULL
  ) OR
  (NEW."supersedesId" IS NULL AND EXISTS (
    SELECT 1 FROM "JourneyBranchSelection" current
    WHERE current."journeyId" = NEW."journeyId"
      AND current."forkEventId" = NEW."forkEventId"
      AND NOT EXISTS (
        SELECT 1 FROM "JourneyBranchSelection" newer
        WHERE newer."supersedesId" = current."id"
      )
  )) OR
  (NEW."supersedesId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "JourneyBranchSelection" previous
    WHERE previous."id" = NEW."supersedesId"
      AND previous."journeyId" = NEW."journeyId"
      AND previous."forkEventId" = NEW."forkEventId"
      AND previous."journeyRevision" < NEW."journeyRevision"
      AND previous."createdAt" < NEW."createdAt"
      AND NOT EXISTS (
        SELECT 1 FROM "JourneyBranchSelection" newer
        WHERE newer."supersedesId" = previous."id"
      )
  ))
BEGIN
  SELECT RAISE(ABORT, 'branch selection must select an active outgoing Link and supersede the current decision');
END;

CREATE TRIGGER "JourneyBranchSelection_update_guard"
BEFORE UPDATE ON "JourneyBranchSelection"
BEGIN SELECT RAISE(ABORT, 'branch selections are append-only'); END;

CREATE TRIGGER "JourneyBranchSelection_delete_guard"
BEFORE DELETE ON "JourneyBranchSelection"
WHEN EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = OLD."journeyId" AND journey."deletedAt" IS NULL
)
BEGIN SELECT RAISE(ABORT, 'branch selections can only be deleted during explicit Journey purge'); END;

-- READY runs are finalized only after their stable Plan/Segment rows exist.
CREATE TRIGGER "TransitPlanningRun_ready_insert_guard"
BEFORE INSERT ON "TransitPlanningRun"
WHEN NEW."status" = 'READY'
BEGIN SELECT RAISE(ABORT, 'create a planning run before finalizing it as READY'); END;

CREATE TRIGGER "TransitPlanningRun_status_update_guard"
BEFORE UPDATE OF "status" ON "TransitPlanningRun"
WHEN
  (OLD."status" <> 'PLANNING' AND NEW."status" <> OLD."status") OR
  (NEW."status" = 'READY' AND NOT EXISTS (
    SELECT 1 FROM "TransitPlan" plan
    WHERE plan."planningRunId" = NEW."id" AND plan."transitEventId" = NEW."transitEventId"
  )) OR
  (NEW."status" = 'FAILED' AND EXISTS (
    SELECT 1 FROM "TransitPlan" plan
    WHERE plan."planningRunId" = NEW."id" AND plan."transitEventId" = NEW."transitEventId"
  ))
BEGIN
  SELECT RAISE(ABORT, 'READY run requires Plans and FAILED run cannot contain Plans');
END;

CREATE TRIGGER "TransitPlan_insert_guard"
BEFORE INSERT ON "TransitPlan"
WHEN EXISTS (
  SELECT 1 FROM "TransitPlanningRun" run
  WHERE run."id" = NEW."planningRunId"
    AND run."transitEventId" = NEW."transitEventId"
    AND run."status" <> 'PLANNING'
)
BEGIN SELECT RAISE(ABORT, 'finalized planning run cannot accept Plans'); END;

CREATE TRIGGER "TransitPlan_mutation_guard"
BEFORE UPDATE ON "TransitPlan"
WHEN EXISTS (SELECT 1 FROM "TransitPlanningRun" WHERE "id" = OLD."planningRunId" AND "status" <> 'PLANNING')
BEGIN SELECT RAISE(ABORT, 'Plans are immutable after a run leaves PLANNING'); END;

CREATE TRIGGER "TransitPlan_delete_guard"
BEFORE DELETE ON "TransitPlan"
WHEN EXISTS (
  SELECT 1 FROM "TransitPlanningRun" run
  WHERE run."id" = OLD."planningRunId" AND run."status" <> 'PLANNING'
)
BEGIN SELECT RAISE(ABORT, 'Plans cannot be deleted after a run leaves PLANNING'); END;

CREATE TRIGGER "TransitSegment_mutation_guard"
BEFORE UPDATE ON "TransitSegment"
WHEN EXISTS (
  SELECT 1 FROM "TransitPlan" plan
  JOIN "TransitPlanningRun" run ON run."id" = plan."planningRunId"
  WHERE plan."id" = OLD."transitPlanId" AND run."status" <> 'PLANNING'
)
BEGIN SELECT RAISE(ABORT, 'Segments are immutable after a run leaves PLANNING'); END;

CREATE TRIGGER "TransitSegment_delete_guard"
BEFORE DELETE ON "TransitSegment"
WHEN EXISTS (
  SELECT 1 FROM "TransitPlan" plan
  JOIN "TransitPlanningRun" run ON run."id" = plan."planningRunId"
  WHERE plan."id" = OLD."transitPlanId" AND run."status" <> 'PLANNING'
)
BEGIN SELECT RAISE(ABORT, 'Segments cannot be deleted after a run leaves PLANNING'); END;

CREATE TRIGGER "TransitSegment_insert_guard"
BEFORE INSERT ON "TransitSegment"
WHEN EXISTS (
  SELECT 1 FROM "TransitPlan" plan
  JOIN "TransitPlanningRun" run ON run."id" = plan."planningRunId"
  WHERE plan."id" = NEW."transitPlanId" AND run."status" <> 'PLANNING'
)
BEGIN SELECT RAISE(ABORT, 'finalized planning run cannot accept Segments'); END;

CREATE TRIGGER "TransitPlanningRun_delete_guard"
BEFORE DELETE ON "TransitPlanningRun"
WHEN OLD."status" <> 'PLANNING' AND EXISTS (
  SELECT 1 FROM "TransitEventDetail" detail
  WHERE detail."eventId" = OLD."transitEventId"
)
BEGIN SELECT RAISE(ABORT, 'finalized planning runs can only be deleted by purging their Transit Event'); END;

CREATE TRIGGER "TransitEventDetail_active_run_guard"
BEFORE UPDATE OF "activePlanningRunId", "selectedPlanId", "routeState" ON "TransitEventDetail"
WHEN NEW."routeState" IN ('READY', 'ROUTE_STALE') AND NOT EXISTS (
  SELECT 1 FROM "TransitPlanningRun" run
  WHERE run."id" = NEW."activePlanningRunId"
    AND run."transitEventId" = NEW."eventId"
    AND run."status" = 'READY'
)
BEGIN SELECT RAISE(ABORT, 'active Transit run must be READY'); END;

CREATE TRIGGER "EventAssetLink_insert_guard"
BEFORE INSERT ON "EventAssetLink"
WHEN NOT EXISTS (
  SELECT 1 FROM "Asset" asset
  JOIN "Journey" journey ON journey."id" = NEW."journeyId"
  WHERE asset."id" = NEW."assetId"
    AND asset."deletedAt" IS NULL
    AND asset."checksum" = NEW."assetChecksum"
    AND (asset."ownerId" = journey."ownerId" OR asset."visibility" = 'PUBLIC')
    AND CASE NEW."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
        <= CASE asset."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
)
BEGIN
  SELECT RAISE(ABORT, 'EventAssetLink must pin an authorized Asset without broadening visibility');
END;

CREATE TRIGGER "EventAssetLink_update_guard"
BEFORE UPDATE OF "assetId", "assetChecksum", "visibility", "journeyId" ON "EventAssetLink"
WHEN NOT EXISTS (
  SELECT 1 FROM "Asset" asset
  JOIN "Journey" journey ON journey."id" = NEW."journeyId"
  WHERE asset."id" = NEW."assetId"
    AND asset."deletedAt" IS NULL
    AND asset."checksum" = NEW."assetChecksum"
    AND (asset."ownerId" = journey."ownerId" OR asset."visibility" = 'PUBLIC')
    AND CASE NEW."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
        <= CASE asset."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
)
BEGIN
  SELECT RAISE(ABORT, 'EventAssetLink must pin an authorized Asset without broadening visibility');
END;

CREATE TRIGGER "Asset_active_reference_update_guard"
BEFORE UPDATE OF "ownerId", "checksum", "visibility", "deletedAt" ON "Asset"
WHEN EXISTS (
  SELECT 1 FROM "EventAssetLink" link
  JOIN "Journey" journey ON journey."id" = link."journeyId"
  WHERE link."assetId" = OLD."id"
    AND link."retiredRevision" IS NULL
    AND (
      NEW."deletedAt" IS NOT NULL OR
      NEW."checksum" <> link."assetChecksum" OR
      NOT (NEW."ownerId" = journey."ownerId" OR NEW."visibility" = 'PUBLIC') OR
      CASE link."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
        > CASE NEW."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
    )
) OR EXISTS (
  SELECT 1 FROM "SourceDocument" document
  JOIN "SourcePack" pack ON pack."id" = document."sourcePackId"
  WHERE document."assetId" = OLD."id"
    AND (
      NEW."deletedAt" IS NOT NULL OR
      NEW."ownerId" <> pack."ownerId" OR
      NEW."checksum" <> document."checksum"
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Asset update would invalidate an active Event or SourceDocument reference');
END;

CREATE TRIGGER "EventObservation_insert_guard"
BEFORE INSERT ON "EventObservation"
WHEN NEW."supersedesId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "EventObservation" previous
  WHERE previous."id" = NEW."supersedesId"
    AND previous."eventId" = NEW."eventId"
    AND previous."kind" = NEW."kind"
    AND previous."phase" = NEW."phase"
    AND previous."createdAt" < NEW."createdAt"
    AND NOT EXISTS (
      SELECT 1 FROM "EventObservation" newer
      WHERE newer."supersedesId" = previous."id"
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Observation supersession must continue the current same-kind Event chain');
END;

CREATE TRIGGER "EventObservation_update_guard"
BEFORE UPDATE ON "EventObservation"
BEGIN SELECT RAISE(ABORT, 'Observations are append-only'); END;

CREATE TRIGGER "EventObservation_delete_guard"
BEFORE DELETE ON "EventObservation"
WHEN EXISTS (SELECT 1 FROM "JourneyEvent" event WHERE event."id" = OLD."eventId")
BEGIN SELECT RAISE(ABORT, 'Observations can only be deleted by purging their Event'); END;

CREATE TRIGGER "SourceDocument_asset_guard"
BEFORE INSERT ON "SourceDocument"
WHEN NOT EXISTS (
  SELECT 1 FROM "Asset" asset
  JOIN "SourcePack" pack ON pack."id" = NEW."sourcePackId"
  WHERE asset."id" = NEW."assetId"
    AND asset."ownerId" = pack."ownerId"
    AND asset."checksum" = NEW."checksum"
    AND asset."deletedAt" IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'SourceDocument must pin an active Asset owned by the SourcePack owner');
END;

CREATE TRIGGER "SourceDocument_update_guard"
BEFORE UPDATE OF "sourcePackId", "assetId", "checksum" ON "SourceDocument"
WHEN
  NOT EXISTS (
    SELECT 1 FROM "Asset" asset
    JOIN "SourcePack" pack ON pack."id" = NEW."sourcePackId"
    WHERE asset."id" = NEW."assetId"
      AND asset."ownerId" = pack."ownerId"
      AND asset."checksum" = NEW."checksum"
      AND asset."deletedAt" IS NULL
  ) OR EXISTS (
    SELECT 1 FROM "EventSourceLink" link
    WHERE link."sourceDocumentId" = OLD."id"
      AND link."retiredRevision" IS NULL
      AND link."sourceDocumentChecksum" <> NEW."checksum"
  )
BEGIN
  SELECT RAISE(ABORT, 'SourceDocument update would invalidate ownership or pinned checksum');
END;

CREATE TRIGGER "EventSourceLink_insert_guard"
BEFORE INSERT ON "EventSourceLink"
WHEN NOT EXISTS (
  SELECT 1 FROM "SourceItem" item
  JOIN "SourceDocument" document ON document."id" = item."sourceDocumentId"
  WHERE item."id" = NEW."sourceItemId"
    AND document."id" = NEW."sourceDocumentId"
    AND document."checksum" = NEW."sourceDocumentChecksum"
)
BEGIN
  SELECT RAISE(ABORT, 'EventSourceLink must pin its SourceItem document and checksum');
END;

CREATE TRIGGER "EventSourceLink_update_guard"
BEFORE UPDATE OF "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum" ON "EventSourceLink"
WHEN NOT EXISTS (
  SELECT 1 FROM "SourceItem" item
  JOIN "SourceDocument" document ON document."id" = item."sourceDocumentId"
  WHERE item."id" = NEW."sourceItemId"
    AND document."id" = NEW."sourceDocumentId"
    AND document."checksum" = NEW."sourceDocumentChecksum"
)
BEGIN
  SELECT RAISE(ABORT, 'EventSourceLink must pin its SourceItem document and checksum');
END;

CREATE TRIGGER "WorkspaceMessage_agent_run_guard"
BEFORE INSERT ON "WorkspaceMessage"
WHEN NEW."agentRunId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceAgentRun" run
  WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
)
BEGIN SELECT RAISE(ABORT, 'WorkspaceMessage agent run must belong to the same Workspace'); END;

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

CREATE TRIGGER "WorkspaceMessage_agent_run_update_guard"
BEFORE UPDATE OF "workspaceId", "agentRunId" ON "WorkspaceMessage"
WHEN NEW."agentRunId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceAgentRun" run
  WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
)
BEGIN SELECT RAISE(ABORT, 'WorkspaceMessage agent run must belong to the same Workspace'); END;

CREATE TRIGGER "JourneyRevision_lineage_insert_guard"
BEFORE INSERT ON "JourneyRevision"
WHEN NEW."revision" > 1 AND NOT EXISTS (
  SELECT 1 FROM "JourneyRevision" parent
  WHERE parent."id" = NEW."parentRevisionId"
    AND parent."journeyId" = NEW."journeyId"
    AND parent."revision" = NEW."revision" - 1
)
BEGIN SELECT RAISE(ABORT, 'JourneyRevision parent must be the immediately preceding revision'); END;

CREATE TRIGGER "JourneyRevision_snapshot_owner_guard"
BEFORE INSERT ON "JourneyRevision"
WHEN NOT EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = NEW."journeyId"
    AND coalesce(json_type(NEW."snapshotJson", '$.ownerId'), '') = 'text'
    AND json_extract(NEW."snapshotJson", '$.ownerId') = journey."ownerId"
)
BEGIN SELECT RAISE(ABORT, 'JourneyRevision snapshot must preserve Journey ownership'); END;

CREATE TRIGGER "JourneyRevision_update_guard"
BEFORE UPDATE OF "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "actorAgentRunId", "idempotencyKey", "parentRevisionId", "createdAt" ON "JourneyRevision"
BEGIN SELECT RAISE(ABORT, 'Journey revisions are append-only'); END;

CREATE TRIGGER "JourneyRevision_delete_guard"
BEFORE DELETE ON "JourneyRevision"
WHEN EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = OLD."journeyId" AND journey."deletedAt" IS NULL
)
BEGIN SELECT RAISE(ABORT, 'Journey revisions can only be deleted during explicit Journey purge'); END;

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

-- ARCHIVED is the explicit hard-purge gate. The lineage RESTRICT FK then forces
-- leaf-to-root deletion inside the same transaction before removing the Workspace.
CREATE TRIGGER "WorkspaceRevision_delete_guard"
BEFORE DELETE ON "WorkspaceRevision"
WHEN EXISTS (
  SELECT 1 FROM "WorkspaceSession" workspace
  WHERE workspace."id" = OLD."workspaceId" AND workspace."status" <> 'ARCHIVED'
)
BEGIN SELECT RAISE(ABORT, 'Workspace revisions can only be deleted by purging their Workspace'); END;

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

CREATE TRIGGER "ProviderUsageLog_agent_run_guard"
BEFORE INSERT ON "ProviderUsageLog"
WHEN NEW."agentRunId" IS NOT NULL AND (
  NEW."workspaceId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "WorkspaceAgentRun" run
    WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
  )
)
BEGIN SELECT RAISE(ABORT, 'Provider usage Agent run must belong to the attributed Workspace'); END;

CREATE TRIGGER "ProviderUsageLog_agent_run_update_guard"
BEFORE UPDATE OF "workspaceId", "agentRunId" ON "ProviderUsageLog"
WHEN NEW."agentRunId" IS NOT NULL AND (
  NEW."workspaceId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "WorkspaceAgentRun" run
    WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
  )
)
BEGIN SELECT RAISE(ABORT, 'Provider usage Agent run must belong to the attributed Workspace'); END;
