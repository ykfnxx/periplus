-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "JourneyVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "JourneyEventType" AS ENUM ('RECORD', 'SECTION', 'VISIT', 'TRANSIT', 'STAY', 'MEAL', 'ACTIVITY', 'NOTE');

-- CreateEnum
CREATE TYPE "JourneyEventExecutionStatus" AS ENUM ('PLANNED', 'STARTED', 'CONFIRMED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "JourneyEventOrigin" AS ENUM ('ORIGINAL', 'USER_INSERTED', 'AGENT_INSERTED', 'FORKED', 'SOURCE_DERIVED');

-- CreateEnum
CREATE TYPE "JourneyEventPlacementStatus" AS ENUM ('SCHEDULED', 'UNSCHEDULED');

-- CreateEnum
CREATE TYPE "JourneyEventLinkKind" AS ENUM ('MAIN', 'ALTERNATIVE');

-- CreateEnum
CREATE TYPE "JourneySectionKind" AS ENUM ('CITY');

-- CreateEnum
CREATE TYPE "ActorKind" AS ENUM ('USER', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('FLIGHT', 'TRAIN', 'CAR', 'BUS', 'WALK', 'TAXI', 'SUBWAY', 'RENTAL');

-- CreateEnum
CREATE TYPE "TransitRequestMode" AS ENUM ('DRIVE', 'WALK', 'TRANSIT');

-- CreateEnum
CREATE TYPE "TransitPreference" AS ENUM ('RECOMMENDED', 'FASTEST', 'LOW_COST', 'FEWER_TRANSFERS', 'LESS_WALKING');

-- CreateEnum
CREATE TYPE "TransitRouteState" AS ENUM ('EMPTY', 'READY', 'ROUTE_STALE');

-- CreateEnum
CREATE TYPE "TransitPlanningRunStatus" AS ENUM ('PLANNING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "TransitSegmentMode" AS ENUM ('WALK', 'DRIVE', 'BUS', 'SUBWAY', 'RAIL', 'TAXI', 'FLIGHT');

-- CreateEnum
CREATE TYPE "CoordinateSystem" AS ENUM ('WGS84', 'GCJ02', 'BD09', 'LOCAL');

-- CreateEnum
CREATE TYPE "GeometryKind" AS ENUM ('ROAD_NETWORK', 'TRANSIT_LINE', 'SCHEMATIC', 'NONE');

-- CreateEnum
CREATE TYPE "TrafficBasis" AS ENUM ('REALTIME', 'PREDICTED', 'TYPICAL', 'SCHEDULED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkspaceCommandName" AS ENUM ('journey.add_event', 'journey.update_event', 'journey.move_event', 'journey.place_event', 'journey.retire_event', 'journey.replace_event', 'journey.add_link', 'journey.retire_link', 'journey.select_branch', 'journey.plan_transit', 'journey.select_transit_plan', 'journey.confirm_actual', 'journey.skip_event', 'journey.cancel_event', 'journey.attach_asset', 'journey.add_observation', 'journey.link_source_item', 'journey.undo', 'journey.apply_draft', 'workspace.refresh', 'workspace.replay', 'workspace.fork', 'workspace.commit');

-- CreateEnum
CREATE TYPE "WorkspaceMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "WorkspaceAgentRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AgentContextCheckpointStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'FILE');

-- CreateEnum
CREATE TYPE "AssetVisibility" AS ENUM ('PRIVATE', 'JOURNEY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "EventAssetRole" AS ENUM ('COVER', 'GALLERY', 'RECEIPT', 'REFERENCE');

-- CreateEnum
CREATE TYPE "ObservationKind" AS ENUM ('NOTE', 'RATING', 'COST', 'WEATHER', 'FACT');

-- CreateEnum
CREATE TYPE "ObservationPhase" AS ENUM ('PLANNED', 'ACTUAL');

-- CreateEnum
CREATE TYPE "SourcePackVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "SourcePackStatus" AS ENUM ('DRAFT', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SourceDocumentProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceItemKind" AS ENUM ('PLACE', 'PERSON', 'EVENT', 'QUOTE', 'NOTE');

-- CreateEnum
CREATE TYPE "SourceItemResolutionState" AS ENUM ('UNRESOLVED', 'CANDIDATE', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventSourceRole" AS ENUM ('INSPIRATION', 'EVIDENCE', 'NAVIGATION');

-- CreateEnum
CREATE TYPE "PlaceCategory" AS ENUM ('SIGHT', 'PARK', 'MUSEUM', 'CULTURE', 'PERFORMANCE', 'SPORTS', 'ENTERTAINMENT', 'RESTAURANT', 'HOTEL', 'TRANSIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PlaceSourceQuality" AS ENUM ('VERIFIED', 'PROBABLE', 'CANDIDATE', 'NEEDS_REVIEW');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" "JourneyStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "JourneyVisibility" NOT NULL DEFAULT 'PRIVATE',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Journey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyRevision" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "patchJson" TEXT NOT NULL,
    "inversePatchJson" TEXT NOT NULL,
    "actorKind" "ActorKind" NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "parentRevisionId" TEXT,
    "workspaceRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "parentSectionEventId" TEXT,
    "type" "JourneyEventType" NOT NULL,
    "executionStatus" "JourneyEventExecutionStatus",
    "placementStatus" "JourneyEventPlacementStatus" NOT NULL DEFAULT 'SCHEDULED',
    "origin" "JourneyEventOrigin" NOT NULL DEFAULT 'ORIGINAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recordingJson" TEXT,
    "plannedStartAt" TIMESTAMP(3),
    "plannedEndAt" TIMESTAMP(3),
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEventLink" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "fromEventId" TEXT NOT NULL,
    "toEventId" TEXT NOT NULL,
    "kind" "JourneyEventLinkKind" NOT NULL DEFAULT 'MAIN',
    "branchKey" TEXT,
    "rank" INTEGER NOT NULL,
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JourneyEventLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEventReplacement" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "predecessorEventId" TEXT NOT NULL,
    "successorEventId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyEventReplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyBranchSelection" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "forkEventId" TEXT NOT NULL,
    "selectedLinkId" TEXT NOT NULL,
    "journeyRevision" INTEGER NOT NULL,
    "supersedesId" TEXT,
    "actorKind" "ActorKind" NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyBranchSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SectionEventDetail" (
    "eventId" TEXT NOT NULL,
    "kind" "JourneySectionKind" NOT NULL,
    "timezone" TEXT,
    "placeId" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "coordinateSystem" "CoordinateSystem",

    CONSTRAINT "SectionEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "VisitEventDetail" (
    "eventId" TEXT NOT NULL,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" DOUBLE PRECISION NOT NULL,
    "plannedLng" DOUBLE PRECISION NOT NULL,
    "actualLat" DOUBLE PRECISION,
    "actualLng" DOUBLE PRECISION,
    "coordinateSystem" "CoordinateSystem" NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "providerCoverImageJson" TEXT,

    CONSTRAINT "VisitEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "StayEventDetail" (
    "eventId" TEXT NOT NULL,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" DOUBLE PRECISION NOT NULL,
    "plannedLng" DOUBLE PRECISION NOT NULL,
    "actualLat" DOUBLE PRECISION,
    "actualLng" DOUBLE PRECISION,
    "coordinateSystem" "CoordinateSystem" NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "checkInNote" TEXT,
    "hotelOfferSnapshotJson" TEXT,

    CONSTRAINT "StayEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "MealEventDetail" (
    "eventId" TEXT NOT NULL,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" DOUBLE PRECISION NOT NULL,
    "plannedLng" DOUBLE PRECISION NOT NULL,
    "actualLat" DOUBLE PRECISION,
    "actualLng" DOUBLE PRECISION,
    "coordinateSystem" "CoordinateSystem" NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "cuisine" TEXT,

    CONSTRAINT "MealEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "ActivityEventDetail" (
    "eventId" TEXT NOT NULL,
    "plannedPlaceId" TEXT,
    "actualPlaceId" TEXT,
    "plannedLat" DOUBLE PRECISION NOT NULL,
    "plannedLng" DOUBLE PRECISION NOT NULL,
    "actualLat" DOUBLE PRECISION,
    "actualLng" DOUBLE PRECISION,
    "coordinateSystem" "CoordinateSystem" NOT NULL,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "bookingReference" TEXT,

    CONSTRAINT "ActivityEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "TransitEventDetail" (
    "eventId" TEXT NOT NULL,
    "plannedFromEventId" TEXT,
    "plannedToEventId" TEXT,
    "actualFromEventId" TEXT,
    "actualToEventId" TEXT,
    "transportMode" "TransportMode" NOT NULL,
    "requestMode" "TransitRequestMode",
    "preference" "TransitPreference",
    "plannedDepartAt" TIMESTAMP(3),
    "actualDepartAt" TIMESTAMP(3),
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "plannedDistanceKm" DOUBLE PRECISION,
    "actualDistanceKm" DOUBLE PRECISION,
    "plannedCostEstimate" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "activePlanningRunId" TEXT,
    "selectedPlanId" TEXT,
    "routeState" "TransitRouteState" NOT NULL DEFAULT 'EMPTY',
    "notes" TEXT,

    CONSTRAINT "TransitEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "NoteEventDetail" (
    "eventId" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "NoteEventDetail_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "TransitPlanningRun" (
    "id" TEXT NOT NULL,
    "transitEventId" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "TransitPlanningRunStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "warning" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitPlanningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransitPlan" (
    "id" TEXT NOT NULL,
    "planningRunId" TEXT NOT NULL,
    "transitEventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "distanceMeters" DOUBLE PRECISION NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "fareAmount" DOUBLE PRECISION,
    "trafficBasis" "TrafficBasis" NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransitPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransitSegment" (
    "id" TEXT NOT NULL,
    "transitPlanId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "mode" "TransitSegmentMode" NOT NULL,
    "fromName" TEXT,
    "toName" TEXT,
    "lineName" TEXT,
    "distanceMeters" DOUBLE PRECISION,
    "durationSeconds" INTEGER,
    "fareAmount" DOUBLE PRECISION,
    "departAt" TIMESTAMP(3),
    "arriveAt" TIMESTAMP(3),
    "coordinateSystem" "CoordinateSystem" NOT NULL,
    "geometryKind" "GeometryKind" NOT NULL,
    "positionsJson" TEXT NOT NULL,
    "trafficSectionsJson" TEXT,

    CONSTRAINT "TransitSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sourceJourneyId" TEXT,
    "baseJourneyRevision" INTEGER,
    "headWorkspaceRevision" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL DEFAULT '新工作区',
    "headGraphJson" TEXT NOT NULL,
    "agentContextSummary" TEXT,
    "agentContextThroughMessageId" TEXT,
    "agentContextSourceRunId" TEXT,
    "agentContextStatus" "AgentContextCheckpointStatus",
    "agentContextAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "agentContextLastError" TEXT,
    "agentContextUpdatedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceRevision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "parentRevisionId" TEXT,
    "commandName" "WorkspaceCommandName" NOT NULL,
    "beforeGraphJson" TEXT NOT NULL,
    "afterGraphJson" TEXT NOT NULL,
    "patchJson" TEXT NOT NULL,
    "inversePatchJson" TEXT NOT NULL,
    "actorKind" "ActorKind" NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMessage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "WorkspaceMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "blocksJson" TEXT NOT NULL DEFAULT '[]',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceAgentRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "WorkspaceAgentRunStatus" NOT NULL,
    "runtimeOwnerId" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "AssetKind" NOT NULL,
    "visibility" "AssetVisibility" NOT NULL DEFAULT 'PRIVATE',
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "uploadId" TEXT,
    "uploadFingerprint" TEXT,
    "capturedAt" TIMESTAMP(3),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAssetLink" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetChecksum" TEXT NOT NULL,
    "role" "EventAssetRole" NOT NULL,
    "rank" INTEGER NOT NULL,
    "caption" TEXT,
    "locationJson" TEXT,
    "visibility" "AssetVisibility" NOT NULL,
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAssetLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventObservation" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "ObservationKind" NOT NULL,
    "phase" "ObservationPhase" NOT NULL,
    "body" TEXT,
    "valueJson" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "actorKind" "ActorKind" NOT NULL,
    "actorUserId" TEXT,
    "actorAgentRunId" TEXT,
    "supersedesId" TEXT,
    "visibility" "AssetVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourcePack" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "visibility" "SourcePackVisibility" NOT NULL DEFAULT 'PRIVATE',
    "status" "SourcePackStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "SourcePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceDocument" (
    "id" TEXT NOT NULL,
    "sourcePackId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "pageCount" INTEGER,
    "processingStatus" "SourceDocumentProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceItem" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "kind" "SourceItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "sourceOrder" INTEGER NOT NULL,
    "page" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "resolutionState" "SourceItemResolutionState" NOT NULL DEFAULT 'UNRESOLVED',
    "resolvedPlaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSourceLink" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sourceItemId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "sourceDocumentChecksum" TEXT NOT NULL,
    "role" "EventSourceRole" NOT NULL,
    "excerpt" TEXT,
    "page" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "rank" INTEGER NOT NULL,
    "approvedForJourneySharing" BOOLEAN NOT NULL DEFAULT false,
    "introducedRevision" INTEGER NOT NULL,
    "retiredRevision" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventSourceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" "PlaceCategory" NOT NULL,
    "latWgs84" DOUBLE PRECISION,
    "lngWgs84" DOUBLE PRECISION,
    "latGcj02" DOUBLE PRECISION,
    "lngGcj02" DOUBLE PRECISION,
    "countryCode" TEXT,
    "province" TEXT,
    "city" TEXT,
    "district" TEXT,
    "address" TEXT,
    "description" TEXT,
    "popularityScore" DOUBLE PRECISION,
    "sourceQuality" "PlaceSourceQuality" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceAlias" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceSource" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "license" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "rawCategory" TEXT,
    "rawPayload" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceProviderMatch" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "coordinateSystem" "CoordinateSystem" NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "address" TEXT,
    "adcode" TEXT,
    "typeCode" TEXT,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceProviderMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawPlaceCandidate" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "queryHash" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" "PlaceCategory",
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "coordinateSystem" "CoordinateSystem",
    "rawPayload" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'CACHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawPlaceCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderRequestCache" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderRequestCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderUsageLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "userId" TEXT,
    "workspaceId" TEXT,
    "agentRunId" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUsageLog_pkey" PRIMARY KEY ("id")
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
CREATE UNIQUE INDEX "JourneyEventLink_journeyId_fromEventId_toEventId_kind_intro_key" ON "JourneyEventLink"("journeyId", "fromEventId", "toEventId", "kind", "introducedRevision");

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
CREATE INDEX "WorkspaceAgentRun_workspaceId_status_idx" ON "WorkspaceAgentRun"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WorkspaceAgentRun_status_leaseExpiresAt_idx" ON "WorkspaceAgentRun"("status", "leaseExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_ownerId_createdAt_idx" ON "Asset"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_checksum_idx" ON "Asset"("checksum");

-- CreateIndex
CREATE INDEX "Asset_deletedAt_idx" ON "Asset"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_ownerId_uploadId_key" ON "Asset"("ownerId", "uploadId");

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
CREATE UNIQUE INDEX "EventSourceLink_eventId_sourceItemId_role_introducedRevisio_key" ON "EventSourceLink"("eventId", "sourceItemId", "role", "introducedRevision");

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

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_journeyId_parentRevisionId_fkey" FOREIGN KEY ("journeyId", "parentRevisionId") REFERENCES "JourneyRevision"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_workspaceRevisionId_fkey" FOREIGN KEY ("workspaceRevisionId") REFERENCES "WorkspaceRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_journeyId_parentSectionEventId_fkey" FOREIGN KEY ("journeyId", "parentSectionEventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_journeyId_fromEventId_fkey" FOREIGN KEY ("journeyId", "fromEventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_journeyId_toEventId_fkey" FOREIGN KEY ("journeyId", "toEventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventReplacement" ADD CONSTRAINT "JourneyEventReplacement_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventReplacement" ADD CONSTRAINT "JourneyEventReplacement_journeyId_predecessorEventId_fkey" FOREIGN KEY ("journeyId", "predecessorEventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventReplacement" ADD CONSTRAINT "JourneyEventReplacement_journeyId_successorEventId_fkey" FOREIGN KEY ("journeyId", "successorEventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEventReplacement" ADD CONSTRAINT "JourneyEventReplacement_journeyId_revision_fkey" FOREIGN KEY ("journeyId", "revision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyBranchSelection" ADD CONSTRAINT "JourneyBranchSelection_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyBranchSelection" ADD CONSTRAINT "JourneyBranchSelection_journeyId_forkEventId_fkey" FOREIGN KEY ("journeyId", "forkEventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyBranchSelection" ADD CONSTRAINT "JourneyBranchSelection_journeyId_selectedLinkId_fkey" FOREIGN KEY ("journeyId", "selectedLinkId") REFERENCES "JourneyEventLink"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyBranchSelection" ADD CONSTRAINT "JourneyBranchSelection_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "JourneyBranchSelection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyBranchSelection" ADD CONSTRAINT "JourneyBranchSelection_journeyId_journeyRevision_fkey" FOREIGN KEY ("journeyId", "journeyRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionEventDetail" ADD CONSTRAINT "SectionEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SectionEventDetail" ADD CONSTRAINT "SectionEventDetail_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitEventDetail" ADD CONSTRAINT "VisitEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitEventDetail" ADD CONSTRAINT "VisitEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitEventDetail" ADD CONSTRAINT "VisitEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayEventDetail" ADD CONSTRAINT "StayEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayEventDetail" ADD CONSTRAINT "StayEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StayEventDetail" ADD CONSTRAINT "StayEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEventDetail" ADD CONSTRAINT "MealEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEventDetail" ADD CONSTRAINT "MealEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealEventDetail" ADD CONSTRAINT "MealEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEventDetail" ADD CONSTRAINT "ActivityEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEventDetail" ADD CONSTRAINT "ActivityEventDetail_plannedPlaceId_fkey" FOREIGN KEY ("plannedPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEventDetail" ADD CONSTRAINT "ActivityEventDetail_actualPlaceId_fkey" FOREIGN KEY ("actualPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_plannedFromEventId_fkey" FOREIGN KEY ("plannedFromEventId") REFERENCES "JourneyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_plannedToEventId_fkey" FOREIGN KEY ("plannedToEventId") REFERENCES "JourneyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_actualFromEventId_fkey" FOREIGN KEY ("actualFromEventId") REFERENCES "JourneyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_actualToEventId_fkey" FOREIGN KEY ("actualToEventId") REFERENCES "JourneyEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_eventId_activePlanningRunId_fkey" FOREIGN KEY ("eventId", "activePlanningRunId") REFERENCES "TransitPlanningRun"("transitEventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_eventId_activePlanningRunId_selectedPla_fkey" FOREIGN KEY ("eventId", "activePlanningRunId", "selectedPlanId") REFERENCES "TransitPlan"("transitEventId", "planningRunId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteEventDetail" ADD CONSTRAINT "NoteEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitPlanningRun" ADD CONSTRAINT "TransitPlanningRun_transitEventId_fkey" FOREIGN KEY ("transitEventId") REFERENCES "TransitEventDetail"("eventId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitPlan" ADD CONSTRAINT "TransitPlan_transitEventId_planningRunId_fkey" FOREIGN KEY ("transitEventId", "planningRunId") REFERENCES "TransitPlanningRun"("transitEventId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransitSegment" ADD CONSTRAINT "TransitSegment_transitPlanId_fkey" FOREIGN KEY ("transitPlanId") REFERENCES "TransitPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_sourceJourneyId_fkey" FOREIGN KEY ("sourceJourneyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_sourceJourneyId_baseJourneyRevision_fkey" FOREIGN KEY ("sourceJourneyId", "baseJourneyRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_workspaceId_parentRevisionId_fkey" FOREIGN KEY ("workspaceId", "parentRevisionId") REFERENCES "WorkspaceRevision"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMessage" ADD CONSTRAINT "WorkspaceMessage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMessage" ADD CONSTRAINT "WorkspaceMessage_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "WorkspaceAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAgentRun" ADD CONSTRAINT "WorkspaceAgentRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_journeyId_eventId_fkey" FOREIGN KEY ("journeyId", "eventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventObservation" ADD CONSTRAINT "EventObservation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventObservation" ADD CONSTRAINT "EventObservation_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "EventObservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourcePack" ADD CONSTRAINT "SourcePack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_sourcePackId_fkey" FOREIGN KEY ("sourcePackId") REFERENCES "SourcePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_resolvedPlaceId_fkey" FOREIGN KEY ("resolvedPlaceId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_journeyId_eventId_fkey" FOREIGN KEY ("journeyId", "eventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "SourceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "SourceDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_journeyId_introducedRevision_fkey" FOREIGN KEY ("journeyId", "introducedRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_journeyId_retiredRevision_fkey" FOREIGN KEY ("journeyId", "retiredRevision") REFERENCES "JourneyRevision"("journeyId", "revision") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceAlias" ADD CONSTRAINT "PlaceAlias_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceSource" ADD CONSTRAINT "PlaceSource_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceProviderMatch" ADD CONSTRAINT "PlaceProviderMatch_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsageLog" ADD CONSTRAINT "ProviderUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsageLog" ADD CONSTRAINT "ProviderUsageLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "WorkspaceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsageLog" ADD CONSTRAINT "ProviderUsageLog_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "WorkspaceAgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Database guards protect the same invariants as service validation, including
-- writes made outside the application. JSON remains text to preserve canonical
-- revision serialization; casts reject malformed JSON at the database boundary.

CREATE UNIQUE INDEX "EventAssetLink_current_rank_key"
ON "EventAssetLink"("eventId", "role", "rank")
WHERE "retiredRevision" IS NULL;

CREATE UNIQUE INDEX "EventSourceLink_current_rank_key"
ON "EventSourceLink"("eventId", "role", "rank")
WHERE "retiredRevision" IS NULL;

CREATE UNIQUE INDEX "JourneyEventLink_current_main_from_key"
ON "JourneyEventLink"("journeyId", "fromEventId")
WHERE "kind" = 'MAIN' AND "retiredRevision" IS NULL;

CREATE UNIQUE INDEX "JourneyEventLink_current_main_to_key"
ON "JourneyEventLink"("journeyId", "toEventId")
WHERE "kind" = 'MAIN' AND "retiredRevision" IS NULL;

CREATE UNIQUE INDEX "WorkspaceAgentRun_one_running_key"
ON "WorkspaceAgentRun"("workspaceId")
WHERE "status" = 'RUNNING';

ALTER TABLE "ActivityEventDetail" ADD CONSTRAINT "ActivityEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL)));

ALTER TABLE "ActivityEventDetail" ADD CONSTRAINT "ActivityEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'));

ALTER TABLE "ActivityEventDetail" ADD CONSTRAINT "ActivityEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0));

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_kind_check" CHECK ("kind" IN ('IMAGE', 'VIDEO', 'AUDIO', 'FILE'));

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'JOURNEY', 'PUBLIC'));

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_size_check" CHECK ("sizeBytes" >= 0);

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_coordinate_check" CHECK ((("lat" IS NULL) = ("lng" IS NULL)) AND ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND ("lng" IS NULL OR "lng" BETWEEN -180 AND 180));

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_text_check" CHECK (length(trim("storageKey")) > 0 AND length(trim("mimeType")) > 0 AND length(trim("checksum")) > 0);

ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_role_check" CHECK ("role" IN ('COVER', 'GALLERY', 'RECEIPT', 'REFERENCE'));

ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'JOURNEY', 'PUBLIC'));

ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_rank_check" CHECK ("rank" >= 0);

ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision"));

ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_checksum_check" CHECK (length(trim("assetChecksum")) > 0);

ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_location_check" CHECK ("locationJson" IS NULL OR (("locationJson")::jsonb IS NOT NULL));

ALTER TABLE "EventObservation" ADD CONSTRAINT "EventObservation_kind_check" CHECK ("kind" IN ('NOTE', 'RATING', 'COST', 'WEATHER', 'FACT'));

ALTER TABLE "EventObservation" ADD CONSTRAINT "EventObservation_phase_check" CHECK ("phase" IN ('PLANNED', 'ACTUAL'));

ALTER TABLE "EventObservation" ADD CONSTRAINT "EventObservation_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'JOURNEY', 'PUBLIC'));

ALTER TABLE "EventObservation" ADD CONSTRAINT "EventObservation_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    );

ALTER TABLE "EventObservation" ADD CONSTRAINT "EventObservation_value_check" CHECK (
      ("kind" IN ('NOTE', 'FACT') AND "body" IS NOT NULL AND length(trim("body")) > 0 AND "valueJson" IS NULL) OR
      ("kind" = 'RATING' AND (("valueJson")::jsonb IS NOT NULL) AND jsonb_typeof(("valueJson")::jsonb) = 'number' AND ((("valueJson")::jsonb #>> '{}'))::numeric BETWEEN 0 AND 5) OR
      ("kind" = 'COST' AND (("valueJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("valueJson")::jsonb #> '{amount}'), '') = 'number' AND ((("valueJson")::jsonb #>> '{amount}'))::numeric >= 0 AND coalesce(jsonb_typeof(("valueJson")::jsonb #> '{currency}'), '') = 'string' AND (("valueJson")::jsonb #>> '{currency}') ~ '^[A-Z]{3}$') OR
      ("kind" = 'WEATHER' AND (("valueJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("valueJson")::jsonb #> '{condition}'), '') = 'string' AND length(trim((("valueJson")::jsonb #>> '{condition}'))) > 0 AND coalesce(jsonb_typeof(("valueJson")::jsonb #> '{temperatureCelsius}'), '') = 'number')
    );

ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_role_check" CHECK ("role" IN ('INSPIRATION', 'EVIDENCE', 'NAVIGATION'));

ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_excerpt_check" CHECK ("excerpt" IS NULL OR length("excerpt") <= 500);

ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_sharing_check" CHECK (NOT "approvedForJourneySharing" OR ("excerpt" IS NOT NULL AND length(trim("excerpt")) > 0));

ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_rank_check" CHECK ("rank" >= 0);

ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision"));

ALTER TABLE "EventSourceLink" ADD CONSTRAINT "EventSourceLink_checksum_check" CHECK (length(trim("sourceDocumentChecksum")) > 0);

ALTER TABLE "Journey" ADD CONSTRAINT "Journey_revision_check" CHECK ("revision" > 0);

ALTER TABLE "Journey" ADD CONSTRAINT "Journey_status_check" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'COMPLETED'));

ALTER TABLE "Journey" ADD CONSTRAINT "Journey_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'UNLISTED', 'PUBLIC'));

ALTER TABLE "Journey" ADD CONSTRAINT "Journey_title_check" CHECK (length(trim("title")) > 0);

ALTER TABLE "JourneyBranchSelection" ADD CONSTRAINT "JourneyBranchSelection_revision_check" CHECK ("journeyRevision" > 0);

ALTER TABLE "JourneyBranchSelection" ADD CONSTRAINT "JourneyBranchSelection_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    );

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_type_check" CHECK ("type" IN ('RECORD', 'SECTION', 'VISIT', 'TRANSIT', 'STAY', 'MEAL', 'ACTIVITY', 'NOTE'));

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_execution_status_check" CHECK (
      ("type" IN ('RECORD', 'SECTION', 'NOTE') AND "executionStatus" IS NULL) OR
      ("type" IN ('VISIT', 'TRANSIT', 'STAY', 'MEAL', 'ACTIVITY') AND "executionStatus" IN ('PLANNED', 'STARTED', 'CONFIRMED', 'SKIPPED', 'CANCELLED'))
    );

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_section_time_check" CHECK (
      "type" NOT IN ('SECTION', 'RECORD') OR ("plannedStartAt" IS NULL AND "plannedEndAt" IS NULL AND "actualStartAt" IS NULL AND "actualEndAt" IS NULL)
    );

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_recording_check" CHECK (
      ("type" = 'RECORD' AND "recordingJson" IS NOT NULL AND (("recordingJson")::jsonb IS NOT NULL)) OR
      ("type" <> 'RECORD' AND "recordingJson" IS NULL)
    );

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_started_fact_check" CHECK ("executionStatus" <> 'STARTED' OR "actualStartAt" IS NOT NULL);

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_placement_check" CHECK ("placementStatus" IN ('SCHEDULED', 'UNSCHEDULED'));

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_origin_check" CHECK ("origin" IN ('ORIGINAL', 'USER_INSERTED', 'AGENT_INSERTED', 'FORKED', 'SOURCE_DERIVED'));

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision"));

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_title_check" CHECK (length(trim("title")) > 0);

ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_time_check" CHECK (
      ("plannedStartAt" IS NULL OR "plannedEndAt" IS NULL OR "plannedEndAt" >= "plannedStartAt") AND
      ("actualStartAt" IS NULL OR "actualEndAt" IS NULL OR "actualEndAt" >= "actualStartAt")
    );

ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_kind_check" CHECK ("kind" IN ('MAIN', 'ALTERNATIVE'));

ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_branch_check" CHECK (("kind" = 'MAIN' AND "branchKey" IS NULL) OR ("kind" = 'ALTERNATIVE' AND "branchKey" IS NOT NULL));

ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_rank_check" CHECK ("rank" >= 0);

ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_revision_check" CHECK ("introducedRevision" > 0 AND ("retiredRevision" IS NULL OR "retiredRevision" >= "introducedRevision"));

ALTER TABLE "JourneyEventLink" ADD CONSTRAINT "JourneyEventLink_endpoint_check" CHECK ("fromEventId" <> "toEventId");

ALTER TABLE "JourneyEventReplacement" ADD CONSTRAINT "JourneyEventReplacement_revision_check" CHECK ("revision" > 0);

ALTER TABLE "JourneyEventReplacement" ADD CONSTRAINT "JourneyEventReplacement_identity_check" CHECK ("predecessorEventId" <> "successorEventId");

ALTER TABLE "JourneyEventReplacement" ADD CONSTRAINT "JourneyEventReplacement_reason_check" CHECK (length(trim("reason")) > 0);

ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_revision_check" CHECK ("revision" > 0);

ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_json_check" CHECK (
      (("snapshotJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("snapshotJson")::jsonb), '') = 'object' AND
      (("patchJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("patchJson")::jsonb), '') = 'array' AND
      (("inversePatchJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("inversePatchJson")::jsonb), '') = 'array'
    );

ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    );

ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_parent_check" CHECK (
      ("revision" = 1 AND "parentRevisionId" IS NULL) OR
      ("revision" > 1 AND "parentRevisionId" IS NOT NULL)
    );

ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_snapshot_identity_check" CHECK (
      coalesce(jsonb_typeof(("snapshotJson")::jsonb #> '{id}'), '') = 'string' AND
      coalesce(jsonb_typeof(("snapshotJson")::jsonb #> '{revision}'), '') = 'number' AND
      (("snapshotJson")::jsonb #>> '{id}') = "journeyId" AND
      ((("snapshotJson")::jsonb #>> '{revision}'))::numeric = "revision"
    );

ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_text_check" CHECK (length(trim("operation")) > 0 AND length(trim("idempotencyKey")) > 0);

ALTER TABLE "MealEventDetail" ADD CONSTRAINT "MealEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL)));

ALTER TABLE "MealEventDetail" ADD CONSTRAINT "MealEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'));

ALTER TABLE "MealEventDetail" ADD CONSTRAINT "MealEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0));

ALTER TABLE "NoteEventDetail" ADD CONSTRAINT "NoteEventDetail_body_check" CHECK (length(trim("body")) > 0);

ALTER TABLE "Place" ADD CONSTRAINT "Place_category_check" CHECK ("category" IN ('SIGHT', 'PARK', 'MUSEUM', 'CULTURE', 'PERFORMANCE', 'SPORTS', 'ENTERTAINMENT', 'RESTAURANT', 'HOTEL', 'TRANSIT', 'OTHER'));

ALTER TABLE "Place" ADD CONSTRAINT "Place_source_quality_check" CHECK ("sourceQuality" IN ('VERIFIED', 'PROBABLE', 'CANDIDATE', 'NEEDS_REVIEW'));

ALTER TABLE "Place" ADD CONSTRAINT "Place_coordinate_check" CHECK (
      (("latWgs84" IS NULL) = ("lngWgs84" IS NULL)) AND ("latWgs84" IS NULL OR "latWgs84" BETWEEN -90 AND 90) AND ("lngWgs84" IS NULL OR "lngWgs84" BETWEEN -180 AND 180) AND
      (("latGcj02" IS NULL) = ("lngGcj02" IS NULL)) AND ("latGcj02" IS NULL OR "latGcj02" BETWEEN -90 AND 90) AND ("lngGcj02" IS NULL OR "lngGcj02" BETWEEN -180 AND 180)
    );

ALTER TABLE "Place" ADD CONSTRAINT "Place_popularity_check" CHECK ("popularityScore" IS NULL OR "popularityScore" >= 0);

ALTER TABLE "Place" ADD CONSTRAINT "Place_name_check" CHECK (length(trim("name")) > 0 AND length(trim("normalizedName")) > 0);

ALTER TABLE "PlaceProviderMatch" ADD CONSTRAINT "PlaceProviderMatch_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "PlaceProviderMatch" ADD CONSTRAINT "PlaceProviderMatch_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'));

ALTER TABLE "PlaceProviderMatch" ADD CONSTRAINT "PlaceProviderMatch_coordinate_check" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);

ALTER TABLE "ProviderRequestCache" ADD CONSTRAINT "ProviderRequestCache_json_check" CHECK ((("responseJson")::jsonb IS NOT NULL));

ALTER TABLE "ProviderRequestCache" ADD CONSTRAINT "ProviderRequestCache_text_check" CHECK (length(trim("provider")) > 0 AND length(trim("cacheKey")) > 0);

ALTER TABLE "RawPlaceCandidate" ADD CONSTRAINT "RawPlaceCandidate_category_check" CHECK ("category" IS NULL OR "category" IN ('SIGHT', 'PARK', 'MUSEUM', 'CULTURE', 'PERFORMANCE', 'SPORTS', 'ENTERTAINMENT', 'RESTAURANT', 'HOTEL', 'TRANSIT', 'OTHER'));

ALTER TABLE "RawPlaceCandidate" ADD CONSTRAINT "RawPlaceCandidate_system_check" CHECK ("coordinateSystem" IS NULL OR "coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'));

ALTER TABLE "RawPlaceCandidate" ADD CONSTRAINT "RawPlaceCandidate_coordinate_check" CHECK ((("lat" IS NULL) = ("lng" IS NULL)) AND ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND ("lng" IS NULL OR "lng" BETWEEN -180 AND 180));

ALTER TABLE "RawPlaceCandidate" ADD CONSTRAINT "RawPlaceCandidate_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "RawPlaceCandidate" ADD CONSTRAINT "RawPlaceCandidate_name_check" CHECK (length(trim("name")) > 0 AND length(trim("normalizedName")) > 0);

ALTER TABLE "SectionEventDetail" ADD CONSTRAINT "SectionEventDetail_kind_check" CHECK ("kind" = 'CITY');

ALTER TABLE "SectionEventDetail" ADD CONSTRAINT "SectionEventDetail_shape_check" CHECK (
      "timezone" IS NOT NULL AND length(trim("timezone")) > 0 AND
      ("lat" IS NULL OR "lat" BETWEEN -90 AND 90) AND
      ("lng" IS NULL OR "lng" BETWEEN -180 AND 180) AND
      ("coordinateSystem" IS NULL OR "coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'))
    );

ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_page_check" CHECK ("pageCount" IS NULL OR "pageCount" > 0);

ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_status_check" CHECK ("processingStatus" IN ('PENDING', 'PROCESSING', 'READY', 'FAILED'));

ALTER TABLE "SourceDocument" ADD CONSTRAINT "SourceDocument_text_check" CHECK (length(trim("checksum")) > 0 AND length(trim("title")) > 0);

ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_kind_check" CHECK ("kind" IN ('PLACE', 'PERSON', 'EVENT', 'QUOTE', 'NOTE'));

ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_order_check" CHECK ("sourceOrder" >= 0);

ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1);

ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_resolution_check" CHECK ("resolutionState" IN ('UNRESOLVED', 'CANDIDATE', 'CONFIRMED', 'REJECTED'));

ALTER TABLE "SourceItem" ADD CONSTRAINT "SourceItem_title_check" CHECK (length(trim("title")) > 0);

ALTER TABLE "SourcePack" ADD CONSTRAINT "SourcePack_visibility_check" CHECK ("visibility" IN ('PRIVATE', 'SHARED'));

ALTER TABLE "SourcePack" ADD CONSTRAINT "SourcePack_status_check" CHECK ("status" IN ('DRAFT', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED'));

ALTER TABLE "SourcePack" ADD CONSTRAINT "SourcePack_archive_check" CHECK (("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL));

ALTER TABLE "SourcePack" ADD CONSTRAINT "SourcePack_title_check" CHECK (length(trim("title")) > 0);

ALTER TABLE "StayEventDetail" ADD CONSTRAINT "StayEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL)));

ALTER TABLE "StayEventDetail" ADD CONSTRAINT "StayEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'));

ALTER TABLE "StayEventDetail" ADD CONSTRAINT "StayEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0));

ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_transport_check" CHECK ("transportMode" IN ('FLIGHT', 'TRAIN', 'CAR', 'BUS', 'WALK', 'TAXI', 'SUBWAY', 'RENTAL'));

ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_request_check" CHECK ("requestMode" IS NULL OR "requestMode" IN ('DRIVE', 'WALK', 'TRANSIT'));

ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_preference_check" CHECK ("preference" IS NULL OR "preference" IN ('RECOMMENDED', 'FASTEST', 'LOW_COST', 'FEWER_TRANSFERS', 'LESS_WALKING'));

ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_value_check" CHECK (
      ("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND
      ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0) AND
      ("plannedDistanceKm" IS NULL OR "plannedDistanceKm" >= 0) AND
      ("actualDistanceKm" IS NULL OR "actualDistanceKm" >= 0) AND
      ("plannedCostEstimate" IS NULL OR "plannedCostEstimate" >= 0) AND
      ("actualCost" IS NULL OR "actualCost" >= 0)
    );

ALTER TABLE "TransitEventDetail" ADD CONSTRAINT "TransitEventDetail_route_check" CHECK (
      ("routeState" = 'EMPTY' AND "activePlanningRunId" IS NULL AND "selectedPlanId" IS NULL) OR
      ("routeState" IN ('READY', 'ROUTE_STALE') AND "activePlanningRunId" IS NOT NULL AND "selectedPlanId" IS NOT NULL)
    );

ALTER TABLE "TransitPlan" ADD CONSTRAINT "TransitPlan_value_check" CHECK ("rank" >= 0 AND "distanceMeters" >= 0 AND "durationSeconds" >= 0 AND ("fareAmount" IS NULL OR "fareAmount" >= 0));

ALTER TABLE "TransitPlan" ADD CONSTRAINT "TransitPlan_traffic_check" CHECK ("trafficBasis" IN ('REALTIME', 'PREDICTED', 'TYPICAL', 'SCHEDULED', 'UNKNOWN'));

ALTER TABLE "TransitPlan" ADD CONSTRAINT "TransitPlan_text_check" CHECK (length(trim("provider")) > 0 AND length(trim("label")) > 0 AND length(trim("strategy")) > 0);

ALTER TABLE "TransitPlan" ADD CONSTRAINT "TransitPlan_time_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "calculatedAt");

ALTER TABLE "TransitPlanningRun" ADD CONSTRAINT "TransitPlanningRun_status_check" CHECK ("status" IN ('PLANNING', 'READY', 'FAILED'));

ALTER TABLE "TransitPlanningRun" ADD CONSTRAINT "TransitPlanningRun_failure_check" CHECK ("status" <> 'FAILED' OR "errorCode" IS NOT NULL OR "errorMessage" IS NOT NULL);

ALTER TABLE "TransitPlanningRun" ADD CONSTRAINT "TransitPlanningRun_text_check" CHECK (length(trim("requestFingerprint")) > 0 AND length(trim("provider")) > 0);

ALTER TABLE "TransitPlanningRun" ADD CONSTRAINT "TransitPlanningRun_time_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "calculatedAt");

ALTER TABLE "TransitSegment" ADD CONSTRAINT "TransitSegment_value_check" CHECK ("order" >= 0 AND ("distanceMeters" IS NULL OR "distanceMeters" >= 0) AND ("durationSeconds" IS NULL OR "durationSeconds" >= 0) AND ("fareAmount" IS NULL OR "fareAmount" >= 0));

ALTER TABLE "TransitSegment" ADD CONSTRAINT "TransitSegment_mode_check" CHECK ("mode" IN ('WALK', 'DRIVE', 'BUS', 'SUBWAY', 'RAIL', 'TAXI', 'FLIGHT'));

ALTER TABLE "TransitSegment" ADD CONSTRAINT "TransitSegment_coordinate_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'));

ALTER TABLE "TransitSegment" ADD CONSTRAINT "TransitSegment_geometry_check" CHECK ("geometryKind" IN ('ROAD_NETWORK', 'TRANSIT_LINE', 'SCHEMATIC', 'NONE'));

ALTER TABLE "TransitSegment" ADD CONSTRAINT "TransitSegment_json_check" CHECK (
      (("positionsJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("positionsJson")::jsonb), '') = 'array' AND
      ("trafficSectionsJson" IS NULL OR ((("trafficSectionsJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("trafficSectionsJson")::jsonb), '') = 'array'))
    );

ALTER TABLE "TransitSegment" ADD CONSTRAINT "TransitSegment_time_check" CHECK ("departAt" IS NULL OR "arriveAt" IS NULL OR "arriveAt" >= "departAt");

ALTER TABLE "VisitEventDetail" ADD CONSTRAINT "VisitEventDetail_coordinate_check" CHECK ("plannedLat" BETWEEN -90 AND 90 AND "plannedLng" BETWEEN -180 AND 180 AND ("actualLat" IS NULL OR "actualLat" BETWEEN -90 AND 90) AND ("actualLng" IS NULL OR "actualLng" BETWEEN -180 AND 180) AND (("actualLat" IS NULL) = ("actualLng" IS NULL)));

ALTER TABLE "VisitEventDetail" ADD CONSTRAINT "VisitEventDetail_system_check" CHECK ("coordinateSystem" IN ('WGS84', 'GCJ02', 'BD09', 'LOCAL'));

ALTER TABLE "VisitEventDetail" ADD CONSTRAINT "VisitEventDetail_duration_check" CHECK (("plannedDurationMinutes" IS NULL OR "plannedDurationMinutes" >= 0) AND ("actualDurationMinutes" IS NULL OR "actualDurationMinutes" >= 0));

ALTER TABLE "WorkspaceAgentRun" ADD CONSTRAINT "WorkspaceAgentRun_status_check" CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED'));

ALTER TABLE "WorkspaceAgentRun" ADD CONSTRAINT "WorkspaceAgentRun_completion_check" CHECK (
      ("status" = 'RUNNING' AND "completedAt" IS NULL AND "runtimeOwnerId" IS NOT NULL AND "heartbeatAt" IS NOT NULL AND "leaseExpiresAt" IS NOT NULL) OR
      ("status" <> 'RUNNING' AND "completedAt" IS NOT NULL AND "leaseExpiresAt" IS NULL)
    );

ALTER TABLE "WorkspaceAgentRun" ADD CONSTRAINT "WorkspaceAgentRun_failure_check" CHECK ("status" <> 'FAILED' OR "errorCode" IS NOT NULL OR "errorMessage" IS NOT NULL);

ALTER TABLE "WorkspaceAgentRun" ADD CONSTRAINT "WorkspaceAgentRun_lease_check" CHECK ("heartbeatAt" IS NULL OR "leaseExpiresAt" IS NULL OR "leaseExpiresAt" > "heartbeatAt");

ALTER TABLE "WorkspaceAgentRun" ADD CONSTRAINT "WorkspaceAgentRun_time_check" CHECK ("completedAt" IS NULL OR "completedAt" >= "startedAt");

ALTER TABLE "WorkspaceMessage" ADD CONSTRAINT "WorkspaceMessage_role_check" CHECK ("role" IN ('USER', 'ASSISTANT', 'SYSTEM'));

ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_revision_check" CHECK ("revision" > 0);

ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_parent_check" CHECK (("revision" = 1 AND "parentRevisionId" IS NULL) OR ("revision" > 1 AND "parentRevisionId" IS NOT NULL));

ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_json_check" CHECK (
      (("beforeGraphJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("beforeGraphJson")::jsonb), '') = 'object' AND
      (("afterGraphJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("afterGraphJson")::jsonb), '') = 'object' AND
      (("patchJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("patchJson")::jsonb), '') = 'array' AND
      (("inversePatchJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("inversePatchJson")::jsonb), '') = 'array'
    );

ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_graph_identity_check" CHECK (
      coalesce(jsonb_typeof(("beforeGraphJson")::jsonb #> '{id}'), '') = 'string' AND
      coalesce(jsonb_typeof(("beforeGraphJson")::jsonb #> '{ownerId}'), '') = 'string' AND
      coalesce(jsonb_typeof(("afterGraphJson")::jsonb #> '{id}'), '') = 'string' AND
      coalesce(jsonb_typeof(("afterGraphJson")::jsonb #> '{ownerId}'), '') = 'string' AND
      (("beforeGraphJson")::jsonb #>> '{id}') = (("afterGraphJson")::jsonb #>> '{id}') AND
      (("beforeGraphJson")::jsonb #>> '{ownerId}') = (("afterGraphJson")::jsonb #>> '{ownerId}')
    );

ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_actor_check" CHECK (
      ("actorKind" = 'USER' AND "actorUserId" IS NOT NULL AND "actorAgentRunId" IS NULL) OR
      ("actorKind" = 'AGENT' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NOT NULL) OR
      ("actorKind" = 'SYSTEM' AND "actorUserId" IS NULL AND "actorAgentRunId" IS NULL)
    );

ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_command_check" CHECK ("commandName" IN ('journey.add_event', 'journey.update_event', 'journey.move_event', 'journey.place_event', 'journey.retire_event', 'journey.replace_event', 'journey.add_link', 'journey.retire_link', 'journey.select_branch', 'journey.plan_transit', 'journey.select_transit_plan', 'journey.confirm_actual', 'journey.skip_event', 'journey.cancel_event', 'journey.attach_asset', 'journey.add_observation', 'journey.link_source_item', 'journey.undo', 'journey.apply_draft', 'workspace.refresh', 'workspace.replay', 'workspace.fork', 'workspace.commit'));

ALTER TABLE "WorkspaceRevision" ADD CONSTRAINT "WorkspaceRevision_key_check" CHECK (length(trim("idempotencyKey")) > 0);

ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_base_check" CHECK (("sourceJourneyId" IS NULL) = ("baseJourneyRevision" IS NULL));

ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_revision_check" CHECK ("headWorkspaceRevision" >= 0 AND ("baseJourneyRevision" IS NULL OR "baseJourneyRevision" > 0));

ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_status_check" CHECK ("status" IN ('ACTIVE', 'ARCHIVED'));

ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_archive_check" CHECK (("status" = 'ARCHIVED' AND "archivedAt" IS NOT NULL) OR ("status" <> 'ARCHIVED' AND "archivedAt" IS NULL));

ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_json_check" CHECK ((("headGraphJson")::jsonb IS NOT NULL) AND coalesce(jsonb_typeof(("headGraphJson")::jsonb), '') = 'object');

ALTER TABLE "WorkspaceSession" ADD CONSTRAINT "WorkspaceSession_graph_identity_check" CHECK (
      coalesce(jsonb_typeof(("headGraphJson")::jsonb #> '{ownerId}'), '') = 'string' AND
      (("headGraphJson")::jsonb #>> '{ownerId}') = "ownerId" AND
      ("sourceJourneyId" IS NULL OR (coalesce(jsonb_typeof(("headGraphJson")::jsonb #> '{id}'), '') = 'string' AND (("headGraphJson")::jsonb #>> '{id}') = "sourceJourneyId"))
    );

-- ActivityEventDetail_delete_guard
CREATE FUNCTION "periplus_guard_094f371c5a47"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ActivityEventDetail can only be deleted by deleting its Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "ActivityEventDetail_delete_guard" BEFORE DELETE ON "ActivityEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_094f371c5a47"();

-- ActivityEventDetail_insert_guard
CREATE FUNCTION "periplus_guard_a63c83af7842"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'ACTIVITY') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ActivityEventDetail requires an ACTIVITY Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ActivityEventDetail_insert_guard" BEFORE INSERT ON "ActivityEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_a63c83af7842"();

-- ActivityEventDetail_update_guard
CREATE FUNCTION "periplus_guard_a47593a1e570"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'ACTIVITY') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ActivityEventDetail requires an ACTIVITY Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ActivityEventDetail_update_guard" BEFORE UPDATE OF "eventId" ON "ActivityEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_a47593a1e570"();

-- Asset_active_reference_update_guard
CREATE FUNCTION "periplus_guard_2a44c43518c5"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
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
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Asset update would invalidate an active Event or SourceDocument reference';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Asset_active_reference_update_guard" BEFORE UPDATE OF "ownerId", "checksum", "visibility", "deletedAt" ON "Asset"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_2a44c43518c5"();

-- EventAssetLink_insert_guard
CREATE FUNCTION "periplus_guard_13728b04aec9"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize attachment and soft-delete decisions on the resource row.
  PERFORM 1 FROM "Asset" WHERE "id" = NEW."assetId" FOR UPDATE;
  IF NOT EXISTS (
  SELECT 1 FROM "Asset" asset
  JOIN "Journey" journey ON journey."id" = NEW."journeyId"
  WHERE asset."id" = NEW."assetId"
    AND asset."deletedAt" IS NULL
    AND asset."checksum" = NEW."assetChecksum"
    AND (asset."ownerId" = journey."ownerId" OR asset."visibility" = 'PUBLIC')
    AND CASE NEW."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
        <= CASE asset."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EventAssetLink must pin an authorized Asset without broadening visibility';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "EventAssetLink_insert_guard" BEFORE INSERT ON "EventAssetLink"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_13728b04aec9"();

-- EventAssetLink_update_guard
CREATE FUNCTION "periplus_guard_27a341864b89"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize attachment and soft-delete decisions on the resource row.
  PERFORM 1 FROM "Asset" WHERE "id" = NEW."assetId" FOR UPDATE;
  IF NOT EXISTS (
  SELECT 1 FROM "Asset" asset
  JOIN "Journey" journey ON journey."id" = NEW."journeyId"
  WHERE asset."id" = NEW."assetId"
    AND asset."deletedAt" IS NULL
    AND asset."checksum" = NEW."assetChecksum"
    AND (asset."ownerId" = journey."ownerId" OR asset."visibility" = 'PUBLIC')
    AND CASE NEW."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
        <= CASE asset."visibility" WHEN 'PRIVATE' THEN 0 WHEN 'JOURNEY' THEN 1 ELSE 2 END
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EventAssetLink must pin an authorized Asset without broadening visibility';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "EventAssetLink_update_guard" BEFORE UPDATE OF "assetId", "assetChecksum", "visibility", "journeyId" ON "EventAssetLink"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_27a341864b89"();

-- EventObservation_delete_guard
CREATE FUNCTION "periplus_guard_5abfd84712d2"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" event WHERE event."id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Observations can only be deleted by purging their Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "EventObservation_delete_guard" BEFORE DELETE ON "EventObservation"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_5abfd84712d2"();

-- EventObservation_insert_guard
CREATE FUNCTION "periplus_guard_8f1a80f4c8a3"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."supersedesId" IS NOT NULL AND NOT EXISTS (
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
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Observation supersession must continue the current same-kind Event chain';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "EventObservation_insert_guard" BEFORE INSERT ON "EventObservation"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_8f1a80f4c8a3"();

-- EventObservation_update_guard
CREATE FUNCTION "periplus_guard_7b6576a2199c"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Observations are append-only';

  RETURN NEW;
END;
$$;
CREATE TRIGGER "EventObservation_update_guard" BEFORE UPDATE ON "EventObservation"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_7b6576a2199c"();

-- EventSourceLink_insert_guard
CREATE FUNCTION "periplus_guard_590f91b51807"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
  SELECT 1 FROM "SourceItem" item
  JOIN "SourceDocument" document ON document."id" = item."sourceDocumentId"
  WHERE item."id" = NEW."sourceItemId"
    AND document."id" = NEW."sourceDocumentId"
    AND document."checksum" = NEW."sourceDocumentChecksum"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EventSourceLink must pin its SourceItem document and checksum';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "EventSourceLink_insert_guard" BEFORE INSERT ON "EventSourceLink"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_590f91b51807"();

-- EventSourceLink_update_guard
CREATE FUNCTION "periplus_guard_dbfac65af6da"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
  SELECT 1 FROM "SourceItem" item
  JOIN "SourceDocument" document ON document."id" = item."sourceDocumentId"
  WHERE item."id" = NEW."sourceItemId"
    AND document."id" = NEW."sourceDocumentId"
    AND document."checksum" = NEW."sourceDocumentChecksum"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'EventSourceLink must pin its SourceItem document and checksum';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "EventSourceLink_update_guard" BEFORE UPDATE OF "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum" ON "EventSourceLink"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_dbfac65af6da"();

-- JourneyBranchSelection_delete_guard
CREATE FUNCTION "periplus_guard_d7d4b85b7dd2"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = OLD."journeyId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'branch selections cannot be deleted while their Journey exists';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "JourneyBranchSelection_delete_guard" BEFORE DELETE ON "JourneyBranchSelection"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_d7d4b85b7dd2"();

-- JourneyBranchSelection_insert_guard
CREATE FUNCTION "periplus_guard_b77be3fb0df5"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
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
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'branch selection must select an active outgoing Link and supersede the current decision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyBranchSelection_insert_guard" BEFORE INSERT ON "JourneyBranchSelection"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_b77be3fb0df5"();

-- JourneyBranchSelection_update_guard
CREATE FUNCTION "periplus_guard_e1c0fec70c9d"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'branch selections are append-only';

  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyBranchSelection_update_guard" BEFORE UPDATE ON "JourneyBranchSelection"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_e1c0fec70c9d"();

-- JourneyEventLink_current_selection_retire_guard
CREATE FUNCTION "periplus_guard_ef592fef2b50"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."retiredRevision" IS NULL AND NEW."retiredRevision" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "JourneyBranchSelection" current
  WHERE current."journeyId" = OLD."journeyId"
    AND current."selectedLinkId" = OLD."id"
    AND EXISTS (
      SELECT 1 FROM "JourneyEvent" fork
      WHERE fork."journeyId" = current."journeyId"
        AND fork."id" = current."forkEventId"
        AND fork."retiredRevision" IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM "JourneyBranchSelection" newer
      WHERE newer."supersedesId" = current."id"
    )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'current branch selection must be superseded before retiring its Link';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEventLink_current_selection_retire_guard" BEFORE UPDATE OF "retiredRevision" ON "JourneyEventLink"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_ef592fef2b50"();

-- JourneyEventLink_insert_guard
CREATE FUNCTION "periplus_guard_409e454cd041"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."retiredRevision" IS NULL AND NOT EXISTS (
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
    AND source."parentSectionEventId" IS NOT DISTINCT FROM target."parentSectionEventId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active Link endpoints must be active, scheduled, and in the same scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEventLink_insert_guard" BEFORE INSERT ON "JourneyEventLink"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_409e454cd041"();

-- JourneyEventLink_update_guard
CREATE FUNCTION "periplus_guard_731a5cef095a"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."retiredRevision" IS NULL AND NOT EXISTS (
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
    AND source."parentSectionEventId" IS NOT DISTINCT FROM target."parentSectionEventId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active Link endpoints must be active, scheduled, and in the same scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEventLink_update_guard" BEFORE UPDATE OF "journeyId", "fromEventId", "toEventId", "retiredRevision" ON "JourneyEventLink"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_731a5cef095a"();

-- JourneyEventReplacement_cycle_guard
CREATE FUNCTION "periplus_guard_259ef8fdc0cc"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
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
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'replacement chain cannot contain a cycle';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEventReplacement_cycle_guard" BEFORE INSERT ON "JourneyEventReplacement"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_259ef8fdc0cc"();

-- JourneyEventReplacement_delete_guard
CREATE FUNCTION "periplus_guard_23bf84018e17"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = OLD."journeyId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'replacement records cannot be deleted while their Journey exists';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "JourneyEventReplacement_delete_guard" BEFORE DELETE ON "JourneyEventReplacement"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_23bf84018e17"();

-- JourneyEventReplacement_scope_guard
CREATE FUNCTION "periplus_guard_eba1e1807c41"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
  SELECT 1 FROM "JourneyEvent" predecessor
  JOIN "JourneyEvent" successor
    ON successor."journeyId" = predecessor."journeyId"
   AND successor."id" = NEW."successorEventId"
  WHERE predecessor."journeyId" = NEW."journeyId"
    AND predecessor."id" = NEW."predecessorEventId"
    AND predecessor."parentSectionEventId" IS NOT DISTINCT FROM successor."parentSectionEventId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'replacement Events must remain in the same scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEventReplacement_scope_guard" BEFORE INSERT ON "JourneyEventReplacement"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_eba1e1807c41"();

-- JourneyEventReplacement_update_guard
CREATE FUNCTION "periplus_guard_96315eda59dd"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'replacement records are append-only';

  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEventReplacement_update_guard" BEFORE UPDATE ON "JourneyEventReplacement"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_96315eda59dd"();

-- JourneyEvent_active_topology_update_guard
CREATE FUNCTION "periplus_guard_d3f191b0b088"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "JourneyEventLink" link
  WHERE link."journeyId" = OLD."journeyId"
    AND (link."fromEventId" = OLD."id" OR link."toEventId" = OLD."id")
    AND link."retiredRevision" IS NULL
) AND (
  NEW."parentSectionEventId" IS DISTINCT FROM OLD."parentSectionEventId" OR
  NEW."placementStatus" = 'UNSCHEDULED' OR
  NEW."retiredRevision" IS NOT NULL
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active links must be retired before moving, unscheduling, or retiring an Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEvent_active_topology_update_guard" BEFORE UPDATE OF "parentSectionEventId", "placementStatus", "retiredRevision" ON "JourneyEvent"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_d3f191b0b088"();

-- JourneyEvent_parent_insert_guard
CREATE FUNCTION "periplus_guard_db0ad81787e8"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."parentSectionEventId" IS NOT NULL AND (
  NEW."type" = 'SECTION' OR NOT EXISTS (
    SELECT 1 FROM "JourneyEvent" parent
    WHERE parent."journeyId" = NEW."journeyId"
      AND parent."id" = NEW."parentSectionEventId"
      AND parent."type" = 'SECTION'
      AND parent."retiredRevision" IS NULL
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'only non-SECTION Events may belong to an active CITY Section in the same Journey';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEvent_parent_insert_guard" BEFORE INSERT ON "JourneyEvent"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_db0ad81787e8"();

-- JourneyEvent_parent_update_guard
CREATE FUNCTION "periplus_guard_a2bfd0734067"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."parentSectionEventId" IS NOT NULL AND (
  NEW."type" = 'SECTION' OR NOT EXISTS (
    SELECT 1 FROM "JourneyEvent" parent
    WHERE parent."journeyId" = NEW."journeyId"
      AND parent."id" = NEW."parentSectionEventId"
      AND parent."type" = 'SECTION'
      AND parent."retiredRevision" IS NULL
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'only non-SECTION Events may belong to an active CITY Section in the same Journey';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEvent_parent_update_guard" BEFORE UPDATE OF "parentSectionEventId", "journeyId", "type" ON "JourneyEvent"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_a2bfd0734067"();

-- JourneyEvent_type_update_guard
CREATE FUNCTION "periplus_guard_2ad6bc6de98d"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."type" <> OLD."type" AND (
  EXISTS (SELECT 1 FROM "SectionEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "VisitEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "TransitEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "StayEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "MealEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "ActivityEventDetail" WHERE "eventId" = OLD."id") OR
  EXISTS (SELECT 1 FROM "NoteEventDetail" WHERE "eventId" = OLD."id")
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Event type is immutable once a typed detail exists';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEvent_type_update_guard" BEFORE UPDATE OF "type" ON "JourneyEvent"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_2ad6bc6de98d"();

-- JourneyRevision_delete_guard
CREATE FUNCTION "periplus_guard_c267827f0b54"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = OLD."journeyId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Journey revisions cannot be deleted while their Journey exists';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "JourneyRevision_delete_guard" BEFORE DELETE ON "JourneyRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_c267827f0b54"();

-- JourneyRevision_lineage_insert_guard
CREATE FUNCTION "periplus_guard_5d2aa7b6a9fc"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."revision" > 1 AND NOT EXISTS (
  SELECT 1 FROM "JourneyRevision" parent
  WHERE parent."id" = NEW."parentRevisionId"
    AND parent."journeyId" = NEW."journeyId"
    AND parent."revision" = NEW."revision" - 1
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'JourneyRevision parent must be the immediately preceding revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyRevision_lineage_insert_guard" BEFORE INSERT ON "JourneyRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_5d2aa7b6a9fc"();

-- JourneyRevision_snapshot_owner_guard
CREATE FUNCTION "periplus_guard_6b5fe6cefbc9"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = NEW."journeyId"
    AND coalesce(jsonb_typeof((NEW."snapshotJson")::jsonb #> '{ownerId}'), '') = 'string'
    AND ((NEW."snapshotJson")::jsonb #>> '{ownerId}') = journey."ownerId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'JourneyRevision snapshot must preserve Journey ownership';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyRevision_snapshot_owner_guard" BEFORE INSERT ON "JourneyRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_6b5fe6cefbc9"();

-- JourneyRevision_update_guard
CREATE FUNCTION "periplus_guard_26a2883e23f8"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Journey revisions are append-only';

  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyRevision_update_guard" BEFORE UPDATE OF "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "actorAgentRunId", "idempotencyKey", "parentRevisionId", "createdAt" ON "JourneyRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_26a2883e23f8"();

-- JourneyRevision_workspace_guard
CREATE FUNCTION "periplus_guard_2b47636ee23b"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceRevision" revision
  WHERE revision."id" = NEW."workspaceRevisionId"
    AND ((revision."afterGraphJson")::jsonb #>> '{id}') = NEW."journeyId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'committed WorkspaceRevision must describe the same Journey';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyRevision_workspace_guard" BEFORE INSERT ON "JourneyRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_2b47636ee23b"();

-- JourneyRevision_workspace_update_guard
CREATE FUNCTION "periplus_guard_8e4fb6f2c133"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."workspaceRevisionId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceRevision" revision
  WHERE revision."id" = NEW."workspaceRevisionId"
    AND ((revision."afterGraphJson")::jsonb #>> '{id}') = NEW."journeyId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'committed WorkspaceRevision must describe the same Journey';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyRevision_workspace_update_guard" BEFORE UPDATE OF "workspaceRevisionId" ON "JourneyRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_8e4fb6f2c133"();

-- Journey_revision_update_guard
CREATE FUNCTION "periplus_guard_b9d276ff5530"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."revision" <> OLD."revision" AND (
  NEW."revision" <> OLD."revision" + 1 OR NOT EXISTS (
    SELECT 1 FROM "JourneyRevision" revision
    WHERE revision."journeyId" = NEW."id" AND revision."revision" = NEW."revision"
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Journey revision must advance by one to a persisted JourneyRevision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Journey_revision_update_guard" BEFORE UPDATE OF "revision" ON "Journey"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_b9d276ff5530"();

-- MealEventDetail_delete_guard
CREATE FUNCTION "periplus_guard_3c390cfa2c47"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MealEventDetail can only be deleted by deleting its Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "MealEventDetail_delete_guard" BEFORE DELETE ON "MealEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_3c390cfa2c47"();

-- MealEventDetail_insert_guard
CREATE FUNCTION "periplus_guard_8970b2d825c3"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'MEAL') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MealEventDetail requires a MEAL Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "MealEventDetail_insert_guard" BEFORE INSERT ON "MealEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_8970b2d825c3"();

-- MealEventDetail_update_guard
CREATE FUNCTION "periplus_guard_d7393cdb2995"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'MEAL') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'MealEventDetail requires a MEAL Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "MealEventDetail_update_guard" BEFORE UPDATE OF "eventId" ON "MealEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_d7393cdb2995"();

-- NoteEventDetail_delete_guard
CREATE FUNCTION "periplus_guard_380880c7759c"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NoteEventDetail can only be deleted by deleting its Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "NoteEventDetail_delete_guard" BEFORE DELETE ON "NoteEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_380880c7759c"();

-- NoteEventDetail_insert_guard
CREATE FUNCTION "periplus_guard_7df3c0914220"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'NOTE') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NoteEventDetail requires a NOTE Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "NoteEventDetail_insert_guard" BEFORE INSERT ON "NoteEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_7df3c0914220"();

-- NoteEventDetail_update_guard
CREATE FUNCTION "periplus_guard_3fbb208d5e19"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'NOTE') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'NoteEventDetail requires a NOTE Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "NoteEventDetail_update_guard" BEFORE UPDATE OF "eventId" ON "NoteEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_3fbb208d5e19"();

-- ProviderUsageLog_agent_run_guard
CREATE FUNCTION "periplus_guard_dd21be9404f5"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."agentRunId" IS NOT NULL AND (
  NEW."workspaceId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "WorkspaceAgentRun" run
    WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Provider usage Agent run must belong to the attributed Workspace';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ProviderUsageLog_agent_run_guard" BEFORE INSERT ON "ProviderUsageLog"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_dd21be9404f5"();

-- ProviderUsageLog_agent_run_update_guard
CREATE FUNCTION "periplus_guard_13a9b8ec66af"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."agentRunId" IS NOT NULL AND (
  NEW."workspaceId" IS NULL OR NOT EXISTS (
    SELECT 1 FROM "WorkspaceAgentRun" run
    WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
  )
) AND NOT (
  OLD."workspaceId" IS NOT NULL AND
  NEW."workspaceId" IS NULL AND
  NEW."agentRunId" IS NOT DISTINCT FROM OLD."agentRunId" AND
  NOT EXISTS (
    SELECT 1 FROM "WorkspaceSession" workspace
    WHERE workspace."id" = OLD."workspaceId"
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Provider usage Agent run must belong to the attributed Workspace';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ProviderUsageLog_agent_run_update_guard" BEFORE UPDATE OF "workspaceId", "agentRunId" ON "ProviderUsageLog"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_13a9b8ec66af"();

-- SectionEventDetail_delete_guard
CREATE FUNCTION "periplus_guard_39a1ff913ae4"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SectionEventDetail can only be deleted by deleting its Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "SectionEventDetail_delete_guard" BEFORE DELETE ON "SectionEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_39a1ff913ae4"();

-- SectionEventDetail_insert_guard
CREATE FUNCTION "periplus_guard_686f86d3edd1"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'SECTION') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SectionEventDetail requires a SECTION Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SectionEventDetail_insert_guard" BEFORE INSERT ON "SectionEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_686f86d3edd1"();

-- SectionEventDetail_update_guard
CREATE FUNCTION "periplus_guard_bbcb97e91978"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'SECTION') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SectionEventDetail requires a SECTION Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SectionEventDetail_update_guard" BEFORE UPDATE OF "eventId" ON "SectionEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_bbcb97e91978"();

-- SourceDocument_asset_guard
CREATE FUNCTION "periplus_guard_81188f78bb60"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize attachment and soft-delete decisions on the resource row.
  PERFORM 1 FROM "Asset" WHERE "id" = NEW."assetId" FOR UPDATE;
  IF NOT EXISTS (
  SELECT 1 FROM "Asset" asset
  JOIN "SourcePack" pack ON pack."id" = NEW."sourcePackId"
  WHERE asset."id" = NEW."assetId"
    AND asset."ownerId" = pack."ownerId"
    AND asset."checksum" = NEW."checksum"
    AND asset."deletedAt" IS NULL
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SourceDocument must pin an active Asset owned by the SourcePack owner';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SourceDocument_asset_guard" BEFORE INSERT ON "SourceDocument"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_81188f78bb60"();

-- SourceDocument_update_guard
CREATE FUNCTION "periplus_guard_ea6005a0551f"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Serialize attachment and soft-delete decisions on the resource row.
  PERFORM 1 FROM "Asset" WHERE "id" = NEW."assetId" FOR UPDATE;
  IF NOT EXISTS (
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
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'SourceDocument update would invalidate ownership or pinned checksum';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "SourceDocument_update_guard" BEFORE UPDATE OF "sourcePackId", "assetId", "checksum" ON "SourceDocument"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_ea6005a0551f"();

-- StayEventDetail_delete_guard
CREATE FUNCTION "periplus_guard_1c1cacd00eb6"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'StayEventDetail can only be deleted by deleting its Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "StayEventDetail_delete_guard" BEFORE DELETE ON "StayEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_1c1cacd00eb6"();

-- StayEventDetail_insert_guard
CREATE FUNCTION "periplus_guard_45eace36b642"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'STAY') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'StayEventDetail requires a STAY Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StayEventDetail_insert_guard" BEFORE INSERT ON "StayEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_45eace36b642"();

-- StayEventDetail_update_guard
CREATE FUNCTION "periplus_guard_cbb40e261f8a"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'STAY') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'StayEventDetail requires a STAY Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "StayEventDetail_update_guard" BEFORE UPDATE OF "eventId" ON "StayEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_cbb40e261f8a"();

-- TransitEventDetail_active_run_guard
CREATE FUNCTION "periplus_guard_0a960a1f00a1"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."routeState" IN ('READY', 'ROUTE_STALE') AND NOT EXISTS (
  SELECT 1 FROM "TransitPlanningRun" run
  WHERE run."id" = NEW."activePlanningRunId"
    AND run."transitEventId" = NEW."eventId"
    AND run."status" = 'READY'
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'active Transit run must be READY';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitEventDetail_active_run_guard" BEFORE UPDATE OF "activePlanningRunId", "selectedPlanId", "routeState" ON "TransitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_0a960a1f00a1"();

-- TransitEventDetail_delete_guard
CREATE FUNCTION "periplus_guard_b83c41aee3cf"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TransitEventDetail can only be deleted by deleting its Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "TransitEventDetail_delete_guard" BEFORE DELETE ON "TransitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_b83c41aee3cf"();

-- TransitEventDetail_endpoint_insert_guard
CREATE FUNCTION "periplus_guard_79cb98e1e370"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "JourneyEvent" transit
  WHERE transit."id" = NEW."eventId" AND (
    (NEW."plannedFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."plannedToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL))
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Transit endpoints must be active, scheduled, and in the same Journey scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitEventDetail_endpoint_insert_guard" BEFORE INSERT ON "TransitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_79cb98e1e370"();

-- TransitEventDetail_endpoint_update_guard
CREATE FUNCTION "periplus_guard_90b48acc962c"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "JourneyEvent" transit
  WHERE transit."id" = NEW."eventId" AND (
    (NEW."plannedFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."plannedToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."plannedToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualFromEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualFromEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL)) OR
    (NEW."actualToEventId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "JourneyEvent" endpoint WHERE endpoint."id" = NEW."actualToEventId" AND endpoint."journeyId" = transit."journeyId" AND endpoint."parentSectionEventId" IS NOT DISTINCT FROM transit."parentSectionEventId" AND endpoint."placementStatus" = 'SCHEDULED' AND endpoint."retiredRevision" IS NULL))
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Transit endpoints must be active, scheduled, and in the same Journey scope';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitEventDetail_endpoint_update_guard" BEFORE UPDATE OF "eventId", "plannedFromEventId", "plannedToEventId", "actualFromEventId", "actualToEventId" ON "TransitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_90b48acc962c"();

-- TransitEventDetail_insert_guard
CREATE FUNCTION "periplus_guard_464f12ab1b27"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'TRANSIT') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TransitEventDetail requires a TRANSIT Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitEventDetail_insert_guard" BEFORE INSERT ON "TransitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_464f12ab1b27"();

-- TransitEventDetail_update_guard
CREATE FUNCTION "periplus_guard_0fe1d485a079"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'TRANSIT') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'TransitEventDetail requires a TRANSIT Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitEventDetail_update_guard" BEFORE UPDATE OF "eventId" ON "TransitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_0fe1d485a079"();

-- TransitPlan_delete_guard
CREATE FUNCTION "periplus_guard_1c74d91b1463"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "TransitPlanningRun" run
  WHERE run."id" = OLD."planningRunId" AND run."status" <> 'PLANNING'
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Plans cannot be deleted after a run leaves PLANNING';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "TransitPlan_delete_guard" BEFORE DELETE ON "TransitPlan"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_1c74d91b1463"();

-- TransitPlan_insert_guard
CREATE FUNCTION "periplus_guard_5509ea530dc2"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "TransitPlanningRun" run
  WHERE run."id" = NEW."planningRunId"
    AND run."transitEventId" = NEW."transitEventId"
    AND run."status" <> 'PLANNING'
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'finalized planning run cannot accept Plans';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitPlan_insert_guard" BEFORE INSERT ON "TransitPlan"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_5509ea530dc2"();

-- TransitPlan_mutation_guard
CREATE FUNCTION "periplus_guard_d3bcf0efb34f"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "TransitPlanningRun" WHERE "id" = OLD."planningRunId" AND "status" <> 'PLANNING') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Plans are immutable after a run leaves PLANNING';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitPlan_mutation_guard" BEFORE UPDATE ON "TransitPlan"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_d3bcf0efb34f"();

-- TransitPlanningRun_delete_guard
CREATE FUNCTION "periplus_guard_794428d70ffa"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" <> 'PLANNING' AND EXISTS (
  SELECT 1 FROM "TransitEventDetail" detail
  WHERE detail."eventId" = OLD."transitEventId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'finalized planning runs can only be deleted by purging their Transit Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "TransitPlanningRun_delete_guard" BEFORE DELETE ON "TransitPlanningRun"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_794428d70ffa"();

-- TransitPlanningRun_ready_insert_guard
CREATE FUNCTION "periplus_guard_2a37e0f19885"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" = 'READY' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'create a planning run before finalizing it as READY';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitPlanningRun_ready_insert_guard" BEFORE INSERT ON "TransitPlanningRun"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_2a37e0f19885"();

-- TransitPlanningRun_status_update_guard
CREATE FUNCTION "periplus_guard_56a46fabc6e5"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD."status" <> 'PLANNING' AND NEW."status" <> OLD."status") OR
  (NEW."status" = 'READY' AND NOT EXISTS (
    SELECT 1 FROM "TransitPlan" plan
    WHERE plan."planningRunId" = NEW."id" AND plan."transitEventId" = NEW."transitEventId"
  )) OR
  (NEW."status" = 'FAILED' AND EXISTS (
    SELECT 1 FROM "TransitPlan" plan
    WHERE plan."planningRunId" = NEW."id" AND plan."transitEventId" = NEW."transitEventId"
  )) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'READY run requires Plans and FAILED run cannot contain Plans';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitPlanningRun_status_update_guard" BEFORE UPDATE OF "status" ON "TransitPlanningRun"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_56a46fabc6e5"();

-- TransitSegment_delete_guard
CREATE FUNCTION "periplus_guard_24f284f36a4a"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "TransitPlan" plan
  JOIN "TransitPlanningRun" run ON run."id" = plan."planningRunId"
  WHERE plan."id" = OLD."transitPlanId" AND run."status" <> 'PLANNING'
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Segments cannot be deleted after a run leaves PLANNING';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "TransitSegment_delete_guard" BEFORE DELETE ON "TransitSegment"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_24f284f36a4a"();

-- TransitSegment_insert_guard
CREATE FUNCTION "periplus_guard_26477953ddbb"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "TransitPlan" plan
  JOIN "TransitPlanningRun" run ON run."id" = plan."planningRunId"
  WHERE plan."id" = NEW."transitPlanId" AND run."status" <> 'PLANNING'
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'finalized planning run cannot accept Segments';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitSegment_insert_guard" BEFORE INSERT ON "TransitSegment"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_26477953ddbb"();

-- TransitSegment_mutation_guard
CREATE FUNCTION "periplus_guard_3045ea33e75a"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "TransitPlan" plan
  JOIN "TransitPlanningRun" run ON run."id" = plan."planningRunId"
  WHERE plan."id" = OLD."transitPlanId" AND run."status" <> 'PLANNING'
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Segments are immutable after a run leaves PLANNING';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "TransitSegment_mutation_guard" BEFORE UPDATE ON "TransitSegment"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_3045ea33e75a"();

-- VisitEventDetail_delete_guard
CREATE FUNCTION "periplus_guard_eba4fb83ccb9"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = OLD."eventId") THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'VisitEventDetail can only be deleted by deleting its Event';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "VisitEventDetail_delete_guard" BEFORE DELETE ON "VisitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_eba4fb83ccb9"();

-- VisitEventDetail_insert_guard
CREATE FUNCTION "periplus_guard_38f3c16463b6"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'VISIT') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'VisitEventDetail requires a VISIT Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "VisitEventDetail_insert_guard" BEFORE INSERT ON "VisitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_38f3c16463b6"();

-- VisitEventDetail_update_guard
CREATE FUNCTION "periplus_guard_0301fc50175a"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "JourneyEvent" WHERE "id" = NEW."eventId" AND "type" = 'VISIT') THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'VisitEventDetail requires a VISIT Event';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "VisitEventDetail_update_guard" BEFORE UPDATE OF "eventId" ON "VisitEventDetail"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_0301fc50175a"();

-- WorkspaceMessage_agent_run_guard
CREATE FUNCTION "periplus_guard_11e61001d9a1"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."agentRunId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceAgentRun" run
  WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WorkspaceMessage agent run must belong to the same Workspace';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceMessage_agent_run_guard" BEFORE INSERT ON "WorkspaceMessage"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_11e61001d9a1"();

-- WorkspaceMessage_agent_run_update_guard
CREATE FUNCTION "periplus_guard_c096020a896a"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."agentRunId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceAgentRun" run
  WHERE run."id" = NEW."agentRunId" AND run."workspaceId" = NEW."workspaceId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WorkspaceMessage agent run must belong to the same Workspace';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceMessage_agent_run_update_guard" BEFORE UPDATE OF "workspaceId", "agentRunId" ON "WorkspaceMessage"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_c096020a896a"();

-- WorkspaceRevision_delete_guard
CREATE FUNCTION "periplus_guard_58f14a4c19fc"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
  SELECT 1 FROM "WorkspaceSession" workspace
  WHERE workspace."id" = OLD."workspaceId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace revisions cannot be deleted while their Workspace exists';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "WorkspaceRevision_delete_guard" BEFORE DELETE ON "WorkspaceRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_58f14a4c19fc"();

-- WorkspaceRevision_identity_insert_guard
CREATE FUNCTION "periplus_guard_48b83fbf8a2f"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
  SELECT 1 FROM "WorkspaceSession" workspace
  WHERE workspace."id" = NEW."workspaceId"
    AND ((NEW."afterGraphJson")::jsonb #>> '{ownerId}') = workspace."ownerId"
    AND (workspace."sourceJourneyId" IS NULL OR ((NEW."afterGraphJson")::jsonb #>> '{id}') = workspace."sourceJourneyId")
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WorkspaceRevision graph must preserve Workspace Journey identity and owner';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceRevision_identity_insert_guard" BEFORE INSERT ON "WorkspaceRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_48b83fbf8a2f"();

-- WorkspaceRevision_lineage_insert_guard
CREATE FUNCTION "periplus_guard_76d9490a43f7"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."revision" > 1 AND NOT EXISTS (
  SELECT 1 FROM "WorkspaceRevision" parent
  WHERE parent."id" = NEW."parentRevisionId"
    AND parent."workspaceId" = NEW."workspaceId"
    AND parent."revision" = NEW."revision" - 1
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'WorkspaceRevision parent must be the immediately preceding revision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceRevision_lineage_insert_guard" BEFORE INSERT ON "WorkspaceRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_76d9490a43f7"();

-- WorkspaceRevision_update_guard
CREATE FUNCTION "periplus_guard_45466c0d7397"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace revisions are append-only';

  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceRevision_update_guard" BEFORE UPDATE ON "WorkspaceRevision"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_45466c0d7397"();

-- WorkspaceSession_head_insert_guard
CREATE FUNCTION "periplus_guard_5c85627aea58"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."headWorkspaceRevision" <> 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'new Workspace must start at head revision 0';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceSession_head_insert_guard" BEFORE INSERT ON "WorkspaceSession"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_5c85627aea58"();

-- WorkspaceSession_head_update_guard
CREATE FUNCTION "periplus_guard_4cb00081fc05"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."headWorkspaceRevision" <> OLD."headWorkspaceRevision" AND (
  NEW."headWorkspaceRevision" <> OLD."headWorkspaceRevision" + 1 OR NOT EXISTS (
    SELECT 1 FROM "WorkspaceRevision" revision
    WHERE revision."workspaceId" = NEW."id"
      AND revision."revision" = NEW."headWorkspaceRevision"
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace head must advance by one to a persisted WorkspaceRevision';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceSession_head_update_guard" BEFORE UPDATE OF "headWorkspaceRevision" ON "WorkspaceSession"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_4cb00081fc05"();

-- WorkspaceSession_owner_insert_guard
CREATE FUNCTION "periplus_guard_f1f06d918cc5"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sourceJourneyId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Journey" journey
  WHERE journey."id" = NEW."sourceJourneyId" AND journey."ownerId" = NEW."ownerId"
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace source Journey must belong to its owner';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceSession_owner_insert_guard" BEFORE INSERT ON "WorkspaceSession"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_f1f06d918cc5"();

-- WorkspaceSession_owner_update_guard
CREATE FUNCTION "periplus_guard_636abbbf29bb"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."ownerId" <> OLD."ownerId" OR (
  NEW."sourceJourneyId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "Journey" journey
    WHERE journey."id" = NEW."sourceJourneyId" AND journey."ownerId" = NEW."ownerId"
  )
) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace owner is immutable and its source Journey must belong to that owner';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "WorkspaceSession_owner_update_guard" BEFORE UPDATE OF "ownerId", "sourceJourneyId" ON "WorkspaceSession"
FOR EACH ROW EXECUTE FUNCTION "periplus_guard_636abbbf29bb"();
