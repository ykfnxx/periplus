import type { ReactNode } from "react"
import { ChevronLeft } from "lucide-react"

export default function TravelogueHeader({
  onBack,
  children,
}: {
  onBack?: () => void
  children?: ReactNode
}) {
  return (
    <header className="sticky top-0 z-30 flex min-h-18 items-center justify-between gap-3 border-b border-ink-5 bg-soft-white px-5 py-3 md:px-8">
      <div className="flex items-center gap-5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-bold hover:text-russet md:order-2 md:border-l md:border-ink-20 md:pl-6"
          >
            <ChevronLeft size={20} className="md:hidden" />
            我的旅程
          </button>
        ) : null}
        <span className="text-2xl font-black tracking-tight">Periplus</span>
        {!onBack ? (
          <span className="hidden border-b-2 border-russet px-3 py-3 text-sm font-bold sm:block">
            我的旅程
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 md:gap-3">{children}</div>
    </header>
  )
}
