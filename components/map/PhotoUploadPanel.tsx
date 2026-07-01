"use client"

import PhotoMaterials from "@/components/workbench/PhotoMaterials"

export default function PhotoUploadPanel() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-black text-[var(--periplus-ink)]">照片</h2>
      <PhotoMaterials />
    </div>
  )
}
