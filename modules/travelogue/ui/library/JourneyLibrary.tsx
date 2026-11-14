"use client"

import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { Popover } from "@base-ui/react/popover"
import { ArrowLeft, Images, LogOut, Pencil, Plus, Settings } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import type {
  JourneySummary,
  MapPhoto as AtlasPhoto,
} from "@/modules/data-model/contracts/index"
import type { JourneyOpenRequest } from "../../contracts"
import { atlasViewStore } from "../state/atlas-view-store"
import { dateLabel, recordingCoordinateToMap } from "../formatting/display"
import type { RecordMapRequest } from "../map/RecordMap"
import type { MapPhoto } from "../map/usePhotoMapLayer"
import useRecordingViewport from "../workbench/useRecordingViewport"
import MapControls from "../map/MapControls"
import { useConfirmation } from "../../../../components/ui/Modal"
import PhotoViewer from "../photos/PhotoViewer"
import ResizableMapPanel, {
  mobileSheetHeight,
} from "../workbench/ResizableMapPanel"

const RecordMap = dynamic(() => import("../map/RecordMap"), { ssr: false })

export type JourneyLibraryItem = JourneySummary
const emptyPhotos: AtlasPhoto[] = []

function journeyDateRange(item: JourneySummary) {
  if (item.startDate && item.endDate) {
    return item.startDate === item.endDate
      ? dateLabel(item.startDate)
      : `${dateLabel(item.startDate)} – ${dateLabel(item.endDate)}`
  }
  if (item.startDate) return dateLabel(item.startDate)
  return null
}

export default function JourneyLibrary({
  account,
  draftEntry,
  onSignOut,
  journeys,
  photos = emptyPhotos,
  loading,
  error,
  onCreate,
  onOpen,
  onRename,
  onRetry,
  developerMode = false,
}: {
  account?: { name?: string; email?: string }
  draftEntry: ReactNode
  onSignOut: () => Promise<void>
  journeys: JourneyLibraryItem[]
  photos?: AtlasPhoto[]
  loading: boolean
  error: string | null
  onCreate: (title: string, request?: JourneyOpenRequest) => Promise<void>
  onOpen: (id: string, request?: JourneyOpenRequest) => void
  onRename: (id: string, title: string) => Promise<void>
  onRetry: () => void
  developerMode?: boolean
}) {
  const { desktop, height, width } = useRecordingViewport()
  const [panelWidth, setPanelWidth] = useState(428)
  const [sheetRatio, setSheetRatio] = useState(0.62)
  const [initialViewport] = useState(() => atlasViewStore.getState().viewport)
  const [destination, setDestination] = useState<JourneyOpenRequest | null>(
    null
  )
  const [viewer, setViewer] = useState<string[] | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [form, setForm] = useState<{
    id?: string
    title: string
    initial: string
    request?: JourneyOpenRequest
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [mapRequest, setMapRequest] = useState<RecordMapRequest | null>(null)
  const { ask, confirmation } = useConfirmation()

  const items = useMemo(
    () =>
      photos.map((photo) => ({
        ...photo,
        id: `${photo.journeyId}:${photo.eventId}:${photo.assetId}`,
        inherited: false,
        coordinate: photo.location?.coordinates
          ? recordingCoordinateToMap(photo.location.coordinates)
          : null,
      })),
    [photos]
  )
  const mapPhotos = useMemo(
    () =>
      items.filter(
        (photo): photo is (typeof items)[number] & MapPhoto =>
          photo.coordinate !== null
      ),
    [items]
  )
  const byId = useMemo(
    () => new Map(items.map((photo) => [photo.id, photo])),
    [items]
  )
  const viewerPhotos =
    viewer?.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])) || []

  const sheetHeight = mobileSheetHeight(height, sheetRatio)
  const insets = useMemo(
    () =>
      desktop
        ? {
            left: Math.min(width * 0.65, panelWidth + 44),
            right: 64,
            top: 40,
            bottom: 28,
          }
        : { left: 24, right: 60, top: 48, bottom: sheetHeight + 16 },
    [desktop, width, panelWidth, sheetHeight]
  )

  const create = (request?: JourneyOpenRequest) => {
    setFormError(null)
    setForm({ title: "", initial: "", request })
  }

  const closeForm = async () => {
    if (saving) return
    if (
      form &&
      form.title !== form.initial &&
      !(await ask("旅程名称尚未保存，放弃修改？"))
    )
      return
    setForm(null)
    setFormError(null)
  }

  return (
    <main
      className="journal-workbench journal-library fixed inset-0 isolate overflow-hidden bg-map-land text-journal-ink"
      style={
        {
          "--journal-map-bottom": !desktop ? `${sheetHeight}px` : "0px",
          "--journal-map-left": desktop ? `${panelWidth + 36}px` : "4px",
        } as CSSProperties
      }
    >
      <div className="absolute inset-0">
        <RecordMap
          points={[]}
          initialViewport={initialViewport}
          onViewport={(viewport) => atlasViewStore.setState({ viewport })}
          photos={mapPhotos}
          insets={insets}
          request={mapRequest}
          onOpenPhotos={setViewer}
          onAddAtLocation={
            !loading && !error
              ? (location) => {
                  const req: JourneyOpenRequest = { add: true, location }
                  if (!journeys.length) create(req)
                  else if (journeys.length === 1) onOpen(journeys[0].id, req)
                  else {
                    setDestination(req)
                    if (!desktop && sheetRatio <= 0) setSheetRatio(0.56)
                  }
                }
              : undefined
          }
        />
      </div>

      <MapControls
        canFit={mapPhotos.length > 0}
        onRequest={(type) =>
          setMapRequest((current) => ({ id: (current?.id || 0) + 1, type }))
        }
      />

      <ResizableMapPanel
        width={panelWidth}
        onWidth={setPanelWidth}
        sheetRatio={sheetRatio}
        onSheetRatio={setSheetRatio}
      >
        {form ? (
          <div className="journal-subpage">
            <header className="journal-subpage-header">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  variant="ghost"
                  shape="square"
                  aria-label="返回书架"
                  disabled={saving}
                  onClick={() => void closeForm()}
                >
                  <ArrowLeft size={16} />
                </Button>
                <h1 className="truncate font-editorial text-lg font-bold">
                  {form.id ? "旅程名称" : "新建旅程"}
                </h1>
              </div>
            </header>
            <div className="journal-subpage-body">
              <form
                className="space-y-4 rounded-2xl border border-journal-line bg-journal-card p-4 shadow-journal-card"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!form.title.trim()) {
                    setFormError("给旅程起一个名字。")
                    return
                  }
                  setSaving(true)
                  setFormError(null)
                  try {
                    if (form.id) await onRename(form.id, form.title.trim())
                    else await onCreate(form.title.trim(), form.request)
                    setForm(null)
                  } catch (cause) {
                    setFormError(
                      cause instanceof Error
                        ? cause.message
                        : "保存失败，请重试。"
                    )
                  } finally {
                    setSaving(false)
                  }
                }}
              >
                <Input
                  label="旅程名称"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  maxLength={200}
                  placeholder="例如：杭州慢游"
                  disabled={saving}
                />
                {formError && (
                  <p role="alert" className="text-sm text-coral">
                    {formError}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => void closeForm()}
                    disabled={saving}
                  >
                    取消
                  </Button>
                  <Button variant="primary" type="submit" loading={saving}>
                    {form.id ? "保存" : "开始记录"}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        ) : (
          <>
            <header className="journal-dates flex shrink-0 items-center gap-1.5">
              <h1 className="min-w-0 flex-1 truncate font-editorial text-xl font-bold text-journal-ink">
                {destination ? "选择要记录的旅程" : "我的旅程"}
              </h1>
              {destination && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDestination(null)}
                >
                  取消
                </Button>
              )}
              {draftEntry}
              {items.length > 0 && (
                <Button
                  variant="ghost"
                  shape="square"
                  aria-label="查看全部照片"
                  title="查看全部照片"
                  onClick={() => setViewer(items.map((item) => item.id))}
                >
                  <Images size={17} />
                </Button>
              )}
              <Button
                variant="primary"
                shape="square"
                className="journal-write shrink-0"
                aria-label="新建游记"
                title="新建游记"
                disabled={loading || !!error}
                onClick={() => create(destination || undefined)}
              >
                <Plus size={16} />
              </Button>
              <Popover.Root open={settingsOpen} onOpenChange={setSettingsOpen}>
                <Popover.Trigger
                  render={
                    <Button
                      variant="ghost"
                      shape="square"
                      aria-label="账号设置"
                    />
                  }
                >
                  <Settings size={17} />
                </Popover.Trigger>
                <Popover.Portal>
                  <Popover.Positioner
                    side="bottom"
                    align="end"
                    sideOffset={8}
                    collisionPadding={12}
                    className="z-30"
                  >
                    <Popover.Popup className="journal-directory flex w-56 flex-col gap-1 rounded-2xl border border-journal-line bg-journal-card p-2.5 shadow-journal outline-none">
                      <div className="border-b border-journal-line px-2.5 pt-1 pb-2">
                        <p className="truncate text-sm font-semibold text-journal-ink">
                          {account?.name || "当前账号"}
                        </p>
                        {account?.email && (
                          <p className="truncate text-xs text-journal-muted">
                            {account.email}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        disabled={signingOut}
                        className="justify-start! gap-2.5! text-coral!"
                        onClick={async () => {
                          setSigningOut(true)
                          try {
                            await onSignOut()
                          } finally {
                            setSigningOut(false)
                          }
                        }}
                      >
                        <LogOut size={16} />
                        退出登录
                      </Button>
                    </Popover.Popup>
                  </Popover.Positioner>
                </Popover.Portal>
              </Popover.Root>
            </header>

            <div className="journal-list min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {error && (
                <div
                  role="alert"
                  className="my-3 rounded-2xl border border-journal-line bg-journal-card p-4 text-sm text-coral"
                >
                  <p>{error}</p>
                  <Button
                    variant="secondary"
                    className="mt-2"
                    onClick={onRetry}
                  >
                    重试
                  </Button>
                </div>
              )}

              {!loading && !error && journeys.length === 0 && (
                <div className="mt-3 rounded-3xl border border-journal-line bg-journal-card px-5 py-8 text-center shadow-journal-card">
                  <p className="font-editorial text-base font-bold text-journal-ink">
                    还没有游记
                  </p>
                </div>
              )}

              <div className="mt-2 flex flex-col gap-3">
                {journeys.map((item) => {
                  const span = journeyDateRange(item)
                  return (
                    <article
                      key={item.id}
                      className="journal-card group cursor-pointer"
                      onClick={() => onOpen(item.id, destination || undefined)}
                    >
                      {item.coverUrl && (
                        <div className="journal-card-cover aspect-[16/9]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.coverUrl}
                            alt=""
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      )}
                      <div className="journal-card-content">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="journal-event-title min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                onOpen(item.id, destination || undefined)
                              }}
                            >
                              {item.title}
                            </button>
                          </h2>
                          {item.role === "OWNER" && (
                            <Button
                              variant="ghost"
                              shape="square"
                              aria-label={`重命名${item.title}`}
                              title="重命名"
                              className="size-7! shrink-0 text-journal-muted! opacity-70 group-hover:opacity-100"
                              onClick={(event) => {
                                event.stopPropagation()
                                setFormError(null)
                                setForm({
                                  id: item.id,
                                  title: item.title,
                                  initial: item.title,
                                })
                              }}
                            >
                              <Pencil size={14} />
                            </Button>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-journal-muted tabular-nums">
                          {span && <span>{span}</span>}
                          <span>{item.eventCount} 条记录</span>
                          {item.photoCount > 0 && (
                            <span>{item.photoCount} 张照片</span>
                          )}
                          {item.role === "MEMBER" && (
                            <span className="rounded-full bg-journal-chip px-2 py-0.5 text-journal-ink">
                              共写
                            </span>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </ResizableMapPanel>

      {developerMode && <span className="sr-only">共用调试数据</span>}
      {viewer && (
        <PhotoViewer
          photos={viewerPhotos}
          onClose={() => setViewer(null)}
          onOpenEvent={(photo) => {
            const source = byId.get(photo.id)
            if (source) onOpen(source.journeyId, { eventId: source.eventId })
          }}
        />
      )}
      {confirmation}
    </main>
  )
}
