import { z } from "zod"
import { planningEditSchema } from "../contracts"

export const planningTurnOutputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("changes"),
      operations: z.array(planningEditSchema),
      constraints: z.array(
        z
          .object({
            id: z.string().min(1),
            text: z.string().min(1),
            hard: z.boolean(),
            satisfied: z.boolean().nullable(),
            verificationRequired: z.boolean(),
          })
          .strict()
      ),
      unverified: z.array(z.string()),
      sources: z.array(
        z.intersection(
          z.object({
            operation: z.number().int().nonnegative(),
            path: z.string().min(1),
          }),
          z.discriminatedUnion("kind", [
            z.object({ kind: z.literal("user"), quote: z.string().min(1) }),
            z.object({
              kind: z.literal("existing"),
              eventId: z.string().min(1),
              field: z.string().min(1),
            }),
            z.object({
              kind: z.literal("provider"),
              provider: z.literal("amap"),
              policyId: z.string().min(1),
              factRef: z.string().min(1),
            }),
          ])
        )
      ),
    })
    .strict(),
  z
    .object({
      kind: z.literal("question"),
      message: z.string().trim().min(1).max(4000),
      choices: z
        .array(
          z
            .object({
              choiceRef: z.string().min(1).max(200),
              label: z.string().min(1).max(300),
            })
            .strict()
        )
        .max(5),
    })
    .strict(),
])

export const finishTurnParameters = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["changes", "question"] },
    operations: z.toJSONSchema(z.array(planningEditSchema), {
      io: "input",
      unrepresentable: "any",
    }),
    constraints: z.toJSONSchema(
      planningTurnOutputSchema.options[0].shape.constraints
    ),
    unverified: { type: "array", items: { type: "string" } },
    sources: z.toJSONSchema(planningTurnOutputSchema.options[0].shape.sources),
    message: { type: "string" },
    choices: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          choiceRef: { type: "string" },
          label: { type: "string" },
        },
        required: ["choiceRef", "label"],
        additionalProperties: false,
      },
    },
  },
  required: ["kind"],
  additionalProperties: false,
}
