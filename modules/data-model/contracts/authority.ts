export type TargetFieldAuthority = "CURRENT" | "TARGET" | "DERIVED"

export interface TargetFieldAuthorityRule {
  field: string
  authority: TargetFieldAuthority
  source: string
}

export const TARGET_FIELD_AUTHORITY = [
  {
    field: "Journey.revision",
    authority: "TARGET",
    source: "canonical transaction head",
  },
  {
    field: "JourneyEvent.parentSectionEventId",
    authority: "TARGET",
    source: "scope containment command",
  },
  {
    field: "JourneyEvent.placementStatus",
    authority: "TARGET",
    source: "place or unschedule command",
  },
  {
    field: "SectionEventDetail.localDate",
    authority: "TARGET",
    source: "DAY scheduling input",
  },
  {
    field: "SectionEvent.startAt/endAt/duration",
    authority: "DERIVED",
    source: "active child events in resolved projection",
  },
  {
    field: "JourneyEvent.planned values",
    authority: "TARGET",
    source: "planning commands",
  },
  {
    field: "JourneyEvent.actual values",
    authority: "TARGET",
    source: "execution confirmation commands",
  },
  {
    field: "JourneyEventLink.rank",
    authority: "TARGET",
    source: "scope-local ordering command",
  },
  {
    field: "JourneyBranchSelection.current",
    authority: "DERIVED",
    source: "latest append-only record without a superseder",
  },
  {
    field: "TransitEventDetail.activePlanningRunId",
    authority: "TARGET",
    source: "latest successful planning command",
  },
  {
    field: "TransitEventDetail.selectedPlanId",
    authority: "TARGET",
    source: "plan selection command within the active run",
  },
  {
    field: "ResolvedJourneyProjection.resolvedPosition",
    authority: "DERIVED",
    source: "current selected topology",
  },
  {
    field: "ResolvedJourneyProjection.locationOrdinal",
    authority: "DERIVED",
    source: "location events in resolved order",
  },
  {
    field: "WorkspaceSession.headGraph",
    authority: "TARGET",
    source: "persistent workspace command head",
  },
  {
    field: "WorkspaceDocument.accessState",
    authority: "DERIVED",
    source: "authenticated user, immutable owner, expiry",
  },
  {
    field: "WorkspaceDocument.draftState",
    authority: "DERIVED",
    source: "workspace/base revisions and pending persistence",
  },
  {
    field: "Travelogue body",
    authority: "DERIVED",
    source: "current topology plus confirmed actual facts",
  },
  {
    field: "Photo coordinate proximity",
    authority: "CURRENT",
    source: "legacy hint only; never Event ownership",
  },
] as const satisfies readonly TargetFieldAuthorityRule[]

export type TargetDeletionAction =
  | "RESTRICT"
  | "SOFT_DELETE"
  | "RETIRE"
  | "PRESERVE"
  | "EXPLICIT_PURGE"

export interface TargetDeletionRule {
  owner: string
  dependent: string
  ordinaryDelete: TargetDeletionAction
  hardPurge: TargetDeletionAction
}

export const TARGET_DELETION_MATRIX = [
  {
    owner: "User",
    dependent: "Journey",
    ordinaryDelete: "RESTRICT",
    hardPurge: "EXPLICIT_PURGE",
  },
  {
    owner: "Journey",
    dependent: "JourneyRevision",
    ordinaryDelete: "PRESERVE",
    hardPurge: "EXPLICIT_PURGE",
  },
  {
    owner: "Journey",
    dependent: "JourneyEvent",
    ordinaryDelete: "RETIRE",
    hardPurge: "EXPLICIT_PURGE",
  },
  {
    owner: "JourneyEvent",
    dependent: "JourneyEventLink",
    ordinaryDelete: "RETIRE",
    hardPurge: "EXPLICIT_PURGE",
  },
  {
    owner: "JourneyEvent",
    dependent: "TransitPlanningRun",
    ordinaryDelete: "PRESERVE",
    hardPurge: "EXPLICIT_PURGE",
  },
  {
    owner: "JourneyEvent",
    dependent: "EventAssetLink",
    ordinaryDelete: "RETIRE",
    hardPurge: "EXPLICIT_PURGE",
  },
  {
    owner: "JourneyEvent",
    dependent: "Asset",
    ordinaryDelete: "PRESERVE",
    hardPurge: "RESTRICT",
  },
  {
    owner: "SourcePack",
    dependent: "SourceDocument/SourceItem",
    ordinaryDelete: "SOFT_DELETE",
    hardPurge: "EXPLICIT_PURGE",
  },
  {
    owner: "WorkspaceSession",
    dependent: "WorkspaceRevision/Message/Suggestion/AgentRun",
    ordinaryDelete: "SOFT_DELETE",
    hardPurge: "EXPLICIT_PURGE",
  },
] as const satisfies readonly TargetDeletionRule[]

export const TARGET_IDEMPOTENCY_POLICY = {
  scope: "aggregate",
  sameKeySamePayload: "RETURN_ORIGINAL_RESULT",
  sameKeyDifferentPayload: "CONFLICT",
} as const

export type TargetRelationCardinality = "1:1" | "1:N" | "N:1"

export interface TargetModelRelation {
  from: string
  to: string
  cardinality: TargetRelationCardinality
  foreignKey: string
}

// This machine-readable relation catalog is the P0 ERD authority. P1 derives
// Prisma relations from it instead of maintaining a separate diagram document.
export const TARGET_MODEL_RELATIONS = [
  { from: "Session", to: "User", cardinality: "N:1", foreignKey: "userId" },
  { from: "Journey", to: "User", cardinality: "N:1", foreignKey: "ownerId" },
  {
    from: "JourneyRevision",
    to: "Journey",
    cardinality: "N:1",
    foreignKey: "journeyId",
  },
  {
    from: "JourneyEvent",
    to: "Journey",
    cardinality: "N:1",
    foreignKey: "journeyId",
  },
  {
    from: "JourneyEvent",
    to: "JourneyEvent",
    cardinality: "N:1",
    foreignKey: "parentSectionEventId",
  },
  {
    from: "JourneyEventLink",
    to: "Journey",
    cardinality: "N:1",
    foreignKey: "journeyId",
  },
  {
    from: "JourneyEventLink",
    to: "JourneyEvent",
    cardinality: "N:1",
    foreignKey: "fromEventId/toEventId",
  },
  {
    from: "JourneyEventReplacement",
    to: "JourneyEvent",
    cardinality: "1:1",
    foreignKey: "predecessorEventId/successorEventId",
  },
  {
    from: "JourneyBranchSelection",
    to: "JourneyEventLink",
    cardinality: "N:1",
    foreignKey: "selectedLinkId",
  },
  {
    from: "JourneyBranchSelection",
    to: "JourneyRevision",
    cardinality: "N:1",
    foreignKey: "journeyRevision",
  },
  {
    from: "TypedEventDetail",
    to: "JourneyEvent",
    cardinality: "1:1",
    foreignKey: "eventId",
  },
  {
    from: "TransitPlanningRun",
    to: "JourneyEvent",
    cardinality: "N:1",
    foreignKey: "transitEventId",
  },
  {
    from: "TransitPlan",
    to: "TransitPlanningRun",
    cardinality: "N:1",
    foreignKey: "planningRunId",
  },
  {
    from: "TransitSegment",
    to: "TransitPlan",
    cardinality: "N:1",
    foreignKey: "transitPlanId",
  },
  {
    from: "WorkspaceSession",
    to: "User",
    cardinality: "N:1",
    foreignKey: "ownerId",
  },
  {
    from: "WorkspaceSession",
    to: "Journey",
    cardinality: "N:1",
    foreignKey: "sourceJourneyId",
  },
  {
    from: "WorkspaceRevision",
    to: "WorkspaceSession",
    cardinality: "N:1",
    foreignKey: "workspaceId",
  },
  {
    from: "WorkspaceMessage",
    to: "WorkspaceSession",
    cardinality: "N:1",
    foreignKey: "workspaceId",
  },
  {
    from: "WorkspaceSuggestion",
    to: "WorkspaceSession",
    cardinality: "N:1",
    foreignKey: "workspaceId",
  },
  {
    from: "WorkspaceAgentRun",
    to: "WorkspaceSession",
    cardinality: "N:1",
    foreignKey: "workspaceId",
  },
  { from: "Asset", to: "User", cardinality: "N:1", foreignKey: "ownerId" },
  {
    from: "EventAssetLink",
    to: "JourneyEvent",
    cardinality: "N:1",
    foreignKey: "eventId",
  },
  {
    from: "EventAssetLink",
    to: "Asset",
    cardinality: "N:1",
    foreignKey: "assetId",
  },
  {
    from: "EventObservation",
    to: "JourneyEvent",
    cardinality: "N:1",
    foreignKey: "eventId",
  },
  {
    from: "SourcePack",
    to: "User",
    cardinality: "N:1",
    foreignKey: "ownerId",
  },
  {
    from: "SourceDocument",
    to: "SourcePack",
    cardinality: "N:1",
    foreignKey: "sourcePackId",
  },
  {
    from: "SourceDocument",
    to: "Asset",
    cardinality: "N:1",
    foreignKey: "assetId",
  },
  {
    from: "SourceItem",
    to: "SourceDocument",
    cardinality: "N:1",
    foreignKey: "sourceDocumentId",
  },
  {
    from: "EventSourceLink",
    to: "JourneyEvent",
    cardinality: "N:1",
    foreignKey: "eventId",
  },
  {
    from: "EventSourceLink",
    to: "SourceItem",
    cardinality: "N:1",
    foreignKey: "sourceItemId",
  },
] as const satisfies readonly TargetModelRelation[]
