-- CreateTable
CREATE TABLE "Journey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Journey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "parentEventId" TEXT,
    "replacedByEventId" TEXT,
    "type" TEXT NOT NULL,
    "executionStatus" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'ORIGINAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "plannedStartAt" DATETIME,
    "plannedEndAt" DATETIME,
    "actualStartAt" DATETIME,
    "actualEndAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JourneyEvent_parentEventId_fkey" FOREIGN KEY ("parentEventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JourneyEvent_replacedByEventId_fkey" FOREIGN KEY ("replacedByEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEventLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "fromEventId" TEXT NOT NULL,
    "toEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MAIN',
    "branchKey" TEXT,
    "rank" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JourneyEventLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventLink_fromEventId_fkey" FOREIGN KEY ("fromEventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventLink_toEventId_fkey" FOREIGN KEY ("toEventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SectionEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "placeId" TEXT,
    "lat" REAL,
    "lng" REAL,
    "coordinateSystem" TEXT,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
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
    "coordinateSystem" TEXT,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
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
    "coordinateSystem" TEXT,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "checkInNote" TEXT,
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
    "coordinateSystem" TEXT,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "cuisine" TEXT,
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
    "coordinateSystem" TEXT,
    "coordinateProvider" TEXT,
    "providerPlaceId" TEXT,
    "plannedDurationMinutes" INTEGER,
    "actualDurationMinutes" INTEGER,
    "bookingReference" TEXT,
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
    "selectedPlanId" TEXT,
    "planningStatus" TEXT,
    "planningWarning" TEXT,
    "notes" TEXT,
    CONSTRAINT "TransitEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_plannedFromEventId_fkey" FOREIGN KEY ("plannedFromEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_plannedToEventId_fkey" FOREIGN KEY ("plannedToEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_actualFromEventId_fkey" FOREIGN KEY ("actualFromEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransitEventDetail_actualToEventId_fkey" FOREIGN KEY ("actualToEventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteEventDetail" (
    "eventId" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    CONSTRAINT "NoteEventDetail_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransitPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "requestFingerprint" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransitPlan_transitEventId_fkey" FOREIGN KEY ("transitEventId") REFERENCES "TransitEventDetail" ("eventId") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "TransitSegment_transitPlanId_fkey" FOREIGN KEY ("transitPlanId") REFERENCES "TransitPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEventRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "journeyId" TEXT NOT NULL,
    "eventId" TEXT,
    "journeyRevision" INTEGER NOT NULL,
    "operation" TEXT NOT NULL,
    "patchJson" TEXT NOT NULL,
    "inversePatchJson" TEXT,
    "actorId" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JourneyEventRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JourneyEventRevision_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JourneyEventAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JourneyEventAttachment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "JourneyEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "caption" TEXT,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Photo_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "updatedAt" DATETIME NOT NULL
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
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProviderRequestCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProviderUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
-- CreateIndex
CREATE INDEX "Journey_ownerId_idx" ON "Journey"("ownerId");

-- CreateIndex
CREATE INDEX "JourneyEvent_journeyId_idx" ON "JourneyEvent"("journeyId");

-- CreateIndex
CREATE INDEX "JourneyEvent_parentEventId_idx" ON "JourneyEvent"("parentEventId");

-- CreateIndex
CREATE INDEX "JourneyEvent_type_idx" ON "JourneyEvent"("type");

-- CreateIndex
CREATE INDEX "JourneyEvent_executionStatus_idx" ON "JourneyEvent"("executionStatus");

-- CreateIndex
CREATE INDEX "JourneyEventLink_journeyId_kind_idx" ON "JourneyEventLink"("journeyId", "kind");

-- CreateIndex
CREATE INDEX "JourneyEventLink_fromEventId_idx" ON "JourneyEventLink"("fromEventId");

-- CreateIndex
CREATE INDEX "JourneyEventLink_toEventId_idx" ON "JourneyEventLink"("toEventId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEventLink_journeyId_fromEventId_toEventId_kind_key" ON "JourneyEventLink"("journeyId", "fromEventId", "toEventId", "kind");

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
CREATE INDEX "TransitPlan_transitEventId_idx" ON "TransitPlan"("transitEventId");

-- CreateIndex
CREATE INDEX "TransitPlan_requestFingerprint_idx" ON "TransitPlan"("requestFingerprint");

-- CreateIndex
CREATE INDEX "TransitSegment_transitPlanId_idx" ON "TransitSegment"("transitPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "TransitSegment_transitPlanId_order_key" ON "TransitSegment"("transitPlanId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEventRevision_journeyId_idempotencyKey_key" ON "JourneyEventRevision"("journeyId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "JourneyEventRevision_journeyId_journeyRevision_idx" ON "JourneyEventRevision"("journeyId", "journeyRevision");

-- CreateIndex
CREATE INDEX "JourneyEventRevision_eventId_idx" ON "JourneyEventRevision"("eventId");

-- CreateIndex
CREATE INDEX "JourneyEventAttachment_eventId_idx" ON "JourneyEventAttachment"("eventId");

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
CREATE INDEX "Photo_ownerId_idx" ON "Photo"("ownerId");

-- CreateIndex
CREATE INDEX "Photo_createdAt_idx" ON "Photo"("createdAt");

-- CreateIndex
CREATE INDEX "AgentSession_userId_idx" ON "AgentSession"("userId");

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
CREATE INDEX "ProviderUsageLog_createdAt_idx" ON "ProviderUsageLog"("createdAt");
