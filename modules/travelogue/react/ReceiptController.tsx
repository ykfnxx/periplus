"use client"
import { useState, useSyncExternalStore, type ReactNode } from "react"
import {
  createReceiptImport,
  type ReceiptImportApi,
} from "../application/receipt-import"
import ReceiptImport from "../ui/receipts/ReceiptImport"
export type { ReceiptReview } from "../model/receipt-draft"
export default function ReceiptController(
  props: ReceiptImportApi & {
    events: { id: string; title: string }[]
    initialEventId?: string | null
    revisionNotice?: ReactNode
    onClose: () => void
    onSaved: (eventId: string) => void
  }
) {
  const [session] = useState(() => createReceiptImport(props))
  const snapshot = useSyncExternalStore(
    session.subscribe,
    session.getState,
    session.getState
  )
  return (
    <ReceiptImport
      {...snapshot}
      events={props.events}
      initialEventId={props.initialEventId}
      revisionNotice={props.revisionNotice}
      onClose={props.onClose}
      onSaved={props.onSaved}
      onChoose={session.choose}
      onChange={session.edit}
      onRecognize={session.recognize}
      onSubmit={session.submit}
    />
  )
}
