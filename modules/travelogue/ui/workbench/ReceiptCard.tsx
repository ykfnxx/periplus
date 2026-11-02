"use client"

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
      className="journal-card-cost"
      title={[merchant || "账单", date].filter(Boolean).join(" · ")}
    >
      <span className="journal-card-cost-label">花费</span>
      <span className="max-w-[60%] shrink-0 text-right text-lg font-semibold break-words tabular-nums">
        {total || "金额待补"}
      </span>
    </button>
  )
}
