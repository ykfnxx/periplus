import { z } from "zod"
import { targetIdSchema as id } from "./common"

export const contributorSchema = z
  .object({
    userId: id,
    name: z.string(),
    image: z.string().nullable(),
  })
  .strict()

// Decimal strings keep the confirmed amount exactly as entered, without float rounding.
export const receiptAmountSchema = z.string().regex(/^\d{1,12}(?:\.\d{1,4})?$/)
export const receiptFieldsSchema = z
  .object({
    merchant: z.string().trim().max(300).nullable(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const parsed = new Date(`${value}T00:00:00Z`)
        return (
          Number.isFinite(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === value
        )
      })
      .nullable(),
    total: receiptAmountSchema.nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    items: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(500),
            quantity: z.string().max(100).nullable(),
            amount: receiptAmountSchema.nullable(),
          })
          .strict()
      )
      .max(200),
  })
  .strict()
export const receiptInputSchema = receiptFieldsSchema.extend({ assetId: id })
export const recordingReceiptSchema = receiptInputSchema.extend({
  id,
  url: z.string(),
  source: contributorSchema,
  canEdit: z.boolean(),
})
export const receiptExtractionRequestSchema = z.object({ assetId: id }).strict()
export const receiptExtractionSchema = z
  .object({
    assetId: id,
    fields: receiptFieldsSchema,
    lines: z.array(
      z
        .object({ text: z.string(), confidence: z.number().min(0).max(1) })
        .strict()
    ),
  })
  .strict()
export type Contributor = z.infer<typeof contributorSchema>
export type ReceiptFields = z.infer<typeof receiptFieldsSchema>
export type ReceiptInput = z.infer<typeof receiptInputSchema>
export type RecordingReceipt = z.infer<typeof recordingReceiptSchema>
export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>
