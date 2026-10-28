"use client"

import { ChevronRight } from "lucide-react"

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
      className="mt-4 flex w-full items-center gap-3 rounded-xl bg-journal-soft px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-russet"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">
          {merchant || "账单"}
        </span>
        <span className="mt-1 block text-xs text-journal-muted">
          {date || "日期待补"}
        </span>
      </span>
      <span className="max-w-[60%] shrink-0 text-right text-lg font-semibold break-words tabular-nums">
        {total || "金额待补"}
      </span>
      <ChevronRight size={15} className="shrink-0 text-journal-muted" />
    </button>
  )
}
