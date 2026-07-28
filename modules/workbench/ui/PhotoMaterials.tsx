"use client"

import PhotoUploader from "@/modules/workbench/ui/sidebar/PhotoUploader"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function PhotoMaterials() {
  const photoShares = useWorkspaceStore((state) => state.photoShares)
  const setLightboxPhotoShare = useWorkspaceStore(
    (state) => state.setLightboxPhotoShare
  )

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold text-ink">
          照片素材
        </h3>
      </div>

      <PhotoUploader />

      {photoShares.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-20 bg-soft-white/70 p-3 text-xs font-bold text-walnut">
          暂无照片素材
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photoShares.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setLightboxPhotoShare(photo)}
              className="group overflow-hidden rounded-lg border border-ink-15 bg-soft-white transition hover:border-russet focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-russet"
            >
              <img
                src={photo.imageDataUrl}
                alt={photo.caption || "照片素材"}
                className="aspect-square w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
