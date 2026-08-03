ALTER TABLE "StayEventDetail" ADD COLUMN "hotelOfferSnapshotJson" TEXT;

ALTER TABLE "WorkspaceMessage" ADD COLUMN "blocksJson" TEXT NOT NULL DEFAULT '[]';
