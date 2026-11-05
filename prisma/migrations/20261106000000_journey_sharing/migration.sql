CREATE TABLE "JourneyShare" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "journeyId" TEXT NOT NULL UNIQUE REFERENCES "Journey"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "token" TEXT NOT NULL UNIQUE,
 "version" INTEGER NOT NULL,
 "sourceRevision" INTEGER NOT NULL,
 "includeCosts" BOOLEAN NOT NULL,
 "snapshotJson" TEXT NOT NULL,
 "publishedAt" TIMESTAMP(3) NOT NULL,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3),
 "lastMutationId" TEXT NOT NULL,
 "lastMutationSignature" TEXT NOT NULL
);
CREATE TABLE "JourneyShareAsset" (
 "shareId" TEXT NOT NULL REFERENCES "JourneyShare"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "assetId" TEXT NOT NULL REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 PRIMARY KEY ("shareId", "assetId")
);
CREATE INDEX "JourneyShareAsset_assetId_idx" ON "JourneyShareAsset"("assetId");
