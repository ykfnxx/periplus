import { describe, expect, it } from "vitest"
import {
  confirmedReceiptFields,
  receiptFormValues,
  receiptTotal,
} from "@/modules/travelogue/ui/receipt-display"

describe("confirming receipt information", () => {
  it("keeps monetary precision from recognition through manual confirmation", () => {
    const recognized = {
      merchant: "西湖茶馆",
      date: "2026-10-28",
      currency: "CNY",
      total: "999999999999.9999",
      items: [{ name: "茶饮", quantity: "2 杯", amount: "0.0001" }],
    }
    const form = receiptFormValues(recognized)
    form.merchant = "湖边茶馆"
    const confirmed = confirmedReceiptFields(form)
    expect(confirmed).toEqual({ ...recognized, merchant: "湖边茶馆" })
    expect(receiptTotal(confirmed)).toBe("CNY 999999999999.9999")
  })

  it("allows an incomplete record without inventing a date, currency or amount", () => {
    const confirmed = confirmedReceiptFields({
      merchant: "",
      date: "",
      currency: "",
      total: "",
      items: [],
    })
    expect(confirmed).toEqual({
      merchant: null,
      date: null,
      currency: null,
      total: null,
      items: [],
    })
    expect(receiptTotal(confirmed)).toBe("金额待补")
  })

  it("preserves an explicitly entered zero instead of treating it as missing", () => {
    const confirmed = confirmedReceiptFields({
      merchant: "茶馆",
      date: "",
      currency: "cny",
      total: "0.00",
      items: [{ name: "赠饮", quantity: "1", amount: "0.00" }],
    })
    expect(confirmed.total).toBe("0.00")
    expect(confirmed.items[0].amount).toBe("0.00")
    expect(confirmed.currency).toBe("CNY")
  })

  it.each(["NaN", "1,000.00", "-1", "1.23456"])(
    "asks for correction rather than silently coercing invalid amount %s",
    (total) => {
      expect(() =>
        confirmedReceiptFields({
          merchant: "茶馆",
          date: "",
          currency: "CNY",
          total,
          items: [],
        })
      ).toThrow("金额")
    }
  )

  it("rejects an impossible date and a partially entered currency", () => {
    const input = {
      merchant: "茶馆",
      date: "2026-02-30",
      currency: "CNY",
      total: "92.00",
      items: [],
    }
    expect(() => confirmedReceiptFields(input)).toThrow("日期")
    expect(() =>
      confirmedReceiptFields({ ...input, date: "", currency: "CN" })
    ).toThrow("币种")
  })
})
