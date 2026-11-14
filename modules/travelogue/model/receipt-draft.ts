import {
  receiptFieldsSchema,
  type ReceiptFields,
} from "@/modules/data-model/contracts/receipts"
// Form amounts remain strings while typing; conversion happens on confirmation.
export type ReceiptFormValues = {
  merchant: string
  date: string
  currency: string
  total: string
  items: { name: string; quantity: string; amount: string }[]
}

export function receiptFormValues(fields: ReceiptFields): ReceiptFormValues {
  return {
    merchant: fields.merchant || "",
    date: fields.date || "",
    currency: fields.currency || "",
    total: fields.total || "",
    items: fields.items.map((item) => ({
      name: item.name,
      quantity: item.quantity || "",
      amount: item.amount || "",
    })),
  }
}

export function confirmedReceiptFields(
  value: ReceiptFormValues
): ReceiptFields {
  const result = receiptFieldsSchema.safeParse({
    merchant: value.merchant.trim() || null,
    date: value.date || null,
    total: value.total.trim() || null,
    currency: value.currency.trim().toUpperCase() || null,
    items: value.items.map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity.trim() || null,
      amount: item.amount.trim() || null,
    })),
  })
  if (!result.success) {
    const field = result.error.issues[0]?.path[0]
    if (field === "total" || field === "items")
      throw new Error("请检查消费明细和金额，金额使用数字及小数点填写。")
    if (field === "currency")
      throw new Error("币种请填写三个英文字母，例如 CNY。")
    throw new Error("请检查店名与账单日期。")
  }
  return result.data
}

export function receiptTotal(
  fields: Pick<ReceiptFields, "total" | "currency">
) {
  return fields.total === null
    ? "金额待补"
    : `${fields.currency ? `${fields.currency} ` : ""}${fields.total}`
}

export function receiptCardTotal(
  fields: Pick<ReceiptFields, "total" | "currency">
) {
  return fields.currency === "CNY" && fields.total !== null
    ? `¥${fields.total}`
    : receiptTotal(fields)
}

export type ReceiptReview = { assetId: string; values: ReceiptFormValues }
export const emptyReceiptValues: ReceiptFormValues = {
  merchant: "",
  date: "",
  currency: "",
  total: "",
  items: [],
}
