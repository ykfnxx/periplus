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
      className="w-full rounded-lg border border-ink-15 bg-white/70 p-3 text-left transition hover:border-russet hover:shadow-periplus-soft"
      aria-label={`${route.name}，${route.nodes.length} 个节点`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-bold text-ink">
            {route.name}
          </h3>
          {route.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-walnut">
              {route.description}
            </p>
          )}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-mustard text-xs font-bold text-ink">
          {route.nodes.length}
        </span>
      </div>
    </button>
  )
}
