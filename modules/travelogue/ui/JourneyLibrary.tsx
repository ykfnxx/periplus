"use client"
import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { Plus } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import { Input } from "@/components/kumo/components/input/input"
import type {
  JourneySummary,
  MapPhoto as AtlasPhoto,
} from "@/modules/data-model/contracts"
import type { JourneyOpenRequest } from "../data/navigation"
import MapControls from "./workbench/MapControls"
import JourneyMenu from "./workbench/JourneyMenu"
import PhotoViewer from "./workbench/PhotoViewer"
import { Modal, useConfirmation } from "./workbench/Modal"
import { recordingCoordinateToMap } from "./display"
import type { RecordMapRequest } from "./RecordMap"
import { atlasViewStore } from "../state/atlas-view-store"
import type { MapPhoto } from "./usePhotoMapLayer"
const RecordMap = dynamic(() => import("./RecordMap"), { ssr: false })
export type JourneyLibraryItem = JourneySummary
const emptyPhotos: AtlasPhoto[] = []
const atlasInsets = { left: 32, right: 76, top: 88, bottom: 32 }

export default function JourneyLibrary({
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
  const [initialViewport] = useState(() => atlasViewStore.getState().viewport)
  const [directory, setDirectory] = useState(false)
  const [destination, setDestination] = useState<JourneyOpenRequest | null>(
    null
  )
  const [viewer, setViewer] = useState<string[] | null>(null)
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
  const create = (request?: JourneyOpenRequest) => {
    setFormError(null)
    setForm({ title: "", initial: "", request })
  }
  const add = (request: JourneyOpenRequest = { add: true }) => {
    setDestination(request)
    if (journeys.length) setDirectory(true)
    else create(request)
  }
  return (
    <main className="journal-workbench journal-library fixed inset-0 isolate overflow-hidden bg-cream text-ink">
      <div className="absolute inset-0">
        <RecordMap
          points={[]}
          initialViewport={initialViewport}
          onViewport={(viewport) => atlasViewStore.setState({ viewport })}
          photos={mapPhotos}
          insets={atlasInsets}
          request={mapRequest}
          onOpenPhotos={setViewer}
          onAddAtLocation={
            !loading && !error
              ? (location) => add({ add: true, location })
              : undefined
          }
        />
      </div>
      <div className="journal-atlas-selector absolute top-5 left-5 z-20 max-w-[calc(100vw-160px)]">
        <JourneyMenu
          journeys={journeys}
          open={directory}
          onOpenChange={(open) => {
            setDirectory(open)
            if (!open) setDestination(null)
          }}
          choosing={!!destination}
          onOpen={(id) => onOpen(id, destination || undefined)}
          onCreate={() => create(destination || undefined)}
          onRename={(id) => {
            const journey = journeys.find((item) => item.id === id)!
            setFormError(null)
            setForm({ id, title: journey.title, initial: journey.title })
          }}
          onPhotos={
            items.length
              ? () => setViewer(items.map((item) => item.id))
              : undefined
          }
        />
      </div>
      <Button
        variant="ghost"
        className="journal-atlas-add absolute top-5 right-5 z-20 gap-2! bg-white!"
        disabled={loading || !!error}
        onClick={() => add()}
      >
        <Plus size={18} />
        记一笔
      </Button>
      <MapControls
        canFit={mapPhotos.length > 0}
        onRequest={(type) =>
          setMapRequest((current) => ({ id: (current?.id || 0) + 1, type }))
        }
      />
      {!loading && !error && !mapPhotos.length && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Button
            variant="secondary"
            className="pointer-events-auto bg-white!"
            onClick={() => (journeys.length ? setDirectory(true) : create())}
          >
            {journeys.length ? "打开游记" : "新建游记"}
          </Button>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="absolute top-20 left-5 rounded-xl bg-white p-4 text-sm text-coral"
        >
          <p>{error}</p>
          <Button variant="ghost" onClick={onRetry}>
            重试
          </Button>
        </div>
      )}
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
      {form && (
        <Modal
          title={form.id ? "旅程名称" : "新建旅程"}
          onClose={() => setForm(null)}
          beforeClose={() =>
            !saving &&
            (form.title === form.initial || ask("旅程名称尚未保存，放弃修改？"))
          }
        >
          {(close) => (
            <form
              className="space-y-5"
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
                <Button variant="secondary" onClick={close} disabled={saving}>
                  取消
                </Button>
                <Button variant="primary" type="submit" loading={saving}>
                  {form.id ? "保存" : "开始记录"}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {confirmation}
    </main>
  )
}
