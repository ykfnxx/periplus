"use client"

import PhotoMaterials from "./PhotoMaterials"

export default function PhotosPanel() {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-black tracking-[0.16em] text-[var(--periplus-teak)] uppercase">
          PHOTOS
        </p>
        <h2 className="mt-1 text-2xl leading-tight font-black text-[var(--periplus-ink)]">
          照片素材
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--periplus-walnut)]">
          上传旅途照片，带 GPS 的照片会直接落到地图上。
        </p>
      </div>
      <PhotoMaterials />
    </div>
  )
}
