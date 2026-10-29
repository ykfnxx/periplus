-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "JourneyVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "CoordinateSystem" AS ENUM ('WGS84', 'GCJ02', 'BD09', 'LOCAL');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'FILE');

-- CreateEnum
CREATE TYPE "AssetVisibility" AS ENUM ('PRIVATE', 'JOURNEY', 'PUBLIC');

-- CreateEnum
CREATE TYPE "EventAssetRole" AS ENUM ('COVER', 'GALLERY', 'RECEIPT', 'REFERENCE');

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
    "snapshotJson" TEXT NOT NULL,
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
    "actorUserId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "parentRevisionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyEvent" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "sourceUserId" TEXT NOT NULL,

    CONSTRAINT "JourneyEvent_pkey" PRIMARY KEY ("id")
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
    "role" "EventAssetRole" NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "EventAssetLink_pkey" PRIMARY KEY ("id")
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
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JourneyMember" (
    "journeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyMember_pkey" PRIMARY KEY ("journeyId","userId")
);

-- CreateTable
CREATE TABLE "JourneyInvitation" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyInvitation_pkey" PRIMARY KEY ("id")
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
CREATE INDEX "JourneyEvent_sourceUserId_idx" ON "JourneyEvent"("sourceUserId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEvent_journeyId_id_key" ON "JourneyEvent"("journeyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyEvent_journeyId_rank_key" ON "JourneyEvent"("journeyId", "rank");

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
CREATE INDEX "EventAssetLink_journeyId_eventId_idx" ON "EventAssetLink"("journeyId", "eventId");

-- CreateIndex
CREATE INDEX "EventAssetLink_assetId_idx" ON "EventAssetLink"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "EventAssetLink_eventId_assetId_role_key" ON "EventAssetLink"("eventId", "assetId", "role");

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
CREATE INDEX "ProviderUsageLog_requestId_idx" ON "ProviderUsageLog"("requestId");

-- CreateIndex
CREATE INDEX "ProviderUsageLog_createdAt_idx" ON "ProviderUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "JourneyMember_userId_journeyId_idx" ON "JourneyMember"("userId", "journeyId");

-- CreateIndex
CREATE UNIQUE INDEX "JourneyInvitation_tokenHash_key" ON "JourneyInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "JourneyInvitation_journeyId_createdAt_idx" ON "JourneyInvitation"("journeyId", "createdAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_journeyId_parentRevisionId_fkey" FOREIGN KEY ("journeyId", "parentRevisionId") REFERENCES "JourneyRevision"("journeyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_sourceUserId_fkey" FOREIGN KEY ("sourceUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_journeyId_eventId_fkey" FOREIGN KEY ("journeyId", "eventId") REFERENCES "JourneyEvent"("journeyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceAlias" ADD CONSTRAINT "PlaceAlias_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceSource" ADD CONSTRAINT "PlaceSource_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceProviderMatch" ADD CONSTRAINT "PlaceProviderMatch_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderUsageLog" ADD CONSTRAINT "ProviderUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyMember" ADD CONSTRAINT "JourneyMember_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyMember" ADD CONSTRAINT "JourneyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyInvitation" ADD CONSTRAINT "JourneyInvitation_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "Journey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyInvitation" ADD CONSTRAINT "JourneyInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The canonical head and every saved revision use the same Journey contract.
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_snapshot_identity"
CHECK ("revision" > 0 AND "snapshotJson"::jsonb->>'id' = "id" AND "snapshotJson"::jsonb->>'ownerId' = "ownerId" AND ("snapshotJson"::jsonb->>'revision')::int = "revision" AND jsonb_typeof("snapshotJson"::jsonb->'events') = 'array');
ALTER TABLE "JourneyRevision" ADD CONSTRAINT "JourneyRevision_snapshot_identity"
CHECK ("revision" > 0 AND "snapshotJson"::jsonb->>'id' = "journeyId" AND ("snapshotJson"::jsonb->>'revision')::int = "revision");
ALTER TABLE "Journey" ADD CONSTRAINT "Journey_head_revision_fkey" FOREIGN KEY ("id","revision") REFERENCES "JourneyRevision"("journeyId","revision") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "JourneyEvent" ADD CONSTRAINT "JourneyEvent_rank_nonnegative" CHECK ("rank" >= 0);
ALTER TABLE "EventAssetLink" ADD CONSTRAINT "EventAssetLink_rank_nonnegative" CHECK ("rank" >= 0);

CREATE FUNCTION periplus_revision_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Committed revisions are immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER "JourneyRevision_immutable" BEFORE UPDATE OR DELETE ON "JourneyRevision" FOR EACH ROW EXECUTE FUNCTION periplus_revision_immutable();

CREATE FUNCTION periplus_asset_reference() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE resource "Asset"%ROWTYPE; event_content jsonb;
BEGIN
 SELECT * INTO resource FROM "Asset" WHERE "id"=NEW."assetId" FOR UPDATE;
 IF NOT FOUND OR resource."deletedAt" IS NOT NULL THEN RAISE EXCEPTION 'Asset is missing or deleted' USING ERRCODE='23514'; END IF;
 SELECT item INTO event_content FROM "Journey" j, LATERAL jsonb_array_elements(j."snapshotJson"::jsonb->'events') item WHERE j."id"=NEW."journeyId" AND item->>'id'=NEW."eventId";
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(event_content->(CASE WHEN NEW."role"='RECEIPT' THEN 'receipts' ELSE 'photos' END)) item WHERE item->>'assetId'=NEW."assetId" AND item->'source'->>'userId'=resource."ownerId") THEN RAISE EXCEPTION 'Asset index must match the canonical Journey attachment' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "EventAssetLink_live_asset" BEFORE INSERT OR UPDATE ON "EventAssetLink" FOR EACH ROW EXECUTE FUNCTION periplus_asset_reference();
CREATE FUNCTION periplus_asset_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."deletedAt" IS NOT NULL AND OLD."deletedAt" IS NULL AND (EXISTS(SELECT 1 FROM "EventAssetLink" WHERE "assetId"=NEW."id")) THEN RAISE EXCEPTION 'Asset is attached to a Journey' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "Asset_reference_delete" BEFORE UPDATE OF "deletedAt" ON "Asset" FOR EACH ROW EXECUTE FUNCTION periplus_asset_delete();
CREATE FUNCTION periplus_event_index() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE content jsonb;
BEGIN
 SELECT "snapshotJson"::jsonb->'events'->NEW."rank" INTO content FROM "Journey" WHERE "id"=NEW."journeyId";
 IF content IS NULL OR content->>'id'<>NEW."id" OR content->'source'->>'userId'<>NEW."sourceUserId" THEN RAISE EXCEPTION 'Event index must match the canonical Journey order and source' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER "JourneyEvent_snapshot_index" BEFORE INSERT OR UPDATE ON "JourneyEvent" FOR EACH ROW EXECUTE FUNCTION periplus_event_index();
