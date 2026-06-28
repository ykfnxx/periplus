import type { Route } from "@/types/route"

interface RouteListItemProps {
  route: Route
  onSelect: (route: Route) => void
}

export default function RouteListItem({ route, onSelect }: RouteListItemProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(route)}
      className="w-full rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/70 p-3 text-left transition hover:border-[var(--periplus-russet)] hover:shadow-[var(--periplus-soft-shadow)]"
      aria-label={`${route.name}，${route.points.length} 个地点`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-[var(--periplus-ink)]">
            {route.name}
          </h3>
          {route.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--periplus-walnut)]">
              {route.description}
            </p>
          )}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--periplus-mustard)] text-xs font-black text-[var(--periplus-ink)]">
          {route.points.length}
        </span>
      </div>
    </button>
  )
}
