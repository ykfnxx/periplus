import type { RecordingStore } from "./recording-session"
import type { ReceiptFormValues } from "../model/receipt-draft"
import {
  confirmedReceiptFields,
  receiptFormValues,
} from "../model/receipt-draft"
export function createReceiptActions(store: RecordingStore) {
  return {
    upload: (file: File, uploadId: string) =>
      store.getState().uploadReceipt(file, uploadId),
    recognize: async (assetId: string) =>
      receiptFormValues(
        (await store.getState().recognizeReceipt(assetId)).fields
      ),
    update: (eventId: string, receiptId: string, values: ReceiptFormValues) =>
      store
        .getState()
        .mutate({
          name: "receipt.update",
          eventId,
          receiptId,
          fields: confirmedReceiptFields(values),
        }),
    remove: (eventId: string, receiptId: string) =>
      store.getState().mutate({ name: "receipt.remove", eventId, receiptId }),
    async save(
      review: { assetId: string; values: ReceiptFormValues },
      eventId: string | null,
      saveKey: string
    ) {
      const fields = confirmedReceiptFields(review.values)
      const receipt = { assetId: review.assetId, ...fields }
      const result = await store.getState().mutate(
        eventId
          ? { name: "receipt.add", eventId, receipt }
          : {
              name: "event.add",
              afterEventId: store.getState().journey!.events.at(-1)?.id || null,
              content: {
                title: fields.merchant || "账单",
                date: fields.date || new Date().toLocaleDateString("en-CA"),
              },
              receipt,
            },
        saveKey
      )
      const persistedEvent = result.journey.events.find((entry) =>
        entry.receipts?.some((item) => item.assetId === review.assetId)
      )
      const persisted = persistedEvent?.receipts?.find(
        (item) => item.assetId === review.assetId
      )
      if (!persistedEvent || !persisted)
        throw new Error("尚未确认账单保存结果，请重试。")
      if (
        Object.entries(fields).some(
          ([key, value]) =>
            JSON.stringify(persisted[key as keyof typeof fields]) !==
            JSON.stringify(value)
        )
      )
        await store.getState().mutate({
          name: "receipt.update",
          eventId: persistedEvent.id,
          receiptId: persisted.id,
          fields,
        })
      return persistedEvent.id
    },
  }
}
