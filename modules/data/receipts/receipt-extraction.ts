import { z } from "zod"
import { periplusServerConfig } from "@/config/periplus.server"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  receiptExtractionRequestSchema,
  receiptFieldsSchema,
  receiptAmountSchema,
  type ReceiptExtraction,
} from "@/modules/data-model/contracts"
import { getAssetRecord } from "@/modules/data/assets/asset-repository"
import {
  assetOperator,
  assertObjectKey,
} from "@/modules/data/assets/object-storage"
import {
  AssetInputError,
  AssetStorageError,
} from "@/modules/data/assets/asset-contract"
import { RecordingNotFoundError } from "@/modules/data/journeys/recording-service"

export class ReceiptOcrError extends Error {
  constructor(readonly code: "OCR_UNAVAILABLE" | "OCR_FAILED") {
    super(
      code === "OCR_UNAVAILABLE"
        ? "Bill recognition is temporarily unavailable; you can retry or enter the fields manually"
        : "The bill could not be recognized; you can retry or enter the fields manually"
    )
  }
}
const paddleResponse = z.object({
  errorCode: z.number(),
  result: z
    .object({
      ocrResults: z
        .array(
          z.object({
            prunedResult: z.object({
              rec_texts: z.array(z.string().max(5000)).max(2000),
              rec_scores: z.array(z.number().finite().min(0).max(1)).max(2000),
              rec_boxes: z
                .array(z.array(z.number().finite()).length(4))
                .max(2000)
                .optional(),
            }),
          })
        )
        .max(1),
    })
    .optional(),
})

function amount(text: string) {
  const value = text
    .replace(/[,，]/g, "")
    .match(/(?:^|[^\d.])(\d{1,12}(?:\.\d{1,4})?)\s*(?:元)?\s*$/)?.[1]
  return value && receiptAmountSchema.safeParse(value).success ? value : null
}

// OCR supplies text, not reliable bill semantics. Extract only explicit labels;
// ambiguous currencies and absent values remain null for the confirmation form.
export function extractReceiptFields(lines: ReceiptExtraction["lines"]) {
  const texts = lines.map((line) => line.text.trim()).filter(Boolean)
  const all = texts.join("\n")
  const calendar = all.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日)?/)
  const candidateDate = calendar
    ? `${calendar[1]}-${calendar[2]!.padStart(2, "0")}-${calendar[3]!.padStart(2, "0")}`
    : null
  const validDate = receiptFieldsSchema.shape.date.safeParse(candidateDate)
  const currencies: Array<[RegExp, string]> = [
    [/\bUSD\b|US\$/i, "USD"],
    [/\bSGD\b|S\$/i, "SGD"],
    [/\bAUD\b|A\$/i, "AUD"],
    [/\bCNY\b|\bRMB\b|人民币/i, "CNY"],
    [/\bJPY\b|日元/i, "JPY"],
    [/\bEUR\b|€/i, "EUR"],
    [/\bGBP\b|£/i, "GBP"],
    [/\bHKD\b|HK\$/i, "HKD"],
  ]
  const matched = currencies.filter(([pattern]) => pattern.test(all))
  const totalLabel =
    /实付|实收|应付|总额|总计|合计|AMOUNT\s+DUE|GRAND\s+TOTAL|^TOTAL\b/i
  let total: string | null = null
  for (let index = 0; index < texts.length; index++) {
    if (
      !totalLabel.test(texts[index]!) ||
      /优惠|找零|SUBTOTAL/i.test(texts[index]!)
    )
      continue
    total = amount(texts[index]!) ?? amount(texts[index + 1] ?? "") ?? total
  }
  const merchant =
    texts
      .slice(0, 4)
      .find(
        (text) =>
          /[\p{L}]/u.test(text) &&
          !/收据|小票|发票|RECEIPT|INVOICE|欢迎|WELCOME|日期|时间|DATE|TIME|电话|TEL/i.test(
            text
          ) &&
          !/20\d{2}[-/.年]/.test(text)
      ) ?? null
  const items: Array<{
    name: string
    quantity: string | null
    amount: string | null
  }> = []
  for (const text of texts) {
    if (
      totalLabel.test(text) ||
      /找零|优惠|税|TAX|CHANGE|CASH|CARD|BALANCE|电话|地址|TEL|DATE|TIME|20\d{2}[-/.年]/i.test(
        text
      )
    )
      continue
    const item = text.match(
      /^(.+?)\s+(?:(\d+(?:\.\d+)?)\s+)?(?:[￥¥$€£]\s*)?(\d{1,12}\.\d{1,4})\s*$/
    )
    if (item && /[\p{L}]/u.test(item[1]!))
      items.push({
        name: item[1]!.slice(0, 500),
        quantity: item[2] ?? null,
        amount: item[3]!,
      })
  }
  return receiptFieldsSchema.parse({
    merchant: merchant?.slice(0, 300) ?? null,
    date: validDate.success ? validDate.data : null,
    total,
    currency: matched.length === 1 ? matched[0]![1] : null,
    items: items.slice(0, 200),
  })
}

export function parsePaddleReceipt(
  payload: unknown
): ReceiptExtraction["lines"] {
  const parsed = paddleResponse.safeParse(payload)
  if (
    !parsed.success ||
    parsed.data.errorCode !== 0 ||
    !parsed.data.result?.ocrResults[0]
  )
    throw new ReceiptOcrError("OCR_FAILED")
  const result = parsed.data.result.ocrResults[0].prunedResult
  if (result.rec_texts.length !== result.rec_scores.length)
    throw new ReceiptOcrError("OCR_FAILED")
  // Paddle returns boxes in image coordinates. Join cells on the same row so
  // a separate amount column can be shown and extracted alongside its label.
  const words = result.rec_texts.map((text, index) => ({
    text,
    confidence: result.rec_scores[index]!,
    box: result.rec_boxes?.[index],
  }))
  if (!result.rec_boxes || result.rec_boxes.length !== words.length)
    return words.map(({ text, confidence }) => ({ text, confidence }))
  words.sort((a, b) => a.box![1]! - b.box![1]! || a.box![0]! - b.box![0]!)
  const rows: (typeof words)[] = []
  for (const word of words) {
    const center = (word.box![1]! + word.box![3]!) / 2
    const row = rows.find((row) => {
      const box = row[0]!.box!
      return (
        Math.abs(center - (box[1]! + box[3]!) / 2) <
        Math.max(4, (box[3]! - box[1]!) * 0.5)
      )
    })
    if (row) row.push(word)
    else rows.push([word])
  }
  return rows.map((row) => ({
    text: row
      .sort((a, b) => a.box![0]! - b.box![0]!)
      .map((word) => word.text)
      .join(" "),
    confidence:
      row.reduce((sum, word) => sum + word.confidence, 0) / row.length,
  }))
}

export async function extractReceipt(
  context: AuthContext,
  input: unknown,
  signal?: AbortSignal
): Promise<ReceiptExtraction> {
  const { assetId } = receiptExtractionRequestSchema.parse(input)
  const asset = await getAssetRecord(context, assetId, "IMAGE")
  if (!asset) throw new RecordingNotFoundError()
  if (
    asset.sizeBytes > 20 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)
  )
    throw new AssetInputError(
      "Bill recognition accepts JPEG, PNG or WebP images up to 20 MB"
    )
  let bytes: Buffer
  try {
    assertObjectKey(asset.storageKey)
    bytes = await assetOperator().read(asset.storageKey)
  } catch {
    throw new AssetStorageError()
  }
  let payload: unknown
  try {
    const response = await fetch(periplusServerConfig.ocr.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file: bytes.toString("base64"),
        fileType: 1,
        visualize: false,
      }),
      signal: AbortSignal.any([
        AbortSignal.timeout(periplusServerConfig.ocr.timeoutMs),
        ...(signal ? [signal] : []),
      ]),
    })
    if (!response.ok)
      throw new ReceiptOcrError(
        response.status >= 500 ? "OCR_UNAVAILABLE" : "OCR_FAILED"
      )
    payload = await response.json()
  } catch (error) {
    if (error instanceof ReceiptOcrError) throw error
    throw new ReceiptOcrError("OCR_UNAVAILABLE")
  }
  const lines = parsePaddleReceipt(payload)
  return { assetId, fields: extractReceiptFields(lines), lines }
}
