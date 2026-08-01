import { execFileSync, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  TARGET_MANDATORY_RELATION_IDS,
  TARGET_MODEL_RELATIONS,
} from "@/modules/data-model/contracts"

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260801070000_schema_baseline/migration.sql"
)
const migrationSql = readFileSync(migrationPath, "utf8")

const NOW = "2026-08-02T00:00:00.000Z"
const graph = (id: string, ownerId: string, revision: number) =>
  JSON.stringify({ id, ownerId, revision })

let temporaryDirectory: string
let databasePath: string

function sqlite(sql: string): string {
  return execFileSync("sqlite3", [databasePath], {
    encoding: "utf8",
    input: `.bail on\nPRAGMA foreign_keys = ON;\n${sql}`,
    maxBuffer: 8 * 1024 * 1024,
  })
}

function sqliteJson<T>(sql: string): T[] {
  const output = execFileSync("sqlite3", ["-json", databasePath, sql], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim()
  return output ? (JSON.parse(output) as T[]) : []
}

function expectSqlFailure(sql: string, message?: RegExp) {
  const result = spawnSync("sqlite3", [databasePath], {
    encoding: "utf8",
    input: `.bail on\nPRAGMA foreign_keys = ON;\n${sql}`,
    maxBuffer: 8 * 1024 * 1024,
  })
  expect(result.status, result.stdout).not.toBe(0)
  if (message) expect(result.stderr).toMatch(message)
}

function seedBaseDatabase() {
  sqlite(`
    INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    VALUES
      ('owner', 'Owner', 'owner@example.test', 1, '${NOW}', '${NOW}'),
      ('other', 'Other', 'other@example.test', 1, '${NOW}', '${NOW}');

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

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "periplus-schema-"))
  databasePath = join(temporaryDirectory, "schema.db")
  sqlite(migrationSql)
  seedBaseDatabase()
})

afterEach(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

describe("P1 SQLite schema baseline", () => {
  it("materializes exactly the mandatory P0 physical relations", () => {
    type ForeignKeyRow = {
      tableName: string
      foreignKeyId: number
      sequence: number
      targetTable: string
      fromColumn: string
      toColumn: string
      onDelete: string
    }
    const rows = sqliteJson<ForeignKeyRow>(`
      SELECT
        schema.name AS tableName,
        foreignKey.id AS foreignKeyId,
        foreignKey.seq AS sequence,
        foreignKey."table" AS targetTable,
        foreignKey."from" AS fromColumn,
        foreignKey."to" AS toColumn,
        foreignKey.on_delete AS onDelete
      FROM sqlite_schema schema
      JOIN pragma_foreign_key_list(schema.name) foreignKey
      WHERE schema.type = 'table'
      ORDER BY schema.name, foreignKey.id, foreignKey.seq
    `)
    const actualRelations = new Map<
      string,
      {
        tableName: string
        targetTable: string
        fromFields: string[]
        toFields: string[]
        onDelete: string
      }
    >()
    for (const row of rows) {
      const key = `${row.tableName}:${row.foreignKeyId}`
      const relation = actualRelations.get(key) ?? {
        tableName: row.tableName,
        targetTable: row.targetTable,
        fromFields: [],
        toFields: [],
        onDelete: row.onDelete.replace(" ", "_"),
      }
      relation.fromFields[row.sequence] = row.fromColumn
      relation.toFields[row.sequence] = row.toColumn
      actualRelations.set(key, relation)
    }

    expect(TARGET_MODEL_RELATIONS.map((item) => item.id)).toEqual([
      ...TARGET_MANDATORY_RELATION_IDS,
    ])
    expect(actualRelations.size).toBe(TARGET_MANDATORY_RELATION_IDS.length)

    const mappedTable = (model: string) =>
      ({ User: "user", Session: "session", Account: "account" })[model] ?? model
    for (const expected of TARGET_MODEL_RELATIONS) {
      const match = [...actualRelations.values()].find(
        (actual) =>
          actual.tableName === mappedTable(expected.fromModel) &&
          actual.targetTable === mappedTable(expected.toModel) &&
          actual.fromFields.join("|") === expected.fromFields.join("|") &&
          actual.toFields.join("|") === expected.toFields.join("|") &&
          actual.onDelete === expected.onDelete
      )
      expect(match, expected.id).toBeDefined()
    }
  })

  it("backs every one-to-one relation with a physical unique key", () => {
    type TableInfo = { name: string; pk: number }
    type IndexList = { name: string; unique: number }
    type IndexInfo = { seqno: number; name: string }
    const mappedTable = (model: string) =>
      ({ User: "user", Session: "session", Account: "account" })[model] ?? model

    for (const relation of TARGET_MODEL_RELATIONS.filter(
      (item) => item.unique
    )) {
      const tableName = mappedTable(relation.fromModel)
      const tableInfo = sqliteJson<TableInfo>(
        `PRAGMA table_info("${tableName}")`
      )
      const uniqueColumnSets = [
        tableInfo
          .filter((column) => column.pk > 0)
          .sort((left, right) => left.pk - right.pk)
          .map((column) => column.name),
      ]
      const indexes = sqliteJson<IndexList>(
        `PRAGMA index_list("${tableName}")`
      ).filter((index) => index.unique === 1)
      for (const index of indexes) {
        uniqueColumnSets.push(
          sqliteJson<IndexInfo>(`PRAGMA index_info("${index.name}")`)
            .sort((left, right) => left.seqno - right.seqno)
            .map((column) => column.name)
        )
      }

      expect(
        uniqueColumnSets.some(
          (columns) => columns.join("|") === relation.fromFields.join("|")
        ),
        relation.id
      ).toBe(true)
    }
  })

  it("rejects cross-Journey composite foreign keys", () => {
    expectSqlFailure(
      `INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('cross-link', 'j1', 'a', 'other-event', 'MAIN', 1, 1, '${NOW}', '${NOW}');`,
      /FOREIGN KEY|same scope/
    )
    expectSqlFailure(
      `INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('unscheduled-link', 'j1', 'a', 'unscheduled', 'MAIN', 1, 1, '${NOW}', '${NOW}');`,
      /active, scheduled/
    )
    expectSqlFailure(
      `INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('bad-child', 'j1', 'a', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Bad child', 1, '${NOW}', '${NOW}');`,
      /active SECTION/
    )
  })

  it("enforces replacement scope and acyclicity", () => {
    sqlite(`
      INSERT INTO "JourneyEventReplacement" ("id", "journeyId", "predecessorEventId", "successorEventId", "revision", "reason", "createdAt")
      VALUES ('replacement-1', 'j1', 'a', 'b', 1, 'replace A', '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "JourneyEventReplacement" ("id", "journeyId", "predecessorEventId", "successorEventId", "revision", "reason", "createdAt")
       VALUES ('replacement-cycle', 'j1', 'b', 'a', 1, 'cycle', '${NOW}');`,
      /cycle/
    )
    expectSqlFailure(
      `INSERT INTO "JourneyEventReplacement" ("id", "journeyId", "predecessorEventId", "successorEventId", "revision", "reason", "createdAt")
       VALUES ('replacement-scope', 'j1', 'c', 'unscheduled', 1, 'cross scope', '${NOW}');`,
      /same scope/
    )
    expectSqlFailure(
      `UPDATE "JourneyEventReplacement" SET "reason" = 'rewrite' WHERE "id" = 'replacement-1';`,
      /append-only/
    )
    expectSqlFailure(
      `DELETE FROM "JourneyEventReplacement" WHERE "id" = 'replacement-1';`,
      /while their Journey exists/
    )
    sqlite(`UPDATE "Journey" SET "deletedAt" = '${NOW}' WHERE "id" = 'j1';`)
    expectSqlFailure(
      `DELETE FROM "JourneyEventReplacement" WHERE "id" = 'replacement-1';`,
      /while their Journey exists/
    )
    sqlite(`
      UPDATE "Journey" SET "deletedAt" = NULL WHERE "id" = 'j1';
    `)
    expect(
      sqliteJson<{ count: number }>(
        `SELECT count(*) AS count FROM "JourneyEventReplacement" WHERE "id" = 'replacement-1'`
      )[0]?.count
    ).toBe(1)
  })

  it("enforces revision, idempotency, and linear-parent uniqueness", () => {
    expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "createdAt")
       VALUES ('duplicate-r1', 'j1', 1, 'duplicate', '${graph("j1", "owner", 1)}', '[]', '[]', 'SYSTEM', 'other-key', '${NOW}');`,
      /UNIQUE/
    )
    expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
       VALUES ('duplicate-key', 'j1', 2, 'duplicate', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r1-key', 'j1-r1', '${NOW}');`,
      /UNIQUE/
    )
    expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
       VALUES ('j1-r3', 'j1', 3, 'skip', '${graph("j1", "owner", 3)}', '[]', '[]', 'SYSTEM', 'j1-r3-key', 'j1-r1', '${NOW}');`,
      /immediately preceding/
    )
    expectSqlFailure(
      `INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
       VALUES ('bad-snapshot', 'j1', 2, 'bad snapshot', '{"id":"j1"}', '[]', '[]', 'SYSTEM', 'bad-snapshot-key', 'j1-r1', '${NOW}');`,
      /CHECK|preserve Journey ownership/
    )
    expectSqlFailure(
      `UPDATE "JourneyRevision" SET "operation" = 'rewrite' WHERE "id" = 'j1-r1';`,
      /append-only/
    )
    expectSqlFailure(
      `UPDATE "Journey" SET "revision" = 2 WHERE "id" = 'j1';`,
      /persisted JourneyRevision/
    )
    sqlite(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r2', 'j1', 2, 'advance', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r2-key', 'j1-r1', '${NOW}');
      UPDATE "Journey" SET "revision" = 2 WHERE "id" = 'j1';
    `)
    expectSqlFailure(
      `DELETE FROM "JourneyRevision" WHERE "id" = 'j1-r2';`,
      /while their Journey exists/
    )
    sqlite(`UPDATE "Journey" SET "deletedAt" = '${NOW}' WHERE "id" = 'j1';`)
    expectSqlFailure(
      `DELETE FROM "JourneyRevision" WHERE "id" = 'j1-r2';`,
      /while their Journey exists/
    )
    sqlite(`UPDATE "Journey" SET "deletedAt" = NULL WHERE "id" = 'j1';`)
    expect(
      sqliteJson<{ count: number }>(
        `SELECT count(*) AS count FROM "JourneyRevision" revision
         JOIN "Journey" journey
           ON journey."id" = revision."journeyId"
          AND journey."revision" = revision."revision"
         WHERE journey."id" = 'j1'`
      )[0]?.count
    ).toBe(1)
  })

  it("enforces Event checks and typed-detail triggers", () => {
    expectSqlFailure(
      `INSERT INTO "JourneyEvent" ("id", "journeyId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('bad-section', 'j1', 'SECTION', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Bad', 1, '${NOW}', '${NOW}');`,
      /CHECK/
    )
    expectSqlFailure(
      `INSERT INTO "VisitEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem")
       VALUES ('section', 30, 120, 'GCJ02');`,
      /requires a VISIT/
    )
    expectSqlFailure(
      `INSERT INTO "SectionEventDetail" ("eventId", "kind") VALUES ('section', 'DAY');`,
      /CHECK/
    )
    expectSqlFailure(
      `UPDATE "JourneyEvent" SET "type" = 'MEAL' WHERE "id" = 'a';
       INSERT INTO "VisitEventDetail" ("eventId", "plannedLat", "plannedLng", "coordinateSystem") VALUES ('a', 30, 120, 'GCJ02');`,
      /requires a VISIT/
    )
    sqlite(`
      INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
      VALUES
        ('detail-visit', 'j1', 'section', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Visit detail', 1, '${NOW}', '${NOW}'),
        ('detail-stay', 'j1', 'section', 'STAY', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Stay detail', 1, '${NOW}', '${NOW}'),
        ('detail-meal', 'j1', 'section', 'MEAL', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Meal detail', 1, '${NOW}', '${NOW}'),
        ('detail-activity', 'j1', 'section', 'ACTIVITY', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Activity detail', 1, '${NOW}', '${NOW}'),
        ('detail-note', 'j1', 'section', 'NOTE', NULL, 'SCHEDULED', 'ORIGINAL', 'Note detail', 1, '${NOW}', '${NOW}');
      INSERT INTO "SectionEventDetail" ("eventId", "kind") VALUES ('section', 'THEME');
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
      expectSqlFailure(
        `DELETE FROM "${table}" WHERE "eventId" = '${eventId}';`,
        /only be deleted by deleting its Event/
      )
    }
  })

  it("preserves retired Links while enforcing one active MAIN in and out", () => {
    sqlite(`
      INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
      VALUES ('link-1', 'j1', 'a', 'b', 'MAIN', 1024, 1, '${NOW}', '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
       VALUES ('link-2', 'j1', 'a', 'c', 'MAIN', 2048, 1, '${NOW}', '${NOW}');`,
      /UNIQUE/
    )
    sqlite(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r2', 'j1', 2, 'reroute', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r2-key', 'j1-r1', '${NOW}');
      UPDATE "Journey" SET "revision" = 2 WHERE "id" = 'j1';
      UPDATE "JourneyEventLink" SET "retiredRevision" = 2 WHERE "id" = 'link-1';
      INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "rank", "introducedRevision", "createdAt", "updatedAt")
      VALUES ('link-2', 'j1', 'a', 'c', 'MAIN', 2048, 2, '${NOW}', '${NOW}');
    `)
    expect(
      sqliteJson<{ count: number }>(
        `SELECT count(*) AS count FROM "JourneyEventLink" WHERE "journeyId" = 'j1'`
      )[0]?.count
    ).toBe(2)
  })

  it("enforces Transit run finalization and composite Plan selection", () => {
    sqlite(`
      INSERT INTO "TransitEventDetail" ("eventId", "transportMode", "routeState") VALUES ('transit', 'TAXI', 'EMPTY');
      INSERT INTO "TransitPlanningRun" ("id", "transitEventId", "requestFingerprint", "provider", "status", "calculatedAt", "createdAt", "updatedAt")
      VALUES ('run-1', 'transit', 'fingerprint-1', 'test', 'PLANNING', '${NOW}', '${NOW}', '${NOW}');
    `)
    expectSqlFailure(
      `UPDATE "TransitPlanningRun" SET "status" = 'READY' WHERE "id" = 'run-1';`,
      /requires Plans/
    )
    sqlite(`
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
    expectSqlFailure(
      `UPDATE "TransitEventDetail" SET "routeState" = 'READY', "activePlanningRunId" = 'run-1', "selectedPlanId" = 'plan-2' WHERE "eventId" = 'transit';`,
      /FOREIGN KEY/
    )
    expectSqlFailure(
      `UPDATE "TransitEventDetail" SET "plannedFromEventId" = 'unscheduled' WHERE "eventId" = 'transit';`,
      /Transit endpoints/
    )
    expectSqlFailure(
      `UPDATE "TransitPlanningRun" SET "status" = 'PLANNING' WHERE "id" = 'run-1';`,
      /READY run requires Plans|FAILED planning run|CHECK|finalized|run requires Plans/
    )
    expectSqlFailure(
      `INSERT INTO "TransitPlan" ("id", "planningRunId", "transitEventId", "provider", "rank", "label", "strategy", "distanceMeters", "durationSeconds", "trafficBasis", "calculatedAt", "createdAt", "updatedAt")
       VALUES ('late-plan', 'run-1', 'transit', 'test', 1, 'Late', 'NONE', 0, 0, 'UNKNOWN', '${NOW}', '${NOW}', '${NOW}');`,
      /finalized planning run/
    )
    expectSqlFailure(
      `INSERT INTO "TransitSegment" ("id", "transitPlanId", "order", "mode", "coordinateSystem", "geometryKind", "positionsJson")
       VALUES ('late-segment', 'plan-1', 0, 'WALK', 'WGS84', 'NONE', '[]');`,
      /finalized planning run/
    )
    expectSqlFailure(
      `INSERT INTO "TransitSegment" ("id", "transitPlanId", "order", "mode", "coordinateSystem", "geometryKind", "positionsJson")
       VALUES ('bad-geometry', 'plan-2', 0, 'WALK', 'WGS84', 'NONE', '{}');`,
      /CHECK/
    )
    expectSqlFailure(
      `DELETE FROM "TransitSegment" WHERE "id" = 'segment-1';`,
      /cannot be deleted/
    )
    expectSqlFailure(
      `DELETE FROM "TransitPlan" WHERE "id" = 'plan-1';`,
      /cannot be deleted/
    )
    expectSqlFailure(
      `DELETE FROM "TransitPlanningRun" WHERE "id" = 'run-1';`,
      /purging their Transit Event/
    )
    expectSqlFailure(
      `INSERT INTO "TransitPlanningRun" ("id", "transitEventId", "requestFingerprint", "provider", "status", "errorCode", "calculatedAt", "createdAt", "updatedAt")
       VALUES ('failed-run', 'transit', 'fingerprint-failed', 'test', 'FAILED', 'NO_ROUTE', '${NOW}', '${NOW}', '${NOW}');
       INSERT INTO "TransitPlan" ("id", "planningRunId", "transitEventId", "provider", "rank", "label", "strategy", "distanceMeters", "durationSeconds", "trafficBasis", "calculatedAt", "createdAt", "updatedAt")
       VALUES ('failed-plan', 'failed-run', 'transit', 'test', 0, 'Bad', 'NONE', 0, 0, 'UNKNOWN', '${NOW}', '${NOW}', '${NOW}');`,
      /finalized planning run/
    )
    expectSqlFailure(
      `DELETE FROM "TransitEventDetail" WHERE "eventId" = 'transit';`,
      /only be deleted by deleting its Event/
    )
    sqlite(`DELETE FROM "JourneyEvent" WHERE "id" = 'transit';`)
    expect(
      sqliteJson<{
        eventCount: number
        detailCount: number
        runCount: number
      }>(
        `SELECT
           (SELECT count(*) FROM "JourneyEvent" WHERE "id" = 'transit') AS eventCount,
           (SELECT count(*) FROM "TransitEventDetail" WHERE "eventId" = 'transit') AS detailCount,
           (SELECT count(*) FROM "TransitPlanningRun" WHERE "transitEventId" = 'transit') AS runCount`
      )[0]
    ).toEqual({ eventCount: 0, detailCount: 0, runCount: 0 })
  })

  it("enforces append-only branch selection supersession", () => {
    sqlite(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r2', 'j1', 2, 'branch', '${graph("j1", "owner", 2)}', '[]', '[]', 'SYSTEM', 'j1-r2-key', 'j1-r1', '${NOW}');
      INSERT INTO "JourneyEventLink" ("id", "journeyId", "fromEventId", "toEventId", "kind", "branchKey", "rank", "introducedRevision", "createdAt", "updatedAt")
      VALUES
        ('branch-a', 'j1', 'a', 'b', 'ALTERNATIVE', 'fork-1', 1024, 1, '${NOW}', '${NOW}'),
        ('branch-b', 'j1', 'a', 'c', 'ALTERNATIVE', 'fork-1', 2048, 1, '${NOW}', '${NOW}');
      INSERT INTO "JourneyBranchSelection" ("id", "journeyId", "forkEventId", "selectedLinkId", "journeyRevision", "actorKind", "actorUserId", "createdAt")
      VALUES ('selection-1', 'j1', 'a', 'branch-a', 1, 'USER', 'owner', '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "JourneyBranchSelection" ("id", "journeyId", "forkEventId", "selectedLinkId", "journeyRevision", "actorKind", "actorUserId", "createdAt")
       VALUES ('selection-2', 'j1', 'a', 'branch-b', 2, 'USER', 'owner', '2026-08-02T00:01:00.000Z');`,
      /supersede the current/
    )
    expectSqlFailure(
      `UPDATE "JourneyEventLink" SET "retiredRevision" = 2 WHERE "id" = 'branch-a';`,
      /current branch selection/
    )
    sqlite(`
      INSERT INTO "JourneyBranchSelection" ("id", "journeyId", "forkEventId", "selectedLinkId", "journeyRevision", "supersedesId", "actorKind", "actorUserId", "createdAt")
      VALUES ('selection-2', 'j1', 'a', 'branch-b', 2, 'selection-1', 'USER', 'owner', '2026-08-02T00:01:00.000Z');
      UPDATE "JourneyEventLink" SET "retiredRevision" = 2 WHERE "id" = 'branch-a';
    `)
    sqlite(`
      INSERT INTO "JourneyRevision" ("id", "journeyId", "revision", "operation", "snapshotJson", "patchJson", "inversePatchJson", "actorKind", "idempotencyKey", "parentRevisionId", "createdAt")
      VALUES ('j1-r3', 'j1', 3, 'retire fork', '${graph("j1", "owner", 3)}', '[]', '[]', 'SYSTEM', 'j1-r3-key', 'j1-r2', '2026-08-02T00:02:00.000Z');
      INSERT INTO "JourneyEvent" ("id", "journeyId", "parentSectionEventId", "type", "executionStatus", "placementStatus", "origin", "title", "introducedRevision", "createdAt", "updatedAt")
      VALUES ('selection-parking', 'j1', 'section', 'VISIT', 'PLANNED', 'SCHEDULED', 'ORIGINAL', 'Selection parking', 3, '${NOW}', '${NOW}');
      UPDATE "JourneyEventLink" SET "fromEventId" = 'selection-parking' WHERE "id" = 'branch-b';
      UPDATE "JourneyEvent" SET "retiredRevision" = 3 WHERE "id" = 'a';
      UPDATE "JourneyEventLink" SET "retiredRevision" = 3 WHERE "id" = 'branch-b';
    `)
    expectSqlFailure(
      `UPDATE "JourneyBranchSelection" SET "reason" = 'rewrite' WHERE "id" = 'selection-1';`,
      /append-only/
    )
    expectSqlFailure(
      `DELETE FROM "JourneyBranchSelection" WHERE "id" = 'selection-2';`,
      /while their Journey exists/
    )
    sqlite(`UPDATE "Journey" SET "deletedAt" = '${NOW}' WHERE "id" = 'j1';`)
    expectSqlFailure(
      `DELETE FROM "JourneyBranchSelection" WHERE "id" = 'selection-2';`,
      /while their Journey exists/
    )
    sqlite(`UPDATE "Journey" SET "deletedAt" = NULL WHERE "id" = 'j1';`)
  })

  it("pins Asset and Source identities through policy triggers", () => {
    sqlite(`
      INSERT INTO "Asset" ("id", "ownerId", "kind", "visibility", "storageKey", "mimeType", "sizeBytes", "checksum", "createdAt")
      VALUES
        ('asset-1', 'owner', 'IMAGE', 'JOURNEY', 'asset/1', 'image/jpeg', 10, 'asset-checksum', '${NOW}'),
        ('asset-2', 'owner', 'IMAGE', 'JOURNEY', 'asset/2', 'image/jpeg', 10, 'asset-2-checksum', '${NOW}'),
        ('source-asset', 'owner', 'FILE', 'PRIVATE', 'source/1', 'application/pdf', 20, 'source-checksum', '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
       VALUES ('bad-asset-link', 'j1', 'a', 'asset-1', 'wrong', 'GALLERY', 0, 'JOURNEY', 1, '${NOW}');`,
      /pin an authorized Asset/
    )
    expectSqlFailure(
      `INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
       VALUES ('broad-asset-link', 'j1', 'a', 'asset-1', 'asset-checksum', 'GALLERY', 0, 'PUBLIC', 1, '${NOW}');`,
      /broadening visibility/
    )
    sqlite(`
      INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
      VALUES ('asset-link', 'j1', 'a', 'asset-1', 'asset-checksum', 'GALLERY', 0, 'JOURNEY', 1, '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "EventAssetLink" ("id", "journeyId", "eventId", "assetId", "assetChecksum", "role", "rank", "visibility", "introducedRevision", "createdAt")
       VALUES ('duplicate-asset-rank', 'j1', 'a', 'asset-2', 'asset-2-checksum', 'GALLERY', 0, 'JOURNEY', 1, '${NOW}');`,
      /UNIQUE/
    )
    expectSqlFailure(
      `UPDATE "Asset" SET "checksum" = 'changed' WHERE "id" = 'asset-1';`,
      /invalidate an active Event/
    )
    sqlite(`
      INSERT INTO "SourcePack" ("id", "ownerId", "title", "visibility", "status", "createdAt", "updatedAt")
      VALUES ('pack-1', 'owner', 'Pack', 'PRIVATE', 'READY', '${NOW}', '${NOW}');
      INSERT INTO "SourceDocument" ("id", "sourcePackId", "assetId", "checksum", "title", "processingStatus", "createdAt", "updatedAt")
      VALUES ('document-1', 'pack-1', 'source-asset', 'source-checksum', 'Document', 'READY', '${NOW}', '${NOW}');
      INSERT INTO "SourceItem" ("id", "sourceDocumentId", "kind", "title", "sourceOrder", "confidence", "resolutionState", "createdAt", "updatedAt")
      VALUES
        ('item-1', 'document-1', 'PLACE', 'Place', 0, 0.8, 'UNRESOLVED', '${NOW}', '${NOW}'),
        ('item-2', 'document-1', 'NOTE', 'Note', 1, 0.8, 'UNRESOLVED', '${NOW}', '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
       VALUES ('bad-source-link', 'j1', 'a', 'item-1', 'document-1', 'wrong', 'EVIDENCE', 0.8, 0, 0, 1, '${NOW}');`,
      /pin its SourceItem document/
    )
    expectSqlFailure(
      `INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
       VALUES ('unredacted-source-link', 'j1', 'a', 'item-1', 'document-1', 'source-checksum', 'EVIDENCE', 0.8, 0, 1, 1, '${NOW}');`,
      /CHECK/
    )
    expectSqlFailure(
      `UPDATE "Asset" SET "checksum" = 'changed' WHERE "id" = 'source-asset';`,
      /SourceDocument/
    )
    sqlite(`
      INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
      VALUES ('source-link', 'j1', 'a', 'item-1', 'document-1', 'source-checksum', 'EVIDENCE', 0.8, 0, 0, 1, '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "EventSourceLink" ("id", "journeyId", "eventId", "sourceItemId", "sourceDocumentId", "sourceDocumentChecksum", "role", "confidence", "rank", "approvedForJourneySharing", "introducedRevision", "createdAt")
       VALUES ('duplicate-source-rank', 'j1', 'a', 'item-2', 'document-1', 'source-checksum', 'EVIDENCE', 0.8, 0, 0, 1, '${NOW}');`,
      /UNIQUE/
    )
  })

  it("enforces Observation and Workspace append-only lineage", () => {
    expectSqlFailure(
      `INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "expiresAt", "lastAccessAt", "createdAt", "updatedAt")
       VALUES ('bad-workspace', 'owner', 'j1', 1, 0, 'ACTIVE', '{}', '2026-09-01T00:00:00.000Z', '${NOW}', '${NOW}', '${NOW}');`,
      /CHECK/
    )
    expectSqlFailure(
      `INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "expiresAt", "lastAccessAt", "createdAt", "updatedAt")
       VALUES ('forged-head-workspace', 'owner', 'j1', 1, 99, 'ACTIVE', '${graph("j1", "owner", 1)}', '2026-09-01T00:00:00.000Z', '${NOW}', '${NOW}', '${NOW}');`,
      /start at head revision 0/
    )
    expectSqlFailure(
      `INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "expiresAt", "lastAccessAt", "createdAt", "updatedAt")
       VALUES ('wrong-owner-workspace', 'owner', 'j2', 1, 0, 'ACTIVE', '${graph("j2", "owner", 1)}', '2026-09-01T00:00:00.000Z', '${NOW}', '${NOW}', '${NOW}');`,
      /must belong to its owner/
    )
    sqlite(`
      INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "body", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
      VALUES ('observation-1', 'a', 'NOTE', 'ACTUAL', 'First', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');
      INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "body", "observedAt", "actorKind", "actorUserId", "supersedesId", "visibility", "createdAt")
      VALUES ('observation-2', 'a', 'NOTE', 'ACTUAL', 'Second', '2026-08-02T00:01:00.000Z', 'USER', 'owner', 'observation-1', 'JOURNEY', '2026-08-02T00:01:00.000Z');
      INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "expiresAt", "lastAccessAt", "createdAt", "updatedAt")
      VALUES ('workspace-1', 'owner', 'j1', 1, 0, 'ACTIVE', '${graph("j1", "owner", 1)}', '2026-09-01T00:00:00.000Z', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
      VALUES ('workspace-r1', 'workspace-1', 1, 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r1-key', '${NOW}');
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 1 WHERE "id" = 'workspace-1';
      INSERT INTO "WorkspaceAgentRun" ("id", "workspaceId", "status", "startedAt", "createdAt", "updatedAt")
      VALUES ('agent-run-1', 'workspace-1', 'RUNNING', '${NOW}', '${NOW}', '${NOW}');
    `)
    expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "body", "observedAt", "actorKind", "actorUserId", "supersedesId", "visibility", "createdAt")
       VALUES ('bad-observation', 'a', 'FACT', 'ACTUAL', 'Wrong kind', '2026-08-02T00:02:00.000Z', 'USER', 'owner', 'observation-2', 'JOURNEY', '2026-08-02T00:02:00.000Z');`,
      /same-kind Event chain/
    )
    expectSqlFailure(
      `UPDATE "EventObservation" SET "body" = 'Rewrite' WHERE "id" = 'observation-1';`,
      /append-only/
    )
    expectSqlFailure(
      `DELETE FROM "EventObservation" WHERE "id" = 'observation-2';`,
      /purging their Event/
    )
    expectSqlFailure(
      `DELETE FROM "WorkspaceRevision" WHERE "id" = 'workspace-r1';`,
      /while their Workspace exists/
    )
    expectSqlFailure(
      `UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 0 WHERE "id" = 'workspace-1';`,
      /advance by one/
    )
    expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "valueJson", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-rating', 'a', 'RATING', 'ACTUAL', '6', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-note', 'a', 'NOTE', 'ACTUAL', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "valueJson", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-cost', 'a', 'COST', 'ACTUAL', '{}', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    expectSqlFailure(
      `INSERT INTO "EventObservation" ("id", "eventId", "kind", "phase", "valueJson", "observedAt", "actorKind", "actorUserId", "visibility", "createdAt")
       VALUES ('bad-weather', 'a', 'WEATHER', 'ACTUAL', '{"temperatureCelsius":20}', '${NOW}', 'USER', 'owner', 'JOURNEY', '${NOW}');`,
      /CHECK/
    )
    expectSqlFailure(
      `UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 2 WHERE "id" = 'workspace-1';`,
      /persisted WorkspaceRevision/
    )
    expectSqlFailure(
      `INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
       VALUES ('workspace-wrong-owner', 'workspace-1', 2, 'workspace-r1', 'workspace.refresh', '${graph("j1", "other", 1)}', '${graph("j1", "other", 1)}', '[]', '[]', 'USER', 'owner', 'wrong-owner-key', '${NOW}');`,
      /preserve Workspace Journey identity and owner/
    )
    expectSqlFailure(
      `UPDATE "WorkspaceRevision" SET "commandName" = 'workspace.replay' WHERE "id" = 'workspace-r1';`,
      /append-only/
    )
    expectSqlFailure(
      `INSERT INTO "ProviderUsageLog" ("id", "provider", "purpose", "status", "agentRunId", "createdAt")
       VALUES ('bad-provider-usage', 'test', 'route', 'ok', 'agent-run-1', '${NOW}');`,
      /attributed Workspace/
    )
    sqlite(`
      INSERT INTO "WorkspaceSession" ("id", "ownerId", "sourceJourneyId", "baseJourneyRevision", "headWorkspaceRevision", "status", "headGraphJson", "expiresAt", "lastAccessAt", "createdAt", "updatedAt")
      VALUES ('gc-workspace', 'owner', 'j1', 1, 0, 'ACTIVE', '${graph("j1", "owner", 1)}', '2026-09-01T00:00:00.000Z', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
      VALUES ('gc-workspace-r1', 'gc-workspace', 1, 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'gc-workspace-r1-key', '${NOW}');
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 1 WHERE "id" = 'gc-workspace';
      INSERT INTO "WorkspaceAgentRun" ("id", "workspaceId", "status", "startedAt", "createdAt", "updatedAt")
      VALUES ('gc-agent-run', 'gc-workspace', 'RUNNING', '${NOW}', '${NOW}', '${NOW}');
      INSERT INTO "WorkspaceMessage" ("id", "workspaceId", "role", "content", "agentRunId", "createdAt", "updatedAt")
      VALUES ('gc-message', 'gc-workspace', 'ASSISTANT', 'GC', 'gc-agent-run', '${NOW}', '${NOW}');
      INSERT INTO "ProviderUsageLog" ("id", "provider", "purpose", "status", "workspaceId", "agentRunId", "createdAt")
      VALUES ('gc-provider-usage', 'test', 'route', 'ok', 'gc-workspace', 'gc-agent-run', '${NOW}');
    `)
    expectSqlFailure(
      `UPDATE "ProviderUsageLog" SET "workspaceId" = NULL WHERE "id" = 'gc-provider-usage';`,
      /attributed Workspace/
    )
    sqlite(`DELETE FROM "WorkspaceSession" WHERE "id" = 'gc-workspace';`)
    expect(
      sqliteJson<{
        workspaceCount: number
        revisionCount: number
        messageCount: number
        runCount: number
        usageCount: number
        workspaceId: string | null
        agentRunId: string | null
      }>(
        `SELECT
           (SELECT count(*) FROM "WorkspaceSession" WHERE "id" = 'gc-workspace') AS workspaceCount,
           (SELECT count(*) FROM "WorkspaceRevision" WHERE "workspaceId" = 'gc-workspace') AS revisionCount,
           (SELECT count(*) FROM "WorkspaceMessage" WHERE "workspaceId" = 'gc-workspace') AS messageCount,
           (SELECT count(*) FROM "WorkspaceAgentRun" WHERE "workspaceId" = 'gc-workspace') AS runCount,
           count(*) AS usageCount,
           "workspaceId",
           "agentRunId"
         FROM "ProviderUsageLog"
         WHERE "id" = 'gc-provider-usage'`
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
    expectSqlFailure(
      `INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
       VALUES ('workspace-r3', 'workspace-1', 3, 'workspace-r1', 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r3-key', '${NOW}');`,
      /immediately preceding/
    )
    sqlite(`
      INSERT INTO "WorkspaceRevision" ("id", "workspaceId", "revision", "parentRevisionId", "commandName", "beforeGraphJson", "afterGraphJson", "patchJson", "inversePatchJson", "actorKind", "actorUserId", "idempotencyKey", "createdAt")
      VALUES
        ('workspace-r2', 'workspace-1', 2, 'workspace-r1', 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r2-key', '2026-08-02T00:01:00.000Z'),
        ('workspace-r3', 'workspace-1', 3, 'workspace-r2', 'workspace.refresh', '${graph("j1", "owner", 1)}', '${graph("j1", "owner", 1)}', '[]', '[]', 'USER', 'owner', 'workspace-r3-key', '2026-08-02T00:02:00.000Z');
    `)
    expectSqlFailure(
      `UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 3 WHERE "id" = 'workspace-1';`,
      /advance by one/
    )
    sqlite(`
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 2 WHERE "id" = 'workspace-1';
      UPDATE "WorkspaceSession" SET "headWorkspaceRevision" = 3 WHERE "id" = 'workspace-1';
    `)
    expectSqlFailure(
      `DELETE FROM "WorkspaceRevision" WHERE "id" = 'workspace-r3';`,
      /while their Workspace exists/
    )
    sqlite(`
      UPDATE "WorkspaceSession"
      SET "status" = 'ARCHIVED', "archivedAt" = '${NOW}'
      WHERE "id" = 'workspace-1';
    `)
    expectSqlFailure(
      `DELETE FROM "WorkspaceRevision" WHERE "id" = 'workspace-r3';`,
      /while their Workspace exists/
    )
    sqlite(`
      UPDATE "WorkspaceSession"
      SET "status" = 'ACTIVE', "archivedAt" = NULL
      WHERE "id" = 'workspace-1';
    `)
    expect(
      sqliteJson<{
        status: string
        headWorkspaceRevision: number
        headCount: number
      }>(
        `SELECT workspace."status", workspace."headWorkspaceRevision",
                count(revision."id") AS headCount
         FROM "WorkspaceSession" workspace
         LEFT JOIN "WorkspaceRevision" revision
           ON revision."workspaceId" = workspace."id"
          AND revision."revision" = workspace."headWorkspaceRevision"
         WHERE workspace."id" = 'workspace-1'
         GROUP BY workspace."id"`
      )[0]
    ).toEqual({ status: "ACTIVE", headWorkspaceRevision: 3, headCount: 1 })
  })
})
