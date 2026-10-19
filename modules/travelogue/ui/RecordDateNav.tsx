import { CalendarDays, Files, NotebookPen } from "lucide-react"

export interface RecordDay {
  key: string
  label: string
  firstEventId: string
}

export default function RecordDateNav({
  days,
  activeDay,
  onSelect,
}: {
  days: RecordDay[]
  activeDay: string | null
  onSelect: (day: RecordDay | null) => void
}) {
  return (
    <nav
      aria-label="记录日期"
      className="scrollbar-hidden flex gap-2 overflow-x-auto py-1 lg:sticky lg:top-24 lg:flex-col lg:rounded-2xl lg:bg-soft-white lg:p-2"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-current={activeDay === null ? "true" : undefined}
        className={`flex min-h-12 shrink-0 items-center gap-3 rounded-xl px-4 text-sm font-bold transition ${activeDay === null ? "bg-russet text-white" : "bg-soft-white text-walnut hover:bg-ink-5"}`}
      >
        <Files size={19} className="hidden lg:block" />
        全部记录
      </button>
      {days.map((day) => (
        <button
          key={day.key}
          type="button"
          onClick={() => onSelect(day)}
          aria-current={activeDay === day.key ? "true" : undefined}
          className={`flex min-h-12 shrink-0 items-center gap-3 rounded-xl px-4 text-sm font-bold transition ${activeDay === day.key ? "bg-russet text-white" : "bg-soft-white text-walnut hover:bg-ink-5"}`}
        >
          {day.key === "undated" ? (
            <NotebookPen size={19} className="hidden lg:block" />
          ) : (
            <CalendarDays size={19} className="hidden lg:block" />
          )}
          {day.label}
        </button>
      ))}
    </nav>
  )
}
