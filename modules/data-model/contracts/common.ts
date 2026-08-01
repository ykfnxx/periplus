import { z } from "zod"

export const targetIdSchema = z.string().trim().min(1)
export const targetDateTimeSchema = z.iso.datetime({ offset: true })

export const targetActorReferenceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("USER"),
      userId: targetIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("AGENT"),
      agentRunId: targetIdSchema,
    })
    .strict(),
  z.object({ kind: z.literal("SYSTEM") }).strict(),
])

export type TargetActorReference = z.infer<typeof targetActorReferenceSchema>
