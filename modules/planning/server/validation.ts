import { isDeepStrictEqual } from "node:util"
import { z } from "zod"
import type { JourneySnapshot } from "@/modules/data-model/contracts"
import { planningEditSchema, type PlanningEdit } from "../contracts"
import type {
  PlanningFieldSource,
  PlanningProviderFact,
  PlanningRuntime,
  PlanningRuntimeResult,
} from "./runtime-contract"
import { PlanningError } from "./errors"
const text = z.string().min(1).max(10000)
const constraintSchema = z
  .object({
    id: text,
    text,
    hard: z.boolean(),
    satisfied: z.boolean().nullable(),
    verificationRequired: z.boolean(),
  })
  .strict()
export const turnOutputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("changes"),
      operations: z.array(planningEditSchema).max(200),
      constraints: z.array(constraintSchema).max(100),
      unverified: z.array(text).max(100),
      sources: z
        .array(
          z.discriminatedUnion("kind", [
            z
              .object({
                operation: z.number().int().nonnegative(),
                path: text,
                kind: z.literal("user"),
                quote: text,
              })
              .strict(),
            z
              .object({
                operation: z.number().int().nonnegative(),
                path: text,
                kind: z.literal("existing"),
                eventId: text,
                field: text,
              })
              .strict(),
            z
              .object({
                operation: z.number().int().nonnegative(),
                path: text,
                kind: z.literal("provider"),
                provider: text,
                policyId: text,
                factRef: text,
              })
              .strict(),
          ])
        )
        .max(2000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("question"),
      message: text,
      choices: z
        .array(z.object({ choiceRef: text, label: text }).strict())
        .max(10),
    })
    .strict(),
])
// Dotted source paths are data keys, never evaluated as expressions.
function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce(
      (current: unknown, key) =>
        current && typeof current === "object"
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value
    )
}
function leaves(
  value: unknown,
  prefix: string
): { path: string; value: unknown }[] {
  if (value === null || value === undefined) return []
  if (typeof value !== "object") return [{ path: prefix, value }]
  return Object.entries(value).flatMap(([key, child]) =>
    leaves(child, `${prefix}.${key}`)
  )
}
const equal = isDeepStrictEqual
export function validateFieldSources(
  operations: PlanningEdit[],
  sources: PlanningFieldSource[],
  facts: PlanningProviderFact[],
  messages: string[],
  base: JourneySnapshot,
  runtime: Pick<PlanningRuntime, "canRetain">
) {
  const usedFacts = new Map<string, PlanningProviderFact>()
  for (const [index, operation] of operations.entries()) {
    const command = operation.command
    if (command.name !== "event.add" && command.name !== "event.update")
      continue
    const prefix = command.name === "event.add" ? "content" : "patch"
    const fields =
      command.name === "event.add" ? command.content : command.patch
    for (const leaf of leaves(fields, prefix)) {
      // References and enums encode arrangement rather than external facts.
      if (
        /\.(category|transportMode|requestMode|preference|fromEventId|toEventId|draftRef|coordinateSystem)$/.test(
          leaf.path
        )
      )
        continue
      const source = sources
        .filter(
          (s) =>
            s.operation === index &&
            (s.path === leaf.path || leaf.path.startsWith(`${s.path}.`))
        )
        .sort((a, b) => b.path.length - a.path.length)[0]
      if (!source)
        throw new PlanningError(
          "PREVIEW_REQUIRED",
          `Missing source for operation ${index} ${leaf.path}`,
          422
        )
      const sourceValue = at(command, source.path)
      if (source.kind === "user") {
        if (!messages.some((message) => message.includes(source.quote)))
          throw new PlanningError(
            "PREVIEW_REQUIRED",
            "Source is not in the user's request",
            422
          )
        if (
          leaf.path.includes(".location.") &&
          !source.quote.includes(String(leaf.value))
        )
          throw new PlanningError(
            "PREVIEW_REQUIRED",
            "Location fact is not stated by the user",
            422
          )
      } else if (source.kind === "existing") {
        const event = base.events.find((e) => e.id === source.eventId)
        if (!event || !equal(at(event, source.field), sourceValue))
          throw new PlanningError(
            "PREVIEW_REQUIRED",
            "Existing-event source no longer matches",
            422
          )
      } else {
        const fact = facts.find(
          (f) =>
            f.factRef === source.factRef &&
            f.provider === source.provider &&
            f.policyId === source.policyId
        )
        if (
          !fact ||
          !equal(fact.value, sourceValue) ||
          !runtime.canRetain(fact)
        )
          throw new PlanningError(
            "PREVIEW_REQUIRED",
            "Field retention is not authorized",
            422
          )
        usedFacts.set(fact.factRef, fact)
      }
    }
  }
  return [...usedFacts.values()]
}
export function validateRuntimeResult(
  result: PlanningRuntimeResult,
  messages: string[],
  base: JourneySnapshot
) {
  const output = turnOutputSchema.parse(result.output)
  const persisted = JSON.stringify(output)
  const userText = messages.join("\n")
  const existingText = JSON.stringify(base.events)
  for (const { value } of result.displayOnlyValues.flatMap((value) =>
    leaves(value, "")
  )) {
    if (
      (typeof value !== "string" && typeof value !== "number") ||
      String(value).length === 0
    )
      continue
    if (
      userText.includes(String(value)) ||
      existingText.includes(JSON.stringify(value))
    )
      continue
    if (
      persisted.includes(JSON.stringify(value)) ||
      (typeof value === "string" && persisted.includes(value))
    )
      throw new PlanningError(
        "PREVIEW_REQUIRED",
        "Display-only place data cannot be retained",
        422
      )
  }
  return output
}
