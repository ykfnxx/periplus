import { createHash } from "node:crypto"
import {
  McpServer,
  createMcpHandler,
  requireScopes,
  fromJsonSchema,
  type Tool,
  type JsonSchemaType,
  type ToolCallback,
  type CallToolResult,
} from "@modelcontextprotocol/server"
import { z } from "zod"
import { targetDateTimeSchema } from "@/modules/data-model/contracts/common"
import {
  journeyCommandSchema,
  journeyEventSchema,
  eventInputSchema,
  eventDateSchema,
  EVENT_CATEGORIES,
  type JourneyCommand,
  type JourneyEvent,
  type JourneySnapshot,
} from "@/modules/data-model/contracts"
import {
  getRecordingJourney,
  mutateRecordingJourney,
  RecordingNotFoundError,
} from "@/modules/data/journeys/recording-service"
import {
  JourneyInputError,
  JourneyRevisionConflictError,
  JourneyIdempotencyConflictError,
} from "@/modules/data/journeys/journey-repository"
import { PermissionDeniedError } from "@/modules/auth/server/context"
import { AgentAuthorizationError } from "../contracts"
import { type AgentIdentity } from "./access"
import { agentResource } from "./oauth"

const id = z.string().min(1).max(200)
const readInput = z.object({ journeyId: id }).strict()
const agentEventInput = eventInputSchema.omit({ bookingReference: true })
const photoSchema = z
  .object(journeyEventSchema.shape.photos.element.shape)
  .omit({ url: true })
const eventSchema = z
  .object(journeyEventSchema.shape)
  .omit({ receipts: true, bookingReference: true })
  .extend({ photos: z.array(photoSchema) })
const indexSchema = z.object({
  id,
  title: z.string(),
  category: z.enum(EVENT_CATEGORIES),
  date: eventDateSchema,
  canEdit: z.boolean(),
  canRemove: z.boolean(),
  photoCount: z.number(),
  routeState: z.string().optional(),
})
const metadataSchema = z.object({
  id,
  title: z.string(),
  description: z.string(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]),
  revision: z.number(),
})
const writeOutput = z.object({
  journeyId: id,
  revision: z.number(),
  replayed: z.boolean(),
  event: eventSchema.optional(),
  eventIndex: z.array(indexSchema),
  journey: metadataSchema,
})
const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
  issues: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional(),
})

function eventProjection(event: JourneyEvent) {
  const { receipts, bookingReference, photos, ...fields } = event
  void receipts
  void bookingReference
  return {
    ...fields,
    photos: photos.map(({ url, ...photo }) => {
      void url
      return photo
    }),
  }
}
function eventIndex(journey: JourneySnapshot) {
  return journey.events.map((event) => ({
    id: event.id,
    title: event.title,
    category: event.category,
    date: event.date,
    canEdit: event.canEdit,
    canRemove: event.canRemove,
    photoCount: event.photos.length,
    routeState: event.transit?.routeState,
  }))
}
function metadata(journey: JourneySnapshot) {
  return {
    id: journey.id,
    title: journey.title,
    description: journey.description,
    status: journey.status,
    revision: journey.revision,
  }
}
function toolError(error: unknown) {
  if (error instanceof JourneyRevisionConflictError)
    return { code: "REVISION_CONFLICT", message: error.message }
  if (error instanceof JourneyIdempotencyConflictError)
    return { code: "IDEMPOTENCY_CONFLICT", message: error.message }
  if (error instanceof RecordingNotFoundError)
    return { code: "NOT_FOUND", message: error.message }
  if (
    error instanceof PermissionDeniedError ||
    error instanceof AgentAuthorizationError
  )
    return { code: "FORBIDDEN", message: error.message }
  if (error instanceof JourneyInputError)
    return { code: "INVALID_INPUT", message: error.message }
  if (error instanceof z.ZodError)
    return {
      code: "INVALID_INPUT",
      message: "Invalid event content",
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    }
  console.error("Agent tool failed", error)
  throw new Error("The operation failed on the server")
}

export function createAgentMcpServer(identity: AgentIdentity) {
  const server = new McpServer(
    { name: "periplus", version: "1.0.0" },
    {
      instructions:
        "Edit only the authorized Journey. Read its current revision before writing. Dates do not control event order. Replay an uncertain write with the identical idempotencyKey and arguments, then read latest state. Upload images with multipart POST /api/agent/v1/journeys/{journeyId}/photos using file and uploadId and the same OAuth token, then attach assetId with periplus_set_event_photos. Never invent provider hotels, coordinates or resolved routes.",
    }
  )
  const definitions: (Tool & { write: boolean })[] = []
  async function read(journeyId: string) {
    if (journeyId !== identity.grant.journeyId)
      throw new RecordingNotFoundError()
    return getRecordingJourney(identity.context, journeyId)
  }
  function register<I extends z.ZodObject, O extends z.ZodType>(
    name: string,
    description: string,
    inputSchema: I,
    successSchema: O,
    action: (input: z.output<I>) => Promise<z.output<O>>,
    write = false
  ) {
    const outputJson = {
      type: "object" as const,
      ...z.toJSONSchema(z.union([successSchema, errorSchema]), {
        io: "input",
        override: ({ zodSchema, jsonSchema }) => {
          // Domain timestamps accept epochs at input but always serialize as ISO strings.
          if (zodSchema === targetDateTimeSchema) {
            delete jsonSchema.anyOf
            jsonSchema.type = "string"
            jsonSchema.format = "date-time"
          }
        },
      }),
    }
    const outputSchema = fromJsonSchema(outputJson as JsonSchemaType)
    const annotations = {
      readOnlyHint: !write,
      destructiveHint: write && name !== "periplus_create_event",
      idempotentHint: true,
      openWorldHint: false,
    }
    const callback = async (input: z.output<I>): Promise<CallToolResult> => {
      try {
        const structuredContent = (await action(
          input as z.output<I>
        )) as Record<string, unknown>
        return {
          resultType: "complete",
          content: [
            {
              type: "text",
              text: write ? "Saved to Journey." : "Journey data returned.",
            },
          ],
          structuredContent,
        }
      } catch (error) {
        const structuredContent = toolError(error)
        return {
          resultType: "complete",
          isError: true,
          content: [{ type: "text", text: structuredContent.message }],
          structuredContent,
        }
      }
    }
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        outputSchema,
        annotations,
        scopeChallenge: write ? requireScopes("journey:write") : undefined,
      },
      callback as ToolCallback<I>
    )
    definitions.push({
      name,
      description,
      inputSchema: server.toolInputSchemaJson(name) as Tool["inputSchema"],
      outputSchema: outputJson as Tool["outputSchema"],
      annotations,
      write,
    })
  }
  register(
    "periplus_list_journeys",
    "List the single authorized Journey.",
    z.object({}).strict(),
    z.object({ journeys: z.array(metadataSchema) }),
    async () => ({ journeys: [metadata(await read(identity.grant.journeyId))] })
  )
  register(
    "periplus_get_journey",
    "Read Journey metadata, current revision and ordered event index.",
    readInput,
    z.object({ journey: metadataSchema, eventIndex: z.array(indexSchema) }),
    async ({ journeyId }) => {
      const journey = await read(journeyId)
      return { journey: metadata(journey), eventIndex: eventIndex(journey) }
    }
  )
  register(
    "periplus_get_event",
    "Read an event and its complete photo membership. File bytes and receipts are omitted.",
    readInput.extend({ eventId: id }),
    z.object({ journeyId: id, revision: z.number(), event: eventSchema }),
    async ({ journeyId, eventId }) => {
      const journey = await read(journeyId),
        event = journey.events.find((item) => item.id === eventId)
      if (!event) throw new RecordingNotFoundError()
      return {
        journeyId,
        revision: journey.revision,
        event: eventProjection(event),
      }
    }
  )
  const mutations = [
    [
      "periplus_update_journey",
      "journey.update",
      "Update Journey title, description or status.",
    ],
    [
      "periplus_create_event",
      "event.add",
      "Create VISIT, MEAL, STAY or TRANSIT. Date and category are required. afterEventId null inserts first.",
    ],
    [
      "periplus_update_event",
      "event.update",
      "Patch only supplied event fields. Location/category changes can clear provider details and invalidate routes.",
    ],
    [
      "periplus_move_event",
      "event.move",
      "Move an event after another event, or first with afterEventId null.",
    ],
    [
      "periplus_remove_event",
      "event.remove",
      "Remove an event subject to current author and execution constraints.",
    ],
    [
      "periplus_set_event_photos",
      "photos.set",
      "Replace ONE event's COMPLETE ordered photo membership. Preserve photos you are not detaching; coverAssetId must belong to the submitted list.",
    ],
    [
      "periplus_update_photo",
      "photo.update",
      "Patch a photo caption or location.",
    ],
    [
      "periplus_move_photo",
      "photo.move",
      "Move a photo between two events within this Journey.",
    ],
  ] as const
  for (const [name, commandName, description] of mutations) {
    const commandSchema = journeyCommandSchema.options.find(
      (option) => option.shape.name.value === commandName
    )!
    let input: z.ZodObject = (commandSchema as z.ZodObject)
      .omit({ name: true })
      .extend({
        journeyId: id,
        expectedRevision: z.number().int().nonnegative(),
        idempotencyKey: id,
      })
      .strict()
    if (commandName === "event.add")
      input = input.omit({ receipt: true }).extend({
        content: agentEventInput.extend({
          date: eventDateSchema,
          category: z.enum(EVENT_CATEGORIES),
        }),
      })
    if (commandName === "event.update")
      input = input.extend({
        patch: agentEventInput.refine(
          (value) => Object.keys(value).length > 0,
          "At least one field must be supplied"
        ),
      })
    register(
      name,
      description,
      input,
      writeOutput,
      async (args) => {
        const { journeyId, expectedRevision, idempotencyKey, ...fields } = args
        if (journeyId !== identity.grant.journeyId)
          throw new RecordingNotFoundError()
        const key = createHash("sha256")
          .update(JSON.stringify([identity.grant.id, idempotencyKey]))
          .digest("hex")
        const result = await mutateRecordingJourney(
          identity.context,
          journeyId,
          {
            expectedRevision,
            idempotencyKey: `agent-${key}`,
            command: { name: commandName, ...fields } as JourneyCommand,
          }
        )
        const event = result.journey.events.find(
          (item) => item.id === result.eventId
        )
        return {
          journeyId,
          revision: result.journey.revision,
          replayed: result.replayed,
          ...(event ? { event: eventProjection(event) } : {}),
          eventIndex: eventIndex(result.journey),
          journey: metadata(result.journey),
        }
      },
      true
    )
  }
  // Keep write handlers registered for scope challenges, while hiding them from read-only discovery.
  server.server.setRequestHandler("tools/list", () => ({
    tools: definitions
      .filter(
        (tool) => !tool.write || identity.scopes.includes("journey:write")
      )
      .map(({ write, ...tool }) => {
        void write
        return tool
      }),
  }))
  return server
}

export function agentMcpHandler(identity: AgentIdentity) {
  return createMcpHandler(() => createAgentMcpServer(identity), {
    legacy: "stateless",
    onerror: (error) => console.error("MCP request failed", error),
  })
}
export function mcpAuthInfo(identity: AgentIdentity) {
  return {
    token: identity.token,
    clientId: identity.grant.clientId,
    scopes: identity.scopes,
    resource: new URL(agentResource),
    resourceMetadataUrl: new URL(
      "/.well-known/oauth-protected-resource/api/mcp",
      agentResource
    ).href,
  }
}
