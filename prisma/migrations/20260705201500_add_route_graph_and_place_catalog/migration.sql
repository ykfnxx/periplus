-- Backfill the route graph tables that the current schema already depends on.
CREATE TABLE IF NOT EXISTS "RouteNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "order" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "notes" TEXT,
    CONSTRAINT "RouteNode_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "RouteEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transportMode" TEXT,
    "durationMinutes" INTEGER,
    "distanceKm" REAL,
    "costEstimate" REAL,
    "notes" TEXT,
    CONSTRAINT "RouteEdge_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "Route" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RouteEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "RouteNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RouteEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "RouteNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SubPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "routeNodeId" TEXT NOT NULL,
    CONSTRAINT "SubPlan_routeNodeId_fkey" FOREIGN KEY ("routeNodeId") REFERENCES "RouteNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SubPlanNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "order" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "notes" TEXT,
    CONSTRAINT "SubPlanNode_subPlanId_fkey" FOREIGN KEY ("subPlanId") REFERENCES "SubPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SubPlanEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "subPlanId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transportMode" TEXT,
    "durationMinutes" INTEGER,
    "distanceKm" REAL,
    "costEstimate" REAL,
    "notes" TEXT,
    CONSTRAINT "SubPlanEdge_subPlanId_fkey" FOREIGN KEY ("subPlanId") REFERENCES "SubPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubPlanEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "SubPlanNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubPlanEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "SubPlanNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "RouteNode" ADD COLUMN "placeId" TEXT;
ALTER TABLE "RouteNode" ADD COLUMN "coordinateSystem" TEXT;
ALTER TABLE "RouteNode" ADD COLUMN "coordinateProvider" TEXT;
ALTER TABLE "RouteNode" ADD COLUMN "providerPlaceId" TEXT;

ALTER TABLE "SubPlanNode" ADD COLUMN "placeId" TEXT;
ALTER TABLE "SubPlanNode" ADD COLUMN "coordinateSystem" TEXT;
ALTER TABLE "SubPlanNode" ADD COLUMN "coordinateProvider" TEXT;
ALTER TABLE "SubPlanNode" ADD COLUMN "providerPlaceId" TEXT;

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

CREATE TABLE "PlaceAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "locale" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlaceAlias_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

CREATE TABLE "ProviderRequestCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProviderUsageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "RouteNode_routeId_order_key" ON "RouteNode"("routeId", "order");
CREATE INDEX IF NOT EXISTS "RouteNode_routeId_idx" ON "RouteNode"("routeId");
CREATE INDEX IF NOT EXISTS "RouteNode_placeId_idx" ON "RouteNode"("placeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RouteEdge_fromNodeId_key" ON "RouteEdge"("fromNodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "RouteEdge_toNodeId_key" ON "RouteEdge"("toNodeId");
CREATE INDEX IF NOT EXISTS "RouteEdge_routeId_idx" ON "RouteEdge"("routeId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubPlan_routeNodeId_key" ON "SubPlan"("routeNodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubPlanNode_subPlanId_order_key" ON "SubPlanNode"("subPlanId", "order");
CREATE INDEX IF NOT EXISTS "SubPlanNode_subPlanId_idx" ON "SubPlanNode"("subPlanId");
CREATE INDEX IF NOT EXISTS "SubPlanNode_placeId_idx" ON "SubPlanNode"("placeId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubPlanEdge_fromNodeId_key" ON "SubPlanEdge"("fromNodeId");
CREATE UNIQUE INDEX IF NOT EXISTS "SubPlanEdge_toNodeId_key" ON "SubPlanEdge"("toNodeId");
CREATE INDEX IF NOT EXISTS "SubPlanEdge_subPlanId_idx" ON "SubPlanEdge"("subPlanId");
CREATE INDEX "Place_normalizedName_idx" ON "Place"("normalizedName");
CREATE INDEX "Place_city_idx" ON "Place"("city");
CREATE INDEX "Place_category_idx" ON "Place"("category");
CREATE INDEX "Place_sourceQuality_idx" ON "Place"("sourceQuality");
CREATE UNIQUE INDEX "PlaceAlias_placeId_normalizedName_key" ON "PlaceAlias"("placeId", "normalizedName");
CREATE INDEX "PlaceAlias_normalizedName_idx" ON "PlaceAlias"("normalizedName");
CREATE UNIQUE INDEX "PlaceSource_provider_providerId_key" ON "PlaceSource"("provider", "providerId");
CREATE INDEX "PlaceSource_placeId_idx" ON "PlaceSource"("placeId");
CREATE INDEX "PlaceSource_provider_idx" ON "PlaceSource"("provider");
CREATE UNIQUE INDEX "PlaceProviderMatch_provider_providerId_key" ON "PlaceProviderMatch"("provider", "providerId");
CREATE INDEX "PlaceProviderMatch_placeId_idx" ON "PlaceProviderMatch"("placeId");
CREATE INDEX "PlaceProviderMatch_provider_idx" ON "PlaceProviderMatch"("provider");
CREATE INDEX "RawPlaceCandidate_provider_providerId_idx" ON "RawPlaceCandidate"("provider", "providerId");
CREATE INDEX "RawPlaceCandidate_normalizedName_idx" ON "RawPlaceCandidate"("normalizedName");
CREATE INDEX "RawPlaceCandidate_queryHash_idx" ON "RawPlaceCandidate"("queryHash");
CREATE UNIQUE INDEX "ProviderRequestCache_cacheKey_key" ON "ProviderRequestCache"("cacheKey");
CREATE INDEX "ProviderRequestCache_provider_idx" ON "ProviderRequestCache"("provider");
CREATE INDEX "ProviderRequestCache_expiresAt_idx" ON "ProviderRequestCache"("expiresAt");
CREATE INDEX "ProviderUsageLog_provider_purpose_idx" ON "ProviderUsageLog"("provider", "purpose");
CREATE INDEX "ProviderUsageLog_createdAt_idx" ON "ProviderUsageLog"("createdAt");
