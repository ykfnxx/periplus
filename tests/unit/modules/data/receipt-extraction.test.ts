// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  extractReceiptFields,
  parsePaddleReceipt,
} from "@/modules/data/receipts/receipt-extraction"
const lines = (...texts: string[]) =>
  texts.map((text) => ({ text, confidence: 0.98 }))
describe("local OCR bill interpretation", () => {
  it("leaves ambiguous currencies and absent values blank instead of inventing bill facts", () => {
    expect(
      extractReceiptFields(lines("Corner Cafe", "Total $12.50"))
    ).toMatchObject({
      merchant: "Corner Cafe",
      total: "12.50",
      currency: null,
      date: null,
    })
    expect(extractReceiptFields([])).toEqual({
      merchant: null,
      date: null,
      total: null,
      currency: null,
      items: [],
    })
    expect(
      extractReceiptFields(
        lines("Cafe", "2026-02-30", "SUBTOTAL 10.00", "TAX 1.00")
      )
    ).toMatchObject({ date: null, total: null })
  })
  it("keeps decimal text exact and recognizes explicit currency and calendar labels", () => {
    expect(
      extractReceiptFields(
        lines("湖边餐厅", "2026年10月28日", "CNY", "合计", "900719925.12")
      )
    ).toMatchObject({
      date: "2026-10-28",
      currency: "CNY",
      total: "900719925.12",
    })
  })
  it("joins detected cells on a row and rejects malformed provider results", () => {
    expect(
      parsePaddleReceipt({
        errorCode: 0,
        result: {
          ocrResults: [
            {
              prunedResult: {
                rec_texts: ["12.50", "TOTAL", "Cafe"],
                rec_scores: [0.9, 0.99, 0.97],
                rec_boxes: [
                  [100, 50, 140, 70],
                  [10, 50, 60, 70],
                  [10, 10, 60, 30],
                ],
              },
            },
          ],
        },
      }).map((line) => line.text)
    ).toEqual(["Cafe", "TOTAL 12.50"])
    expect(() =>
      parsePaddleReceipt({
        errorCode: 0,
        result: {
          ocrResults: [{ prunedResult: { rec_texts: ["x"], rec_scores: [] } }],
        },
      })
    ).toThrow("could not be recognized")
  })
})
