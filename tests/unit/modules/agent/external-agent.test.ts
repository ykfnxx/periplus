// @vitest-environment node
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { beforeAll, describe, expect, it } from "vitest"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { auth } from "@/modules/auth/server/auth"
import { prisma } from "@/modules/data/db/prisma"
import {
  createRecordingJourney,
  getRecordingJourney,
  mutateRecordingJourney,
} from "@/modules/data/journeys/recording-service"
import {
  authorizeAgent,
  signedOAuthQuery,
} from "@/modules/agent/server/authorization"
import { authenticateAgent } from "@/modules/agent/server/access"
import { authorizationKey } from "@/modules/agent/server/grants"
import {
  agentIssuer,
  agentResource,
  oauthScopes,
} from "@/modules/agent/server/oauth"
import { POST as mcp } from "@/app/api/mcp/route"
import { POST as upload } from "@/app/api/agent/v1/journeys/[journeyId]/photos/route"
import type { JourneySnapshot } from "@/modules/data-model/contracts"

const origin = new URL(agentResource).origin
let owner: { userId: string; role: "user" }, member: typeof owner
let ownerCookie: string, memberCookie: string, clientId: string
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=",
  "base64"
)

async function account(name: string) {
  const response = await auth.api.signUpEmail({
    body: {
      name,
      email: `agent-${randomUUID()}@example.test`,
      password: randomUUID(),
    },
    asResponse: true,
  })
  expect(response.status).toBe(200)
  const body = await response.json()
  return {
    context: { userId: body.user.id as string, role: "user" as const },
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  }
}
async function journey(context = owner) {
  return (
    await createRecordingJourney(context, {
      title: "Agent validation",
      idempotencyKey: randomUUID(),
    })
  ).journey
}
function cookies(cookie: string) {
  return new Headers({ cookie, origin, accept: "text/html" })
}
async function begin(cookie: string, scopes = oauthScopes) {
  const verifier = randomBytes(32).toString("base64url")
  const query = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: "http://localhost:49871/callback",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: randomUUID(),
    resource: agentResource,
    scope: scopes.join(" "),
  })
  const response = await auth.handler(
    new Request(`${agentIssuer}/oauth2/authorize?${query}`, {
      headers: cookies(cookie),
    })
  )
  expect(response.status).toBe(302)
  const location = new URL(response.headers.get("location")!, origin)
  expect(location.pathname).toBe("/agent/authorize")
  const oauthQuery = signedOAuthQuery(
    Object.fromEntries(
      [...new Set(location.searchParams.keys())].map((key) => [
        key,
        location.searchParams.getAll(key),
      ])
    )
  )
  return { verifier, query, oauthQuery }
}
async function tokens(form: Record<string, string>) {
  return auth.handler(
    new Request(`${agentIssuer}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        resource: agentResource,
        ...form,
      }),
    })
  )
}
async function authorize(
  target: JourneySnapshot,
  cookie = ownerCookie,
  scopes = oauthScopes
) {
  const flow = await begin(cookie, scopes)
  const result = await authorizeAgent(
    new Request(`${origin}/api/agent/authorize`, {
      method: "POST",
      headers: {
        ...Object.fromEntries(cookies(cookie)),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        oauthQuery: flow.oauthQuery,
        accept: true,
        journeyId: target.id,
        scopes: scopes.filter((scope) => scope !== "offline_access"),
      }),
    })
  )
  const code = new URL(result.url).searchParams.get("code")!
  expect(code).toBeTruthy()
  const response = await tokens({
    grant_type: "authorization_code",
    code,
    code_verifier: flow.verifier,
    redirect_uri: "http://localhost:49871/callback",
  })
  expect(response.status).toBe(200)
  const value = (await response.json()) as {
    access_token: string
    refresh_token?: string
  }
  const identity = await authenticateAgent(
    new Request(agentResource, {
      headers: { authorization: `Bearer ${value.access_token}` },
    })
  )
  return { ...value, identity }
}
async function connect(token: string) {
  const client = new Client({ name: "periplus-validation", version: "1.0.0" })
  const transport = new StreamableHTTPClientTransport(new URL(agentResource), {
    authProvider: { token: async () => token },
    fetch: async (url, init) => mcp(new Request(url, init)),
  })
  await client.connect(transport)
  return client
}
async function sendPhoto(
  token: string,
  target: JourneySnapshot,
  uploadId = randomUUID(),
  bytes = png,
  mime = "image/png"
) {
  const form = new FormData()
  form.set(
    "file",
    new File([new Uint8Array(bytes)], "photo.png", { type: mime })
  )
  form.set("uploadId", uploadId)
  return upload(
    new Request(`${origin}/api/agent/v1/journeys/${target.id}/photos`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body: form,
    }),
    { params: Promise.resolve({ journeyId: target.id }) }
  )
}

beforeAll(async () => {
  const first = await account("Agent Owner"),
    second = await account("Agent Member")
  owner = first.context
  ownerCookie = first.cookie
  member = second.context
  memberCookie = second.cookie
  await prisma.user.update({
    where: { id: owner.userId },
    data: { role: "admin" },
  })
  const client = await auth.api.adminCreateOAuthClient({
    headers: cookies(ownerCookie),
    body: {
      client_name: "Periplus validation",
      application_type: "native",
      token_endpoint_auth_method: "none",
      redirect_uris: ["http://localhost:49871/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      scope: oauthScopes.join(" "),
      resources: [agentResource],
    },
  })
  clientId = client.client_id!
}, 30000)

describe("external Agent authorization and editing", () => {
  it("pins each code and refresh token to its own Journey grant", async () => {
    const left = await journey(),
      right = await journey()
    const a = await authorize(left),
      b = await authorize(right)
    expect(a.identity.grant.journeyId).toBe(left.id)
    expect(b.identity.grant.journeyId).toBe(right.id)
    const refreshed = await tokens({
      grant_type: "refresh_token",
      refresh_token: a.refresh_token!,
    })
    expect(refreshed.status).toBe(200)
    const body = await refreshed.json()
    const identity = await authenticateAgent(
      new Request(agentResource, {
        headers: { authorization: `Bearer ${body.access_token}` },
      })
    )
    expect(identity.grant.id).toBe(a.identity.grant.id)
    expect(identity.grant.journeyId).toBe(left.id)
  })

  it("creates all four categories through MCP and preserves revision and replay semantics", async () => {
    const target = await journey(),
      access = await authorize(target),
      client = await connect(access.access_token)
    try {
      const tools = await client.listTools()
      expect(tools.tools).toHaveLength(11)
      let revision = target.revision,
        afterEventId: string | null = null
      for (const category of ["VISIT", "MEAL", "STAY", "TRANSIT"]) {
        const args = {
          journeyId: target.id,
          expectedRevision: revision,
          idempotencyKey: randomUUID(),
          afterEventId,
          content: {
            category,
            date: "2026-11-12",
            title: category,
            ...(category === "TRANSIT"
              ? {
                  transit: {
                    fromName: "A",
                    toName: "B",
                    transportMode: "WALK",
                  },
                }
              : {}),
          },
        }
        const saved = await client.callTool({
          name: "periplus_create_event",
          arguments: args,
        })
        expect(saved.isError).not.toBe(true)
        const value = saved.structuredContent as {
          revision: number
          event: { id: string }
          replayed: boolean
        }
        expect(value.revision).toBe(revision + 1)
        const replay = await client.callTool({
          name: "periplus_create_event",
          arguments: args,
        })
        expect(replay.structuredContent).toMatchObject({
          replayed: true,
          event: { id: value.event.id },
        })
        revision = value.revision
        afterEventId = value.event.id
      }
      const saved = await getRecordingJourney(owner, target.id)
      expect(saved.events.map((event) => event.category)).toEqual([
        "VISIT",
        "MEAL",
        "STAY",
        "TRANSIT",
      ])
      expect(
        saved.events.every((event) => event.source.userId === owner.userId)
      ).toBe(true)
      const conflict = await client.callTool({
        name: "periplus_update_event",
        arguments: {
          journeyId: target.id,
          expectedRevision: target.revision,
          idempotencyKey: randomUUID(),
          eventId: saved.events[0].id,
          patch: { body: "Stale edit" },
        },
      })
      expect(conflict.structuredContent).toMatchObject({
        code: "REVISION_CONFLICT",
      })
    } finally {
      await client.close()
    }
  }, 15000)

  it("hides write tools for a read-only token and challenges cached write calls", async () => {
    const target = await journey(),
      access = await authorize(target, ownerCookie, ["journey:read"]),
      client = await connect(access.access_token)
    try {
      const tools = await client.listTools()
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "periplus_list_journeys",
        "periplus_get_journey",
        "periplus_get_event",
      ])
      await expect(
        client.callTool({
          name: "periplus_update_journey",
          arguments: {
            journeyId: target.id,
            expectedRevision: 1,
            idempotencyKey: randomUUID(),
            patch: { title: "Denied" },
          },
        })
      ).rejects.toThrow()
      expect((await getRecordingJourney(owner, target.id)).title).toBe(
        target.title
      )
    } finally {
      await client.close()
    }
    const response = await sendPhoto(access.access_token, target)
    expect(response.status).toBe(403)
  })

  it("restricts members to existing content permissions and the authorized Journey", async () => {
    let target = await journey()
    target = (
      await mutateRecordingJourney(owner, target.id, {
        expectedRevision: target.revision,
        idempotencyKey: randomUUID(),
        command: {
          name: "event.add",
          afterEventId: null,
          content: { date: "2026-11-12", title: "Owner" },
        },
      })
    ).journey
    await prisma.journeyMember.create({
      data: { userId: member.userId, journeyId: target.id },
    })
    const access = await authorize(target, memberCookie),
      client = await connect(access.access_token)
    try {
      const denied = await client.callTool({
        name: "periplus_update_event",
        arguments: {
          journeyId: target.id,
          expectedRevision: target.revision,
          idempotencyKey: randomUUID(),
          eventId: target.events[0].id,
          patch: { body: "No" },
        },
      })
      expect(denied.structuredContent).toMatchObject({ code: "FORBIDDEN" })
      const elsewhere = await journey()
      const outside = await client.callTool({
        name: "periplus_get_journey",
        arguments: { journeyId: elsewhere.id },
      })
      expect(outside.structuredContent).toMatchObject({ code: "NOT_FOUND" })
    } finally {
      await client.close()
    }
  })

  it("uploads once, attaches the returned asset, and rejects unrelated staged assets", async () => {
    let target = await journey()
    target = (
      await mutateRecordingJourney(owner, target.id, {
        expectedRevision: target.revision,
        idempotencyKey: randomUUID(),
        command: {
          name: "event.add",
          afterEventId: null,
          content: { date: "2026-11-12" },
        },
      })
    ).journey
    const access = await authorize(target),
      uploadId = randomUUID()
    const first = await sendPhoto(access.access_token, target, uploadId)
    expect(first.status).toBe(201)
    const image = await first.json()
    const replay = await sendPhoto(access.access_token, target, uploadId)
    expect(replay.status).toBe(200)
    expect(await replay.json()).toMatchObject({
      assetId: image.assetId,
      replayed: true,
    })
    expect(
      (
        await sendPhoto(
          access.access_token,
          target,
          uploadId,
          Buffer.from("different")
        )
      ).status
    ).toBe(409)
    const otherAccess = await authorize(target)
    const client = await connect(otherAccess.access_token)
    try {
      const args = {
        journeyId: target.id,
        expectedRevision: target.revision,
        idempotencyKey: randomUUID(),
        eventId: target.events[0].id,
        photos: [{ assetId: image.assetId, caption: "Lunch" }],
        coverAssetId: image.assetId,
      }
      const denied = await client.callTool({
        name: "periplus_set_event_photos",
        arguments: args,
      })
      expect(denied.isError).toBe(true)
    } finally {
      await client.close()
    }
    const allowed = await connect(access.access_token)
    try {
      const result = await allowed.callTool({
        name: "periplus_set_event_photos",
        arguments: {
          journeyId: target.id,
          expectedRevision: target.revision,
          idempotencyKey: randomUUID(),
          eventId: target.events[0].id,
          photos: [{ assetId: image.assetId, caption: "Lunch" }],
          coverAssetId: image.assetId,
        },
      })
      expect(result.isError).not.toBe(true)
      expect(
        (await getRecordingJourney(owner, target.id)).events[0].photos
      ).toMatchObject([
        { assetId: image.assetId, caption: "Lunch", isCover: true },
      ])
    } finally {
      await allowed.close()
    }
  })

  it("enforces expiry, membership removal and account suspension on tokens and refresh", async () => {
    for (const reason of ["expired", "removed", "banned"]) {
      const target = await journey()
      await prisma.journeyMember.create({
        data: { journeyId: target.id, userId: member.userId },
      })
      const access = await authorize(target, memberCookie)
      if (reason === "expired")
        await prisma.agentGrant.update({
          where: { id: access.identity.grant.id },
          data: { expiresAt: new Date(0) },
        })
      if (reason === "removed")
        await prisma.journeyMember.delete({
          where: {
            journeyId_userId: { journeyId: target.id, userId: member.userId },
          },
        })
      if (reason === "banned")
        await prisma.user.update({
          where: { id: member.userId },
          data: { banned: true },
        })
      try {
        await expect(
          authenticateAgent(
            new Request(agentResource, {
              headers: { authorization: `Bearer ${access.access_token}` },
            })
          )
        ).rejects.toThrow()
        expect(
          (
            await tokens({
              grant_type: "refresh_token",
              refresh_token: access.refresh_token!,
            })
          ).status
        ).not.toBe(200)
        expect((await sendPhoto(access.access_token, target)).status).toBe(401)
      } finally {
        if (reason === "banned")
          await prisma.user.update({
            where: { id: member.userId },
            data: { banned: false },
          })
      }
    }
  })

  it("requires real bearer credentials, audience and the application Origin", async () => {
    const anonymous = await mcp(new Request(agentResource, { method: "POST" }))
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get("www-authenticate")).toContain(
      "oauth-protected-resource/api/mcp"
    )
    const target = await journey(),
      access = await authorize(target)
    const foreignOrigin = await mcp(
      new Request(agentResource, {
        method: "POST",
        headers: {
          authorization: `Bearer ${access.access_token}`,
          origin: "https://elsewhere.example",
        },
      })
    )
    expect(foreignOrigin.status).toBe(403)
    const invalidAudience = await tokens({
      grant_type: "refresh_token",
      refresh_token: access.refresh_token!,
      resource: "https://elsewhere.example/api/mcp",
    })
    expect(invalidAudience.status).not.toBe(200)
    const badFormat = await sendPhoto(
      access.access_token,
      target,
      randomUUID(),
      png,
      "text/plain"
    )
    expect(badFormat.status).toBe(415)
  })

  it("checks grant revocation inside the business write transaction and during refresh", async () => {
    const target = await journey(),
      access = await authorize(target)
    await prisma.agentGrant.update({
      where: { id: access.identity.grant.id },
      data: { revokedAt: new Date() },
    })
    await expect(
      mutateRecordingJourney(access.identity.context, target.id, {
        expectedRevision: target.revision,
        idempotencyKey: randomUUID(),
        command: { name: "journey.update", patch: { title: "Late write" } },
      })
    ).rejects.toThrow("no longer active")
    expect((await getRecordingJourney(owner, target.id)).revision).toBe(
      target.revision
    )
    const refresh = await tokens({
      grant_type: "refresh_token",
      refresh_token: access.refresh_token!,
    })
    expect(refresh.status).not.toBe(200)
    expect((await sendPhoto(access.access_token, target)).status).toBe(401)
  })

  it("rejects a changed selection for the same authorization flow", async () => {
    const left = await journey(),
      right = await journey(),
      flow = await begin(ownerCookie)
    const request = (journeyId: string) =>
      new Request(`${origin}/api/agent/authorize`, {
        method: "POST",
        headers: {
          ...Object.fromEntries(cookies(ownerCookie)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          oauthQuery: flow.oauthQuery,
          accept: true,
          journeyId,
          scopes: ["journey:read"],
        }),
      })
    await authorizeAgent(request(left.id))
    await expect(authorizeAgent(request(right.id))).rejects.toThrow("已处理")
    const grant = await prisma.agentGrant.findUnique({
      where: { authorizationKey: authorizationKey(owner.userId, flow.query) },
    })
    expect(grant?.journeyId).toBe(left.id)
  })

  it("rejects cross-Journey transit endpoints through the shared service", async () => {
    let elsewhere = await journey()
    elsewhere = (
      await mutateRecordingJourney(owner, elsewhere.id, {
        expectedRevision: elsewhere.revision,
        idempotencyKey: randomUUID(),
        command: {
          name: "event.add",
          afterEventId: null,
          content: { date: "2026-11-12" },
        },
      })
    ).journey
    const target = await journey()
    await expect(
      mutateRecordingJourney(owner, target.id, {
        expectedRevision: target.revision,
        idempotencyKey: randomUUID(),
        command: {
          name: "event.add",
          afterEventId: null,
          content: {
            category: "TRANSIT",
            date: "2026-11-12",
            transit: {
              fromName: "A",
              toName: "B",
              transportMode: "WALK",
              fromEventId: elsewhere.events[0].id,
            },
          },
        },
      })
    ).rejects.toThrow("Transit endpoints must exist")
  })
})
