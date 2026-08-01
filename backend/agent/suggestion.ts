import { z } from "zod"
import { targetCommandBodySchema } from "@/modules/data-model/contracts"

const suggestionSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string(),
  basedOnWorkspaceRevision: z.number().int().nonnegative(),
  commands: z.array(
    z.object({
      expectedRevision: z.number().int().nonnegative(),
      idempotencyKey: z.string().trim().min(1),
      command: targetCommandBodySchema,
    })
  ),
})

function findJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1]
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

export function parseSuggestion(text: string) {
  const parsed = suggestionSchema.parse(JSON.parse(findJsonObject(text)))
  return {
    title: parsed.title,
    summary: parsed.summary,
    basedOnWorkspaceRevision: parsed.basedOnWorkspaceRevision,
    commandPayloads: parsed.commands,
  }
}
