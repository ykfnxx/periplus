"use client"

import { MapPin, X } from "lucide-react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function LocationSelectionPrompt() {
  const isSelectingLocation = useWorkspaceStore((s) => s.isSelectingLocation)
  const locationSelectionMode = useWorkspaceStore(
    (s) => s.locationSelectionMode
  )
  const uploadLocationSelectionPhotoId = useWorkspaceStore(
    (s) => s.uploadLocationSelectionPhotoId
  )
  const uploadPhotos = useWorkspaceStore((s) => s.uploadPhotos)
  const clearLocationSelection = useWorkspaceStore(
    (s) => s.clearLocationSelection
  )
  const setUploadModalOpen = useWorkspaceStore((s) => s.setUploadModalOpen)

  if (!isSelectingLocation || locationSelectionMode !== "upload-photo") {
    return null
  }

  const selectedPhoto = uploadPhotos.find(
    (photo) => photo.id === uploadLocationSelectionPhotoId
  )

  const handleCancel = () => {
    clearLocationSelection()
    setUploadModalOpen(true)
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-5 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex max-w-[min(520px,calc(100vw-32px))] items-center gap-3 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--color-soft-white)] px-3 py-2 text-[var(--color-ink)] shadow-[var(--shadow-periplus)]">
        {selectedPhoto ? (
          <img
            src={selectedPhoto.previewUrl}
            alt="待选点照片"
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-cream)] text-[var(--color-russet)]">
            <MapPin aria-hidden="true" className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm leading-5 font-black">在地图上选点</p>
          <p className="truncate text-xs leading-4 font-bold text-[var(--color-teak)]">
            点击地图为照片记录坐标
          </p>
        </div>
        <button
          type="button"
          onClick={handleCancel}
          aria-label="取消选点"
          title="取消选点"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-walnut)] transition hover:bg-[rgb(44_36_22_/_7%)] hover:text-[var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-russet)]"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
