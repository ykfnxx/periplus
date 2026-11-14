"use client"
import type { Receipt } from "@/modules/data-model/contracts/receipts"
import type { RecordingStore } from "../application/recording-session"
import { createReceiptActions } from "../application/receipts"
import ReceiptDetails from "../ui/receipts/ReceiptDetails"
import RevisionReload from "./RevisionReload"
export default function ReceiptDetailsController({
  receipt,
  eventId,
  store,
  onClose,
}: {
  receipt: Receipt
  eventId: string
  store?: RecordingStore
  onClose: () => void
}) {
  const actions = store && createReceiptActions(store)
  return (
    <ReceiptDetails
      receipt={receipt}
      onClose={onClose}
      renderRevision={(onReload) =>
        store && <RevisionReload store={store} onReload={onReload} />
      }
      actions={
        actions && {
          save: (values) => actions.update(eventId, receipt.id, values),
          remove: () => actions.remove(eventId, receipt.id),
        }
      }
    />
  )
}
