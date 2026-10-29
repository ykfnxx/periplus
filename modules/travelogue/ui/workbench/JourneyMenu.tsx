"use client"
import { Popover } from "@base-ui/react/popover"
import {
  ChevronDown,
  Image as ImageIcon,
  MoreHorizontal,
  Plus,
} from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneySummary } from "@/modules/data-model/contracts"
import { journeyDateLabel } from "../display"

export default function JourneyMenu({
  title = "全部游记",
  journeys,
  onOpen,
  onCreate,
  onRename,
  onPhotos,
  open,
  onOpenChange,
  choosing = false,
  error,
  onRetry,
}: {
  title?: string
  journeys: JourneySummary[]
  onOpen: (id: string) => void
  onCreate: () => void
  onRename?: (id: string) => void
  onPhotos?: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  error?: string | null
  onRetry?: () => void
  choosing?: boolean
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            className="journal-journey-trigger max-w-full"
            aria-label="选择游记"
          />
        }
      >
        <span className="truncate">{title}</span>
        <ChevronDown size={16} className="shrink-0" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-30"
        >
          <Popover.Popup className="journal-directory w-80 max-w-[calc(100vw-24px)] rounded-2xl bg-white p-3 text-ink shadow-journal outline-none">
            {error && (
              <div role="alert" className="px-3 py-2 text-sm text-coral">
                <p>{error}</p>
                <Button variant="ghost" onClick={onRetry}>
                  重试
                </Button>
              </div>
            )}
            {choosing && (
              <Popover.Title className="px-3 py-2 text-sm font-medium">
                记到哪篇游记
              </Popover.Title>
            )}
            <div className="max-h-[min(55dvh,480px)] overflow-y-auto overscroll-contain">
              {journeys.map((journey) => (
                <div key={journey.id} className="group flex items-center gap-1">
                  <Button
                    variant="ghost"
                    className="h-auto! min-w-0 flex-1 justify-start! gap-3! rounded-xl px-3! py-3! text-left"
                    onClick={() => {
                      onOpenChange(false)
                      onOpen(journey.id)
                    }}
                  >
                    {journey.coverUrl ? (
                      // Private media keeps authenticated URLs without an image-proxy fetch.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={journey.coverUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-journal-soft text-journal-muted">
                        <ImageIcon size={24} strokeWidth={1.5} />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {journey.title}
                      </span>
                      <span className="mt-1 block text-xs text-journal-muted">
                        {journeyDateLabel(journey)}
                      </span>
                    </span>
                  </Button>
                  {onRename && journey.role === "OWNER" && (
                    <Button
                      variant="ghost"
                      shape="square"
                      aria-label={`重命名${journey.title}`}
                      className="shrink-0 text-journal-muted"
                      onClick={() => {
                        onOpenChange(false)
                        onRename(journey.id)
                      }}
                    >
                      <MoreHorizontal size={17} />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {onPhotos && (
                <Button
                  variant="ghost"
                  className="justify-start! gap-3!"
                  onClick={() => {
                    onOpenChange(false)
                    onPhotos()
                  }}
                >
                  <ImageIcon size={18} />
                  全部照片
                </Button>
              )}
              <Button
                variant="ghost"
                className="justify-start! gap-3! text-journal-accent"
                onClick={() => {
                  onOpenChange(false)
                  onCreate()
                }}
              >
                <Plus size={18} />
                新建游记
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
