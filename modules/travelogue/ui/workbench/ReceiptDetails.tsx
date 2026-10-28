"use client"
import RevisionReload from "./RevisionReload"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingReceipt } from "@/modules/data-model/contracts/receipts"
import type { RecordingStore } from "../../state/recording-store"
import {
  confirmedReceiptFields,
  receiptFormValues,
  receiptTotal,
} from "../receipt-display"
import { dateLabel } from "../display"
import { Modal, useConfirmation } from "./Modal"
import ReceiptForm from "./ReceiptForm"
import UserSource from "./UserSource"

export default function ReceiptDetails({
  receipt,
  eventId,
  store,
  onClose,
}: {
  receipt: RecordingReceipt
  eventId: string
  store: RecordingStore
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => receiptFormValues(receipt))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { ask, confirmation } = useConfirmation()
  const dirty =
    editing &&
    JSON.stringify(draft) !== JSON.stringify(receiptFormValues(receipt))
  return (
    <>
      <Modal
        title="账单详情"
        onClose={onClose}
        beforeClose={() =>
          !busy &&
          (!dirty ||
            ask("尚未保存的账单修改将被放弃。", {
              title: "放弃本次修改？",
              cancelLabel: "继续编辑",
              confirmLabel: "放弃修改",
            }))
        }
        className="journal-receipt-details w-[560px]! p-6! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:max-h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-none! max-sm:transform-none! max-sm:rounded-none! max-sm:pt-[calc(env(safe-area-inset-top)+24px)]! max-sm:pb-[calc(env(safe-area-inset-bottom)+24px)]!"
      >
        {(close) => (
          <div className="space-y-5">
            <RevisionReload store={store} onReload={() => setError(null)} />
            {error && (
              <p role="alert" className="text-sm text-coral">
                {error}
              </p>
            )}
            <UserSource user={receipt.source} className="text-journal-muted" />
            {editing ? (
              <ReceiptForm value={draft} onChange={setDraft} disabled={busy} />
            ) : (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold break-words">
                      {receipt.merchant || "账单"}
                    </h3>
                    <p className="mt-2 text-sm text-journal-muted">
                      {receipt.date ? dateLabel(receipt.date) : "日期待补"}
                    </p>
                  </div>
                  <span className="max-w-[60%] shrink-0 text-right text-xl font-semibold break-words tabular-nums">
                    {receiptTotal(receipt)}
                  </span>
                </div>
                {receipt.items.length > 0 && (
                  <ul className="space-y-3 py-3" aria-label="消费明细">
                    {receipt.items.map((item, index) => (
                      <li
                        key={index}
                        className="flex items-start justify-between gap-3 text-sm"
                      >
                        <span className="min-w-0 break-words">
                          {item.name}
                          {item.quantity ? ` × ${item.quantity}` : ""}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {item.amount || ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={receipt.url}
                  alt="账单原图"
                  className="max-h-[50dvh] w-full rounded-xl object-contain"
                />
              </>
            )}
            {receipt.canEdit && (
              <div className="flex flex-wrap justify-end gap-2">
                {editing ? (
                  <>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          dirty &&
                          !(await ask("尚未保存的账单修改将被放弃。", {
                            title: "放弃本次修改？",
                            cancelLabel: "继续编辑",
                            confirmLabel: "放弃修改",
                          }))
                        )
                          return
                        setEditing(false)
                        setError(null)
                      }}
                    >
                      取消修改
                    </Button>
                    <Button
                      variant="primary"
                      loading={busy}
                      onClick={async () => {
                        setBusy(true)
                        setError(null)
                        try {
                          const fields = confirmedReceiptFields(draft)
                          await store.getState().mutate({
                            name: "receipt.update",
                            eventId,
                            receiptId: receipt.id,
                            fields,
                          })
                          setEditing(false)
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "保存失败，请重试。"
                          )
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      保存账单
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="secondary-destructive"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !(await ask("账单会从记录中移除，原素材保留。", {
                            title: "移除这张账单？",
                            confirmLabel: "移除账单",
                          }))
                        )
                          return
                        setBusy(true)
                        setError(null)
                        try {
                          await store.getState().mutate({
                            name: "receipt.remove",
                            eventId,
                            receiptId: receipt.id,
                          })
                          onClose()
                        } catch (cause) {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "移除失败，请重试。"
                          )
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      移除账单
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDraft(receiptFormValues(receipt))
                        setEditing(true)
                      }}
                    >
                      <Pencil size={15} />
                      编辑账单
                    </Button>
                  </>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button variant="ghost" disabled={busy} onClick={close}>
                关闭
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {confirmation}
    </>
  )
}
