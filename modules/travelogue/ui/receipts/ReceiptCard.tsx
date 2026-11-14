"use client"

import type { JourneyEvent } from "@/modules/data-model/contracts/index"
import { dateLabel } from "../formatting/display"
import { receiptTotal } from "../../model/receipt-draft"

type ReceiptItem = JourneyEvent["receipts"][number]

export function ExpensePills({
  receipts,
  activeAssetId,
  onToggle,
  variant = "warm",
}: {
  receipts: readonly ReceiptItem[]
  activeAssetId: string | null
  onToggle: (assetId: string) => void
  variant?: "warm" | "transit"
}) {
  if (!receipts.length) return null
  return (
    <div className="cards-expenses">
      {receipts.map((receipt) => {
        const expanded = activeAssetId === receipt.assetId
        return (
          <button
            key={receipt.assetId}
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "收起" : "展开"}${receipt.merchant || "账单"}开销明细`}
            className={`cards-expense-pill ${variant === "transit" ? "cards-expense-pill--transit" : ""}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              onToggle(receipt.assetId)
            }}
          >
            {receiptTotal(receipt)}
          </button>
        )
      })}
    </div>
  )
}

export function InlineReceiptBreakdown({
  receipt,
  onOpenDetails,
  variant = "warm",
}: {
  receipt: ReceiptItem
  onOpenDetails: () => void
  variant?: "warm" | "transit"
}) {
  const transit = variant === "transit"
  const currencyPrefix = receipt.currency ? `${receipt.currency} ` : ""
  return (
    <div
      className={`mt-2.5 rounded-2xl border px-3 py-2.5 text-xs ${
        transit
          ? "border-journal-transit-chip-line bg-journal-transit-chip text-journal-transit-ink"
          : "border-journal-line bg-journal-paper-soft text-journal-ink"
      }`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{receipt.merchant || "账单"}</span>
          {receipt.date && (
            <span
              className={`ml-2 tabular-nums ${
                transit ? "text-journal-transit-muted" : "text-journal-muted"
              }`}
            >
              {dateLabel(receipt.date)}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={`查看${receipt.merchant || "这条记录"}的账单详情`}
          className={`shrink-0 rounded-lg px-2 py-0.5 font-medium underline-offset-2 hover:underline ${
            transit ? "text-journal-transit-accent" : "text-journal-amber"
          }`}
          onClick={onOpenDetails}
        >
          原单与编辑
        </button>
      </div>
      {receipt.items.length > 0 && (
        <ul
          className={`mt-2 space-y-1 border-t pt-2 ${
            transit ? "border-journal-transit-chip-line" : "border-journal-line"
          }`}
        >
          {receipt.items.map((item, index) => (
            <li
              key={`${item.name}-${index}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0 flex-1 truncate">
                {item.name}
                {item.quantity ? ` ×${item.quantity}` : ""}
              </span>
              {item.amount && (
                <span className="shrink-0 tabular-nums">
                  {currencyPrefix}
                  {item.amount}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ReceiptCard({
  merchant,
  date,
  total,
  onOpen,
}: {
  merchant: string
  date: string
  total: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`查看${merchant || "账单"}的账单详情`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onOpen}
      className="cards-expense-pill"
      title={[merchant || "账单", date].filter(Boolean).join(" · ")}
    >
      {total || "金额待补"}
    </button>
  )
}
