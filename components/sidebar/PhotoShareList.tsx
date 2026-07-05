"use client"

import { useMapStore } from "@/stores/mapStore"
import { photoDtoToShare, updatePhotoCaption } from "@/lib/photos/client"

export default function PhotoShareList() {
  const photoShares = useMapStore((s) => s.photoShares)
  const setSelectedPhotoShare = useMapStore((s) => s.setSelectedPhotoShare)
  const updatePhotoShareCaption = useMapStore((s) => s.updatePhotoShareCaption)
  const upsertPhotoShare = useMapStore((s) => s.upsertPhotoShare)

  if (photoShares.length === 0) {
    return <p className="text-sm text-slate-400">暂无照片分享</p>
  }

  return (
    <ul className="space-y-2">
      {photoShares.map((photo) => (
        <li
          key={photo.id}
          className="cursor-pointer rounded-lg border border-slate-200 p-2 transition-colors hover:border-slate-300"
          onClick={() => setSelectedPhotoShare(photo)}
        >
          <div className="flex gap-2">
            <img
              src={photo.imageDataUrl}
              alt="照片缩略图"
              className="h-12 w-12 flex-shrink-0 rounded object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-slate-500">
                {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
              </p>
              <input
                type="text"
                value={photo.caption}
                onChange={(e) =>
                  updatePhotoShareCaption(photo.id, e.target.value)
                }
                onBlur={async (e) => {
                  const updated = await updatePhotoCaption(
                    photo.id,
                    e.target.value
                  )
                  upsertPhotoShare(photoDtoToShare(updated))
                }}
                onClick={(e) => e.stopPropagation()}
                placeholder="添加分享文案..."
                className="mt-1 w-full border-b border-transparent bg-transparent text-sm outline-none placeholder:text-slate-300 focus:border-slate-300"
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
