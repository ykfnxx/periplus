// @vitest-environment node
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { Client } from "pg"
import { afterEach, beforeEach, describe, it, expect } from "vitest"
import { periplusServerConfig } from "@/config/periplus.server"
import { journeyFixture } from "@/tests/fixtures/journey"
const sql = readFileSync(
  "prisma/migrations/20261023000000_postgresql_baseline/migration.sql",
  "utf8"
)
let client: Client, schema: string
beforeEach(async () => {
  schema = `flat_${randomUUID().replaceAll("-", "")}`
  client = new Client({ connectionString: periplusServerConfig.database.url })
  await client.connect()
  await client.query(`CREATE SCHEMA "${schema}"`)
  await client.query(`SET search_path TO "${schema}"`)
  await client.query(sql)
  await client.query(
    `INSERT INTO "user"("id","name","email","updatedAt") VALUES ('owner','Owner','owner@example.test',now())`
  )
}, 30000)
afterEach(async () => {
  if (client) {
    await client.query("ROLLBACK")
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await client.end()
  }
})
async function saved() {
  const journey = journeyFixture()
  await client.query("BEGIN")
  await client.query(
    `INSERT INTO "Journey"("id","ownerId","title","snapshotJson","updatedAt") VALUES ($1,$2,$3,$4,now())`,
    [journey.id, journey.ownerId, journey.title, JSON.stringify(journey)]
  )
  await client.query(
    `INSERT INTO "JourneyRevision"("id","journeyId","revision","operation","snapshotJson","patchJson","inversePatchJson","actorUserId","idempotencyKey") VALUES ('rev','journey',1,'create',$1,'[]','[]','owner','create')`,
    [JSON.stringify(journey)]
  )
  await client.query("COMMIT")
  return journey
}
describe("fresh PostgreSQL single-event baseline", () => {
  it("has no old container, graph link or type detail tables", async () => {
    const rows = (
      await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=$1",
        [schema]
      )
    ).rows.map((row) => row.table_name)
    expect(rows).toContain("JourneyEvent")
    for (const table of [
      "SectionEventDetail",
      "JourneyEventLink",
      "JourneyEventReplacement",
      "JourneyBranchSelection",
      "VisitEventDetail",
      "WorkspaceSession",
      "WorkspaceRevision",
      "WorkspaceAgentRun",
      "WorkspaceMessage",
    ])
      expect(rows).not.toContain(table)
  })
  it("requires the head to reference a real immutable revision", async () => {
    await saved()
    await expect(
      client.query(
        `UPDATE "JourneyRevision" SET "operation"='rewrite' WHERE "id"='rev'`
      )
    ).rejects.toThrow("immutable")
    await expect(
      client.query(`DELETE FROM "JourneyRevision" WHERE "id"='rev'`)
    ).rejects.toThrow("immutable")
  })
  it("rejects contradictory snapshot identities", async () => {
    await expect(
      client.query(
        `INSERT INTO "Journey"("id","ownerId","title","snapshotJson","updatedAt") VALUES ('wrong','owner','title',$1,now())`,
        [JSON.stringify(journeyFixture())]
      )
    ).rejects.toThrow()
  })
  it("requires active indexes to match canonical event order and source", async () => {
    await saved()
    await expect(
      client.query(
        `INSERT INTO "JourneyEvent"("id","journeyId","rank","sourceUserId") VALUES ('forged','journey',0,'owner')`
      )
    ).rejects.toThrow("canonical")
  })
  it("rejects incomplete actor references", async () => {
    const journey = journeyFixture()
    await client.query("BEGIN")
    await client.query(
      `INSERT INTO "Journey"("id","ownerId","title","snapshotJson","updatedAt") VALUES ('journey','owner','title',$1,now())`,
      [JSON.stringify(journey)]
    )
    await expect(
      client.query(
        `INSERT INTO "JourneyRevision"("id","journeyId","revision","operation","snapshotJson","patchJson","inversePatchJson","idempotencyKey") VALUES ('bad','journey',1,'create',$1,'[]','[]','key')`,
        [JSON.stringify(journey)]
      )
    ).rejects.toThrow()
  })
})
