"use client"

import { useState } from "react"
import { ArrowLeft, Pencil } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { Receipt } from "@/modules/data-model/contracts/receipts"
import type { RecordingStore } from "../../state/recording-store"
import { dateLabel } from "../display"
import {
  confirmedReceiptFields,
  receiptFormValues,
  receiptTotal,
} from "../receipt-display"
import { useConfirmation } from "./Modal"
import ReceiptForm from "./ReceiptForm"
import RevisionReload from "./RevisionReload"
import UserSource from "./UserSource"

export default function ReceiptDetails({
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
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => receiptFormValues(receipt))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { ask, confirmation } = useConfirmation()
  const dirty =
    editing &&
    JSON.stringify(draft) !== JSON.stringify(receiptFormValues(receipt))

  async function attemptClose() {
    if (busy) return
    if (
      dirty &&
      !(await ask("尚未保存的账单修改将被放弃。", {
        title: "放弃本次修改？",
        cancelLabel: "继续编辑",
        confirmLabel: "放弃修改",
      }))
    )
      return
    onClose()
  }

  return (
    <>
      <section
        role="dialog"
        aria-modal="false"
        aria-label="账单详情"
        className="journal-subpage journal-receipt-details"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.stopPropagation()
            void attemptClose()
          }
        }}
      >
        <header className="journal-subpage-header sticky top-0 z-10">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              shape="square"
              aria-label="返回"
              disabled={busy}
              onClick={() => void attemptClose()}
            >
              <ArrowLeft size={16} />
            </Button>
            <h2 className="truncate font-editorial text-lg font-bold">
              账单详情
            </h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => void attemptClose()}
          >
            关闭
          </Button>
        </header>

        <div className="journal-subpage-body">
          <div className="space-y-4 rounded-3xl border border-journal-line bg-journal-card p-5 shadow-journal-card">
            {store && (
              <RevisionReload store={store} onReload={() => setError(null)} />
            )}
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
                    <h3 className="font-editorial text-xl font-bold break-words text-journal-ink">
                      {receipt.merchant || "账单"}
                    </h3>
                    {receipt.date && (
                      <p className="mt-1.5 text-xs text-journal-muted tabular-nums">
                        {dateLabel(receipt.date)}
                      </p>
                    )}
                  </div>
                  <span className="max-w-[60%] shrink-0 text-right text-lg font-semibold break-words text-journal-ink tabular-nums">
                    {receiptTotal(receipt)}
                  </span>
                </div>
                {receipt.items.length > 0 && (
                  <ul
                    className="space-y-2.5 border-y border-journal-line py-3"
                    aria-label="消费明细"
                  >
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
                  className="max-h-[48dvh] w-full rounded-2xl border border-journal-line bg-journal-paper-soft object-contain"
                />
              </>
            )}
            {store && receipt.canEdit && (
              <div className="flex flex-wrap justify-end gap-2 pt-1">
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
          </div>
        </div>
      </section>
      {confirmation}
    </>
  )
}
