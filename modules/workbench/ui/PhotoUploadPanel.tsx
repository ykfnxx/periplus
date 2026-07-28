"use client"

import PhotoMaterials from "@/modules/workbench/ui/PhotoMaterials"

export default function PhotoUploadPanel() {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold text-ink">照片</h2>
      <PhotoMaterials />
    </div>
  )
}
