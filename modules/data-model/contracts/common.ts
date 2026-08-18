import { z } from "zod"

export const targetIdSchema = z.string().trim().min(1)

const MIN_DATE_TIMESTAMP = -8_640_000_000_000_000
const MAX_DATE_TIMESTAMP = 8_640_000_000_000_000

export function dateTimeToTimestamp(value: string | number | Date) {
  const timestamp =
    value instanceof Date
      ? value.getTime()
      : typeof value === "number"
        ? value
        : Date.parse(value)
  if (
    !Number.isInteger(timestamp) ||
    timestamp < MIN_DATE_TIMESTAMP ||
    timestamp > MAX_DATE_TIMESTAMP
  ) {
    throw new RangeError(
      "date-time must identify a valid millisecond timestamp"
    )
  }
  return timestamp
}

export function dateTimeFromTimestamp(value: string | number | Date) {
  return new Date(dateTimeToTimestamp(value)).toISOString()
}

// JSON may submit an offset-aware ISO value or epoch milliseconds. The
// canonical contract always emits UTC ISO while persistence and validation use
// the parsed millisecond timestamp.
export const targetDateTimeSchema = z
  .union([
    z.iso.datetime({ offset: true }),
    z.number().int().min(MIN_DATE_TIMESTAMP).max(MAX_DATE_TIMESTAMP),
  ])
  .transform(dateTimeFromTimestamp)

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
