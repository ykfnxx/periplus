// @vitest-environment node
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Client, types } from "pg"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { periplusServerConfig } from "@/config/periplus.server"
const migrationSql = readFileSync(
  resolve("prisma/migrations/20261023000000_postgresql_baseline/migration.sql"),
  "utf8"
)
const NOW = "2026-08-02T00:00:00.000Z"
const graph = (id: string, ownerId: string, revision: number) =>
  JSON.stringify({ id, ownerId, revision })
types.setTypeParser(20, Number)
let client: Client
let schema: string
async function execute(sql: string) {
  await client.query(sql)
}
async function queryRows<T>(sql: string): Promise<T[]> {
  return (await client.query(sql)).rows as T[]
}
async function expectSqlFailure(sql: string, message?: RegExp) {
  let failure: unknown
  try {
    await client.query(sql)
  } catch (error) {
    failure = error
  }
  expect(failure, sql).toBeDefined()
  if (message) {
    const error = failure as {
      code: string
      message: string
    }
    const category =
      (message.source.includes("UNIQUE") && error.code === "23505") ||
      (message.source.includes("FOREIGN KEY") && error.code === "23503") ||
      (message.source.includes("CHECK") &&
        ["23514", "22P02"].includes(error.code))
    expect(category || message.test(error.message), error.message).toBe(true)
  }
}
async function seedBaseDatabase() {
  await execute(`
    INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    VALUES
      ('owner', 'Owner', 'owner@example.test', true, '${NOW}', '${NOW}'),
      ('other', 'Other', 'other@example.test', true, '${NOW}', '${NOW}');

    INSERT INTO "Journey" ("id", "ownerId", "revision", "status", "visibility", "title", "createdAt", "updatedAt")
    VALUES
      ('j1', 'owner', 1, 'DRAFT', 'PRIVATE', 'Journey One', '${NOW}', '${NOW}'),
      ('j2', 'other', 1, 'DRAFT', 'PRIVATE', 'Journey Two', '${NOW}', '${NOW}');

    INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "createdAt")
    VALUES
      ('j1-r1', 'j1', 1, 'create', '${graph("j1", "owner", 1)}', '[]', '[]', 'SYSTEM', 'j1-r1-key', '${NOW}'),
      ('j2-r1', 'j2', 1, 'create', '${graph("j2", "other", 1)}', '[]', '[]', 'SYSTEM', 'j2-r1-key', '${NOW}');

    INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
    VALUES ('section', 'j1', NULL, 'SECTION', NULL, 'SCHEDULED', 'ORIGINAL', 'Section', 1, '${NOW}', '${NOW}');

    INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
    VALUES
      ('a', 'j1', 'section', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'A', 1, '${NOW}', '${NOW}'),
      ('b', 'j1', 'section', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'B', 1, '${NOW}', '${NOW}'),
      ('c', 'j1', 'section', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'C', 1, '${NOW}', '${NOW}'),
      ('transit', 'j1', 'section', 'TRANSIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Transit', 1, '${NOW}', '${NOW}'),
      ('unscheduled', 'j1', NULL, 'VISIT', 'PLANNED', 'UNSCHEDULED', 'ORIGINAL', 'Later', 1, '${NOW}', '${NOW}');

    INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
    VALUES ('other-event', 'j2', NULL, 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Other', 1, '${NOW}', '${NOW}');
  `)
}
beforeEach(async () => {
  schema = "periplus_schema_" + randomUUID().replaceAll("-", "")
  client = new Client({ connectionString: periplusServerConfig.database.url })
  await client.connect()
  await client.query('CREATE SCHEMA "' + schema + '"')
  await client.query('SET search_path TO "' + schema + '"')
  await execute(migrationSql)
  await seedBaseDatabase()
}, 30000)
afterEach(async () => {
  if (client) {
    await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE')
    await client.end()
  }
})
describe("PostgreSQL schema and database invariants", () => {
  it("rejects cross-Journey composite foreign keys", async () => {
    await expectSqlFailure(
      `INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('cross-link', 'j1', 'a', 'other-event', 'MAIN', 1, 1, '${NOW}', '${NOW}');`,
      /FOREIGN KEY|same scope/
    )
    await expectSqlFailure(
      `INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('unscheduled-link', 'j1', 'a', 'unscheduled', 'MAIN', 1, 1, '${NOW}', '${NOW}');`,
      /active, scheduled/
    )
    await expectSqlFailure(
      `INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('bad-child', 'j1', 'a', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Bad child', 1, '${NOW}', '${NOW}');`,
      /active SECTION|only non-SECTION Events/
    )
  })
  it("enforces replacement scope and acyclicity", async () => {
    await execute(`
      INSERT INTO "JourneyEventReplacement" ("id", "journeyId", "predecessorEventId", "successorEventId", "revision", "reason", "createdAt")
      VALUES ('replacement-1', 'j1', 'a', 'b', 1, 'replace A', '${NOW}');
    `)
    await expectSqlFailure(
      `INSERT INTO "JourneyEventReplacement" ("id", "journeyId", "predecessorEventId", "successorEventId", "revision", "reason", "createdAt")
       VALUES ('replacement-cycle', 'j1', 'b', 'a', 1, 'cycle', '${NOW}');`,
      /cycle/
    )
    await expectSqlFailure(
      `INSERT INTO "JourneyEventReplacement" ("id", "journeyId", "predecessorEventId", "successorEventId", "revision", "reason", "createdAt")
       VALUES ('replacement-scope', 'j1', 'c', 'unscheduled', 1, 'cross scope', '${NOW}');`,
      /same scope/
    )
    await expectSqlFailure(
      `UPDATE "JourneyEventReplacement" SET "reason" = 'rewrite' WHERE "id" = 'replacement-1';`,
      /append-only/
    )
    await expectSqlFailure(
      `DELETE FROM "JourneyEventReplacement" WHERE "id" = 'replacement-1';`,
      /while their Journey exists/
    )
    await execute(
      `UPDATE "Journey" SET "deletedAt" = '${NOW}' WHERE "id" = 'j1';`
    )
    await expectSqlFailure(
      `DELETE FROM "JourneyEventReplacement" WHERE "id" = 'replacement-1';`,
      /while their Journey exists/
    )
    await execute(`
      UPDATE "Journey" SET "deletedAt" = NULL WHERE "id" = 'j1';
    `)
    expect(
      (
        await queryRows<{
          count: number
        }>(
          `SELECT count(*) AS "count" FROM "JourneyEventReplacement" WHERE "id" = 'replacement-1'`
        )
      )[0]?.count
    ).toBe(1)
  })
  it("enforces revision, idempotency, and linear-parent uniqueness", async () => {
    await expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "createdAt")
       VALUES ('duplicate-r1', 'j1', 1, 'duplicate', '${graph("j1", "owner", 1)}', '[]', '[]', 'SYSTEM', 'other-key', '${NOW}');`,
      /UNIQUE/
    )
    await expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
       VALUES ('duplicate-key', 'j1', 2, 'duplicate', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r1-key', 'j1-r1', '${NOW}');`,
      /UNIQUE/
    )
    await expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
       VALUES ('j1-r3', 'j1', 3, 'skip', '${graph("j1", "owner", 3)}', '[]', '[]', 'SYSTEM', 'j1-r3-key', 'j1-r1', '${NOW}');`,
      /immediately preceding/
    )
    await expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
       VALUES ('bad-snapshot', 'j1', 2, 'bad snapshot', '{"id":"j1"}', '[]', '[]', 'SYSTEM', 'bad-snapshot-key', 'j1-r1', '${NOW}');`,
      /CHECK|preserve Journey ownership/
    )
    await expectSqlFailure(
      `UPDATE "JourneyRevision" SET "operation" = 'rewrite' WHERE "id" = 'j1-r1';`,
      /append-only/
    )
    await expectSqlFailure(
      `UPDATE "Journey" SET "revision" = 2 WHERE "id" = 'j1';`,
      /persisted JourneyRevision/
    )
    await execute(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r2', 'j1', 2, 'advance', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r2-key', 'j1-r1', '${NOW}');
      UPDATE "Journey" SET "revision" = 2 WHERE "id" = 'j1';
    `)
    await expectSqlFailure(
      `DELETE FROM "JourneyRevision" WHERE "id" = 'j1-r2';`,
      /while their Journey exists/
    )
    await execute(
      `UPDATE "Journey" SET "deletedAt" = '${NOW}' WHERE "id" = 'j1';`
    )
    await expectSqlFailure(
      `DELETE FROM "JourneyRevision" WHERE "id" = 'j1-r2';`,
      /while their Journey exists/
    )
    await execute(`UPDATE "Journey" SET "deletedAt" = NULL WHERE "id" = 'j1';`)
    expect(
      (
        await queryRows<{
          count: number
        }>(`SELECT count(*) AS "count" FROM "JourneyRevision" revision
         JOIN "Journey" journey
           ON journey."id" = revision."journeyId"
          AND journey."revision" = revision."revision"
         WHERE journey."id" = 'j1'`)
      )[0]?.count
    ).toBe(1)
  })
  it("enforces Event checks and typed-detail triggers", async () => {
    await expectSqlFailure(
      `INSERT INTO "JourneyEvent" ("id", "journeyId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('bad-section', 'j1', 'SECTION', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Bad', 1, '${NOW}', '${NOW}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `INSERT INTO "VisitEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem")
       VALUES ('section', 30, 120, 'GCJ02');`,
      /requires a VISIT/
    )
    await expectSqlFailure(
      `INSERT INTO "SectionEventDetail" ("eventId", "kind") VALUES ('section', 'DAY');`,
      /CHECK/
    )
    await expectSqlFailure(
      `INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('nested-section', 'j1', 'section', 'SECTION', 'SCHEDULED', 'ORIGINAL', 'Nested', 1, '${NOW}', '${NOW}');`,
      /only non-SECTION Events/
    )
    await expectSqlFailure(
      `UPDATE "JourneyEvent" SET "type" = 'MEAL' WHERE "id" = 'a';
       INSERT INTO "VisitEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem") VALUES ('a', 30, 120, 'GCJ02');`,
      /requires a VISIT/
    )
    await execute(`
      INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
      VALUES
        ('detail-visit', 'j1', 'section', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Visit detail', 1, '${NOW}', '${NOW}'),
        ('detail-stay', 'j1', 'section', 'STAY', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Stay detail', 1, '${NOW}', '${NOW}'),
        ('detail-meal', 'j1', 'section', 'MEAL', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Meal detail', 1, '${NOW}', '${NOW}'),
        ('detail-activity', 'j1', 'section', 'ACTIVITY', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Activity detail', 1, '${NOW}', '${NOW}'),
        ('detail-note', 'j1', 'section', 'NOTE', NULL, 'SCHEDULED', 'ORIGINAL', 'Note detail', 1, '${NOW}', '${NOW}');
      INSERT INTO "SectionEventDetail" ("eventId", "kind", "timezone") VALUES ('section', 'CITY', 'Asia/Shanghai');
      INSERT INTO "VisitEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem") VALUES ('detail-visit', 30, 120, 'GCJ02');
      INSERT INTO "StayEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem") VALUES ('detail-stay', 30, 120, 'GCJ02');
      INSERT INTO "MealEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem") VALUES ('detail-meal', 30, 120, 'GCJ02');
      INSERT INTO "ActivityEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem") VALUES ('detail-activity', 30, 120, 'GCJ02');
      INSERT INTO "TransitEventDetail" ("eventId", "transportMode", "routeState") VALUES ('transit', 'WALK', 'EMPTY');
      INSERT INTO "NoteEventDetail" ("eventId", "body") VALUES ('detail-note', 'Note');
    `)
    for (const [table, eventId] of [
      ["SectionEventDetail", "section"],
      ["VisitEventDetail", "detail-visit"],
      ["StayEventDetail", "detail-stay"],
      ["MealEventDetail", "detail-meal"],
      ["ActivityEventDetail", "detail-activity"],
      ["TransitEventDetail", "transit"],
      ["NoteEventDetail", "detail-note"],
    ] as const) {
      await expectSqlFailure(
        `DELETE FROM "${table}" WHERE "eventId" = '${eventId}';`,
        /only be deleted by deleting its Event/
      )
    }
  })
  it("preserves retired Links while enforcing one active MAIN in and out", async () => {
    await execute(`
      INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
      VALUES ('link-1', 'j1', 'a', 'b', 'MAIN', 1024, 1, '${NOW}', '${NOW}');
    `)
    await expectSqlFailure(
      `INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('link-2', 'j1', 'a', 'c', 'MAIN', 2048, 1, '${NOW}', '${NOW}');`,
      /UNIQUE/
    )
    await execute(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r2', 'j1', 2, 'reroute', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r2-key', 'j1-r1', '${NOW}');
      UPDATE "Journey" SET "revision" = 2 WHERE "id" = 'j1';
      UPDATE "JourneyEventLink" SET "retiredRevision" = 2 WHERE "id" = 'link-1';
      INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
      VALUES ('link-2', 'j1', 'a', 'c', 'MAIN', 2048, 2, '${NOW}', '${NOW}');
    `)
    expect(
      (
        await queryRows<{
          count: number
        }>(
          `SELECT count(*) AS "count" FROM "JourneyEventLink" WHERE "journeyId" = 'j1'`
        )
      )[0]?.count
    ).toBe(2)
  })
  it("enforces Transit run finalization and composite Plan selection", async () => {
    await execute(`
      INSERT INTO "TransitEventDetail" ("eventId", "transportMode", "routeState") VALUES ('transit', 'TAXI', 'EMPTY');
      INSERT INTO "TransitPlanningRun" ("id", "transitEventId", "requestFingerprint", "provider", "status", "calculatedAt", "createdAt", "updatedAt")
      VALUES ('run-1', 'transit', 'fingerprint-1', 'test', 'PLANNING', '${NOW}', '${NOW}', '${NOW}');
    `)
    await expectSqlFailure(
      `UPDATE "TransitPlanningRun" SET "status" = 'READY' WHERE "id" = 'run-1';`,
      /requires Plans/
    )
    await execute(`
      INSERT INTO "TransitPlan" ("id", "planningRunId", "transitEventId", "provider", "rank", "label", "strategy", "distanceMeters", "durationSeconds", "trafficBasis", "calculatedAt", "createdAt", "updatedAt")
      VALUES ('plan-1', 'run-1', 'transit', 'test', 0, 'One', 'RECOMMENDED', 100, 60, 'TYPICAL', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "TransitSegment" ("id", "transitPlanId", "order", "mode", "coordinateSystem", "geometryKind", "positionsJson")
      VALUES ('segment-1', 'plan-1', 0, 'WALK', 'WGS84', 'NONE', '[]');
      UPDATE "TransitPlanningRun" SET "status" = 'READY' WHERE "id" = 'run-1';
      INSERT INTO "TransitPlanningRun" ("id", "transitEventId", "requestFingerprint", "provider", "status", "calculatedAt", "createdAt", "updatedAt")
      VALUES ('run-2', 'transit', 'fingerprint-2', 'test', 'PLANNING', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "TransitPlan" ("id", "planningRunId", "transitEventId", "provider", "rank", "label", "strategy", "distanceMeters", "durationSeconds", "trafficBasis", "calculatedAt", "createdAt", "updatedAt")
      VALUES ('plan-2', 'run-2', 'transit', 'test', 0, 'Two', 'LOW_COST', 100, 60, 'TYPICAL', '${NOW}', '${NOW}', '${NOW}');
    `)
    await expectSqlFailure(
      `UPDATE "TransitEventDetail" SET "routeState" = 'READY', "activePlanningRunId" = 'run-1', "selectedPlanId" = 'plan-2' WHERE "eventId" = 'transit';`,
      /FOREIGN KEY/
    )
    await expectSqlFailure(
      `UPDATE "TransitEventDetail" SET "plannedFromEventId" = 'unscheduled' WHERE "eventId" = 'transit';`,
      /Transit endpoints/
    )
    await expectSqlFailure(
      `UPDATE "TransitPlanningRun" SET "status" = 'PLANNING' WHERE "id" = 'run-1';`,
      /READY run requires Plans|FAILED planning run|CHECK|finalized|run requires Plans/
    )
    await expectSqlFailure(
      `INSERT INTO "TransitPlan" ("id", "planningRunId", "transitEventId", "provider", "rank", "label", "strategy", "distanceMeters", "durationSeconds", "trafficBasis", "calculatedAt", "createdAt", "updatedAt")
       VALUES ('late-plan', 'run-1', 'transit', 'test', 1, 'Late', 'NONE', 0, 0, 'UNKNOWN', '${NOW}', '${NOW}', '${NOW}');`,
      /finalized planning run/
    )
    await expectSqlFailure(
      `INSERT INTO "TransitSegment" ("id", "transitPlanId", "order", "mode", "coordinateSystem", "geometryKind", "positionsJson")
       VALUES ('late-segment', 'plan-1', 0, 'WALK', 'WGS84', 'NONE', '[]');`,
      /finalized planning run/
    )
    await expectSqlFailure(
      `INSERT INTO "TransitSegment" ("id", "transitPlanId", "order", "mode", "coordinateSystem", "geometryKind", "positionsJson")
       VALUES ('bad-geometry', 'plan-2', 0, 'WALK', 'WGS84', 'NONE', '{}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `DELETE FROM "TransitSegment" WHERE "id" = 'segment-1';`,
      /cannot be deleted/
    )
    await expectSqlFailure(
      `DELETE FROM "TransitPlan" WHERE "id" = 'plan-1';`,
      /cannot be deleted/
    )
    await expectSqlFailure(
      `DELETE FROM "TransitPlanningRun" WHERE "id" = 'run-1';`,
      /purging their Transit Event/
    )
    await expectSqlFailure(
      `INSERT INTO "TransitPlanningRun" ("id", "transitEventId", "requestFingerprint", "provider", "status", "errorCode", "calculatedAt", "createdAt", "updatedAt")
       VALUES ('failed-run', 'transit', 'fingerprint-failed', 'test', 'FAILED', 'NO_ROUTE', '${NOW}', '${NOW}', '${NOW}');
       INSERT INTO "TransitPlan" ("id", "planningRunId", "transitEventId", "provider", "rank", "label", "strategy", "distanceMeters", "durationSeconds", "trafficBasis", "calculatedAt", "createdAt", "updatedAt")
       VALUES ('failed-plan', 'failed-run', 'transit', 'test', 0, 'Bad', 'NONE', 0, 0, 'UNKNOWN', '${NOW}', '${NOW}', '${NOW}');`,
      /finalized planning run/
    )
    await expectSqlFailure(
      `DELETE FROM "TransitEventDetail" WHERE "eventId" = 'transit';`,
      /only be deleted by deleting its Event/
    )
    await execute(`DELETE FROM "JourneyEvent" WHERE "id" = 'transit';`)
    expect(
      (
        await queryRows<{
          eventCount: number
          detailCount: number
          runCount: number
        }>(`SELECT
           (SELECT count(*) FROM "JourneyEvent" WHERE "id" = 'transit') AS "eventCount",
           (SELECT count(*) FROM "TransitEventDetail" WHERE "eventId" = 'transit') AS "detailCount",
           (SELECT count(*) FROM "TransitPlanningRun" WHERE "transitEventId" = 'transit') AS "runCount"`)
      )[0]
    ).toEqual({ eventCount: 0, detailCount: 0, runCount: 0 })
  })
  it("enforces append-only branch selection supersession", async () => {
    await execute(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r2', 'j1', 2, 'branch', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r2-key', 'j1-r1', '${NOW}');
      INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "branchKey", "rank", "introducedRevision", "createdAt", "updatedAt")
      VALUES
        ('branch-a', 'j1', 'a', 'b', 'ALTERNATIVE', 'fork-1', 1024, 1, '${NOW}', '${NOW}'),
        ('branch-b', 'j1', 'a', 'c', 'ALTERNATIVE', 'fork-1', 2048, 1, '${NOW}', '${NOW}');
      INSERT INTO "JourneyBranchSelection" ("id", "journeyId", "forkEventId", "selectedLinkId", "journeyRevision", "actorKind", "actorUserId", "createdAt")
      VALUES ('selection-1', 'j1', 'a', 'branch-a', 1, 'USER', 'owner', '${NOW}');
    `)
    await expectSqlFailure(
      `INSERT INTO "JourneyBranchSelection" ("id", "journeyId", "forkEventId", "selectedLinkId", "journeyRevision", "actorKind", "actorUserId", "createdAt")
       VALUES ('selection-2', 'j1', 'a', 'branch-b', 2, 'USER', 'owner', '2026-08-02T00:01:00.000Z');`,
      /supersede the current/
    )
    await expectSqlFailure(
      `UPDATE "JourneyEventLink" SET "retiredRevision" = 2 WHERE "id" = 'branch-a';`,
      /current branch selection/
    )
    await execute(`
      INSERT INTO "JourneyBranchSelection" ("id", "journeyId", "forkEventId", "selectedLinkId", "journeyRevision", "supersedesId", "actorKind", "actorUserId", "createdAt")
      VALUES ('selection-2', 'j1', 'a', 'branch-b', 2, 'selection-1', 'USER', 'owner', '2026-08-02T00:01:00.000Z');
      UPDATE "JourneyEventLink" SET "retiredRevision" = 2 WHERE "id" = 'branch-a';
    `)
    await execute(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r3', 'j1', 3, 'retire fork', '${graph("j1", "owner", 3)}', '[]', '[]', 'SYSTEM', 'j1-r3-key', 'j1-r2', '2026-08-02T00:02:00.000Z');
      INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
      VALUES ('selection-parking', 'j1', 'section', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Selection parking', 3, '${NOW}', '${NOW}');
      UPDATE "JourneyEventLink" SET "fromEventId" = 'selection-parking' WHERE "id" = 'branch-b';
      UPDATE "JourneyEvent" SET "retiredRevision" = 3 WHERE "id" = 'a';
      UPDATE "JourneyEventLink" SET "retiredRevision" = 3 WHERE "id" = 'branch-b';
    `)
    await expectSqlFailure(
      `UPDATE "JourneyBranchSelection" SET "reason" = 'rewrite' WHERE "id" = 'selection-1';`,
      /append-only/
    )
    await expectSqlFailure(
      `DELETE FROM "JourneyBranchSelection" WHERE "id" = 'selection-2';`,
      /while their Journey exists/
    )
    await execute(
      `UPDATE "Journey" SET "deletedAt" = '${NOW}' WHERE "id" = 'j1';`
    )
    await expectSqlFailure(
      `DELETE FROM "JourneyBranchSelection" WHERE "id" = 'selection-2';`,
      /while their Journey exists/
    )
    await execute(`UPDATE "Journey" SET "deletedAt" = NULL WHERE "id" = 'j1';`)
  })
  it("pins Asset and Source identities through policy triggers", async () => {
    await execute(`
      INSERT INTO "Asset" ("id", "ownerId", "kind", "visibility", "storageKey", "mimeType", "sizeBytes", "checksum", "createdAt")
      VALUES
        ('asset-1', 'owner', 'IMAGE', 'JOURNEY', 'asset/1', 'image/jpeg', 10, 'asset-checksum', '${NOW}'),
        ('asset-2', 'owner', 'IMAGE', 'JOURNEY', 'asset/2', 'image/jpeg', 10, 'asset-2-checksum', '${NOW}'),
        ('source-asset', 'owner', 'FILE', 'PRIVATE', 'source/1', 'application/pdf', 20, 'source-checksum', '${NOW}');
    `)
    await expectSqlFailure(
      `INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
       VALUES ('bad-asset-link', 'j1', 'a', 'asset-1', 'wrong', 'GALLERY', 0, 'JOURNEY', 1, '${NOW}');`,
      /pin an authorized Asset/
    )
    await expectSqlFailure(
      `INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
       VALUES ('broad-asset-link', 'j1', 'a', 'asset-1', 'asset-checksum', 'GALLERY', 0, 'PUBLIC', 1, '${NOW}');`,
      /broadening visibility/
    )
    await execute(`
      INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
      VALUES ('asset-link', 'j1', 'a', 'asset-1', 'asset-checksum', 'GALLERY', 0, 'JOURNEY', 1, '${NOW}');
    `)
    await expectSqlFailure(
      `UPDATE "EventAssetLink" SET "locationJson" = 'not-json' WHERE "id" = 'asset-link';`,
      /JSON|EventAssetLink_location_check/i
    )
    await execute(
      `UPDATE "EventAssetLink" SET "locationJson" = '{"name":"湖边","address":null,"coordinates":null}' WHERE "id" = 'asset-link';`
    )
    expect(
      await queryRows<{
        name: string
      }>(
        `SELECT ("locationJson"::jsonb ->> 'name') AS "name" FROM "EventAssetLink" WHERE "id" = 'asset-link'`
      )
    ).toEqual([{ name: "湖边" }])
    await expectSqlFailure(
      `INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
       VALUES ('duplicate-asset-rank', 'j1', 'a', 'asset-2', 'asset-2-checksum', 'GALLERY', 0, 'JOURNEY', 1, '${NOW}');`,
      /UNIQUE/
    )
    await expectSqlFailure(
      `UPDATE "Asset" SET "checksum" = 'changed' WHERE "id" = 'asset-1';`,
      /invalidate an active Event/
    )
    await execute(`
      INSERT INTO "SourcePack" ("id", "ownerId", "title", "visibility", "status", "createdAt", "updatedAt")
      VALUES ('pack-1', 'owner', 'Pack', 'PRIVATE', 'READY', '${NOW}', '${NOW}');
      INSERT INTO "SourceDocument" ("id", "sourcePackId", "assetId", "checksum", "title", "processingStatus", "createdAt", "updatedAt")
      VALUES ('document-1', 'pack-1', 'source-asset', 'source-checksum', 'Document', 'READY', '${NOW}', '${NOW}');
      INSERT INTO "SourceItem" ("id", "sourceDocumentId", "kind", "title", "sourceOrder", "confidence", "resolutionState", "createdAt", "updatedAt")
      VALUES
        ('item-1', 'document-1', 'PLACE', 'Place', 0, 0.8, 'UNRESOLVED', '${NOW}', '${NOW}'),
        ('item-2', 'document-1', 'NOTE', 'Note', 1, 0.8, 'UNRESOLVED', '${NOW}', '${NOW}');
    `)
    await expectSqlFailure(
      `INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
       VALUES ('bad-source-link', 'j1', 'a', 'item-1', 'document-1', 'wrong', 'EVIDENCE', 0.8, 0, false, 1, '${NOW}');`,
      /pin its SourceItem document/
    )
    await expectSqlFailure(
      `INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
       VALUES ('unredacted-source-link', 'j1', 'a', 'item-1', 'document-1', 'source-checksum', 'EVIDENCE', 0.8, 0, true, 1, '${NOW}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `UPDATE "Asset" SET "checksum" = 'changed' WHERE "id" = 'source-asset';`,
      /SourceDocument/
    )
    await execute(`
      INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
      VALUES ('source-link', 'j1', 'a', 'item-1', 'document-1', 'source-checksum', 'EVIDENCE', 0.8, 0, false, 1, '${NOW}');
    `)
    await expectSqlFailure(
      `INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
       VALUES ('duplicate-source-rank', 'j1', 'a', 'item-2', 'document-1', 'source-checksum', 'EVIDENCE', 0.8, 0, false, 1, '${NOW}');`,
      /UNIQUE/
    )
  })
  it("enforces Observation and Workspace append-only lineage", async () => {
    await expectSqlFailure(
      `INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "lastAccessAt", "createdAt", "updatedAt")
       VALUES ('bad-workspace', 'owner', 'j1', 1, 0, 'ACTIVE', '{}', '${NOW}', '${NOW}', '${NOW}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "lastAccessAt", "createdAt", "updatedAt")
       VALUES ('forged-head-workspace', 'owner', 'j1', 1, 99, 'ACTIVE', '${graph("j1", "owner", 1)}', '${NOW}', '${NOW}', '${NOW}');`,
      /start at head revision 0/
    )
    await expectSqlFailure(
      `INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "lastAccessAt", "createdAt", "updatedAt")
       VALUES ('wrong-owner-workspace', 'owner', 'j2', 1, 0, 'ACTIVE', '${graph("j2", "owner", 1)}', '${NOW}', '${NOW}', '${NOW}');`,
      /must belong to its owner/
    )
    await execute(`
      INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "body", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
      VALUES ('observation-1', 'a', 'NOTE', 'ACTUAL', 'First', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');
      INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "body", "observedAt", "actorKind", "actorUserId", "supersedesId", "visibility", "createdAt")
      VALUES ('observation-2', 'a', 'NOTE', 'ACTUAL', 'Second', '2026-08-02T00:01:00.000Z', 'USER', 'owner', 'observation-1', 'JOURNEY', '2026-08-02T00:01:00.000Z');
      INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "lastAccessAt", "createdAt", "updatedAt")
      VALUES ('workspace-1', 'owner', 'j1', 1, 0, 'ACTIVE', '${graph("j1", "owner", 1)}', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
      VALUES ('workspace-r1', 'workspace-1', 1, 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r1-key', '${NOW}');
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 1 WHERE "id" = 'workspace-1';
      INSERT INTO "WorkspaceAgentRun" ("id", "workspaceId", "status", "runtimeOwnerId", "heartbeatAt", "leaseExpiresAt", "startedAt", "createdAt", "updatedAt")
      VALUES ('agent-run-1', 'workspace-1', 'RUNNING', 'runtime-1', '${NOW}', '2026-08-02T00:01:00.000Z', '${NOW}', '${NOW}', '${NOW}');
    `)
    await expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "body", "observedAt", "actorKind", "actorUserId", "supersedesId", "visibility", "createdAt")
       VALUES ('bad-observation', 'a', 'FACT', 'ACTUAL', 'Wrong kind', '2026-08-02T00:02:00.000Z', 'USER', 'owner', 'observation-2', 'JOURNEY', '2026-08-02T00:02:00.000Z');`,
      /same-kind Event chain/
    )
    await expectSqlFailure(
      `UPDATE "EventObservation" SET "body" = 'Rewrite' WHERE "id" = 'observation-1';`,
      /append-only/
    )
    await expectSqlFailure(
      `DELETE FROM "EventObservation" WHERE "id" = 'observation-2';`,
      /purging their Event/
    )
    await expectSqlFailure(
      `DELETE FROM "WorkspaceRevision" WHERE "id" = 'workspace-r1';`,
      /while their Workspace exists/
    )
    await expectSqlFailure(
      `UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 0 WHERE "id" = 'workspace-1';`,
      /advance by one/
    )
    await expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "valueJson", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-rating', 'a', 'RATING', 'ACTUAL', '6', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-note', 'a', 'NOTE', 'ACTUAL', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "valueJson", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-cost', 'a', 'COST', 'ACTUAL', '{}', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "valueJson", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-weather', 'a', 'WEATHER', 'ACTUAL', '{"temperatureCelsius":20}', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    await expectSqlFailure(
      `UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 2 WHERE "id" = 'workspace-1';`,
      /persisted WorkspaceRevision/
    )
    await expectSqlFailure(
      `INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
       VALUES ('workspace-wrong-owner', 'workspace-1', 2, 'workspace-r1', 'workspace.refresh', '${graph("j1", "other", 1)}', '${graph("j1", "other", 1)}', '[]', '[]', 'USER', 'owner', 'wrong-owner-key', '${NOW}');`,
      /preserve Workspace Journey identity and owner/
    )
    await expectSqlFailure(
      `UPDATE "WorkspaceRevision" SET "commandName" = 'workspace.replay' WHERE "id" = 'workspace-r1';`,
      /append-only/
    )
    await expectSqlFailure(
      `INSERT INTO "ProviderUsageLog" ("id", "provider", "purpose", "status", "agentRunId", "createdAt")
       VALUES ('bad-provider-usage', 'test', 'route', 'ok', 'agent-run-1', '${NOW}');`,
      /attributed Workspace/
    )
    await execute(`
      INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "lastAccessAt", "createdAt", "updatedAt")
      VALUES ('gc-workspace', 'owner', 'j1', 1, 0, 'ACTIVE', '${graph("j1", "owner", 1)}', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
      VALUES ('gc-workspace-r1', 'gc-workspace', 1, 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'gc-workspace-r1-key', '${NOW}');
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 1 WHERE "id" = 'gc-workspace';
      INSERT INTO "WorkspaceAgentRun" ("id", "workspaceId", "status", "runtimeOwnerId", "heartbeatAt", "leaseExpiresAt", "startedAt", "createdAt", "updatedAt")
      VALUES ('gc-agent-run', 'gc-workspace', 'RUNNING', 'runtime-gc', '${NOW}', '2026-08-02T00:01:00.000Z', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "WorkspaceMessage" ("id", "workspaceId", "role", "content", "agentRunId", "createdAt", "updatedAt")
      VALUES ('gc-message', 'gc-workspace', 'ASSISTANT', 'GC', 'gc-agent-run', '${NOW}', '${NOW}');
      INSERT INTO "ProviderUsageLog" ("id", "provider", "purpose", "status", "workspaceId", "agentRunId", "createdAt")
      VALUES ('gc-provider-usage', 'test', 'route', 'ok', 'gc-workspace', 'gc-agent-run', '${NOW}');
    `)
    await expectSqlFailure(
      `UPDATE "ProviderUsageLog" SET "workspaceId" = NULL WHERE "id" = 'gc-provider-usage';`,
      /attributed Workspace/
    )
    await execute(`DELETE FROM "WorkspaceSession" WHERE "id" = 'gc-workspace';`)
    expect(
      (
        await queryRows<{
          workspaceCount: number
          revisionCount: number
          messageCount: number
          runCount: number
          usageCount: number
          workspaceId: string | null
          agentRunId: string | null
        }>(`SELECT
           (SELECT count(*) FROM "WorkspaceSession" WHERE "id" = 'gc-workspace') AS "workspaceCount",
           (SELECT count(*) FROM "WorkspaceRevision" WHERE "workspaceId" = 'gc-workspace') AS "revisionCount",
           (SELECT count(*) FROM "WorkspaceMessage" WHERE "workspaceId" = 'gc-workspace') AS "messageCount",
           (SELECT count(*) FROM "WorkspaceAgentRun" WHERE "workspaceId" = 'gc-workspace') AS "runCount",
           count(*) AS "usageCount",
           "workspaceId",
           "agentRunId"
         FROM "ProviderUsageLog"
         WHERE "id" = 'gc-provider-usage' GROUP BY "id"`)
      )[0]
    ).toEqual({
      workspaceCount: 0,
      revisionCount: 0,
      messageCount: 0,
      runCount: 0,
      usageCount: 1,
      workspaceId: null,
      agentRunId: null,
    })
    await expectSqlFailure(
      `INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
       VALUES ('workspace-r3', 'workspace-1', 3, 'workspace-r1', 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r3-key', '${NOW}');`,
      /immediately preceding/
    )
    await execute(`
      INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
      VALUES
        ('workspace-r2', 'workspace-1', 2, 'workspace-r1', 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r2-key', '2026-08-02T00:01:00.000Z'),
        ('workspace-r3', 'workspace-1', 3, 'workspace-r2', 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r3-key', '2026-08-02T00:02:00.000Z');
    `)
    await expectSqlFailure(
      `UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 3 WHERE "id" = 'workspace-1';`,
      /advance by one/
    )
    await execute(`
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 2 WHERE "id" = 'workspace-1';
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 3 WHERE "id" = 'workspace-1';
    `)
    await expectSqlFailure(
      `DELETE FROM "WorkspaceRevision" WHERE "id" = 'workspace-r3';`,
      /while their Workspace exists/
    )
    await execute(`
      UPDATE "WorkspaceSession"
      SET "status" = 'ARCHIVED', "archivedAt" = '${NOW}'
      WHERE "id" = 'workspace-1';
    `)
    await expectSqlFailure(
      `DELETE FROM "WorkspaceRevision" WHERE "id" = 'workspace-r3';`,
      /while their Workspace exists/
    )
    await execute(`
      UPDATE "WorkspaceSession"
      SET "status" = 'ACTIVE', "archivedAt" = NULL
      WHERE "id" = 'workspace-1';
    `)
    expect(
      (
        await queryRows<{
          status: string
          headWorkspaceRevision: number
          headCount: number
        }>(`SELECT workspace."status", workspace."headWorkspaceRevision",
                count(revision."id") AS "headCount"
         FROM "WorkspaceSession" workspace
         LEFT JOIN "WorkspaceRevision" revision
           ON revision."workspaceId" = workspace."id"
          AND revision."revision" = workspace."headWorkspaceRevision"
         WHERE workspace."id" = 'workspace-1'
         GROUP BY workspace."id"`)
      )[0]
    ).toEqual({ status: "ACTIVE", headWorkspaceRevision: 3, headCount: 1 })
  })
})

// Two real connections exercise both lock orders, rather than merely checking
// that the sequential database guards reject invalid rows.
it.each(["event", "source"] as const)(
  "serializes %s attachment against soft deletion",
  async (reference) => {
    const contender = new Client({
      connectionString: periplusServerConfig.database.url,
    })
    await contender.connect()
    await contender.query(`SET search_path TO "${schema}"`)
    const pid = (
      await contender.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")
    ).rows[0]!.pid
    const referenceSql =
      reference === "event"
        ? `INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision") VALUES ('race-link', 'j1', 'a', 'race-asset', 'race-hash', 'GALLERY', 0, 'PRIVATE', 1)`
        : `INSERT INTO "SourceDocument" ("id", "sourcePackId", "assetId", "checksum", "title", "updatedAt") VALUES ('race-doc', 'race-pack', 'race-asset', 'race-hash', 'Source', '${NOW}')`
    const deleteSql = `UPDATE "Asset" SET "deletedAt" = '${NOW}' WHERE "id" = 'race-asset'`
    async function waitForLock() {
      await expect
        .poll(
          async () =>
            (
              await client.query<{ wait_event_type: string }>(
                "SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1",
                [pid]
              )
            ).rows[0]?.wait_event_type,
          { timeout: 3000 }
        )
        .toBe("Lock")
    }
    try {
      await execute(
        `INSERT INTO "Asset" ("id", "ownerId", "kind", "storageKey", "mimeType", "sizeBytes", "checksum") VALUES ('race-asset', 'owner', 'FILE', 'private/race', 'application/pdf', 10, 'race-hash'); INSERT INTO "SourcePack" ("id", "ownerId", "title", "updatedAt") VALUES ('race-pack', 'owner', 'Source', '${NOW}')`
      )
      await execute("BEGIN")
      await execute(referenceSql)
      const deleteResult = contender.query(deleteSql).then(
        () => null,
        (error: { code: string }) => error
      )
      await waitForLock()
      await execute("COMMIT")
      expect((await deleteResult)?.code).toBe("23514")
      await execute(
        reference === "event"
          ? 'DELETE FROM "EventAssetLink" WHERE "id" = \'race-link\''
          : 'DELETE FROM "SourceDocument" WHERE "id" = \'race-doc\''
      )
      await execute("BEGIN")
      await execute(deleteSql)
      const attachResult = contender.query(referenceSql).then(
        () => null,
        (error: { code: string }) => error
      )
      await waitForLock()
      await execute("COMMIT")
      expect((await attachResult)?.code).toBe("23514")
    } finally {
      await client.query("ROLLBACK")
      await contender.end()
    }
  }
)
