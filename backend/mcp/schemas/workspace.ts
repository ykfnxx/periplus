import { z } from "zod"

export const workspaceContextInputSchema = z.object({}).strict()

export const journeyProjectionInputSchema = z
  .object({
    scopeCityCardId: z.string().trim().min(1).nullable(),
  })
  .strict()

export const journeyCurrentValidationInputSchema = z
  .object({
    expectedWorkspaceRevision: z.number().int().nonnegative(),
  })
  .strict()
