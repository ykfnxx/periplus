import { locationCount } from "@/lib/journeys/summary"
import type { Journey } from "@/types/journey"

interface RouteListItemProps {
  journey: Journey
  onSelect: (journey: Journey) => void
}

export default function RouteListItem({
  journey,
  onSelect,
}: RouteListItemProps) {
  const count = locationCount(journey.events)
  return (
    <button
      type="button"
      onClick={() => onSelect(journey)}
      className="w-full rounded-lg border border-ink-15 bg-white/70 p-3 text-left transition hover:border-russet hover:shadow-periplus-soft"
      aria-label={`${journey.title}，${count} 个地点`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-ink">
            {journey.title}
          </h3>
          {journey.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-walnut">
              {journey.description}
            </p>
          )}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mustard text-xs font-bold text-ink">
          {count}
        </span>
      </div>
    </button>
  )
}
