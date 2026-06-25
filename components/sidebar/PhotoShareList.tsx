'use client';

import { useMapStore } from '@/stores/mapStore';

export default function PhotoShareList() {
  const photoShares = useMapStore((s) => s.photoShares);
  const setSelectedPhotoShare = useMapStore((s) => s.setSelectedPhotoShare);
  const updatePhotoShareCaption = useMapStore((s) => s.updatePhotoShareCaption);

  if (photoShares.length === 0) {
    return <p className="text-sm text-slate-400">暂无照片分享</p>;
  }

  return (
    <ul className="space-y-2">
      {photoShares.map((photo) => (
        <li
          key={photo.id}
          className="p-2 rounded-lg border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors"
          onClick={() => setSelectedPhotoShare(photo)}
        >
          <div className="flex gap-2">
            <img
              src={photo.imageDataUrl}
              alt="照片缩略图"
              className="w-12 h-12 rounded object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 truncate">
                {photo.lat.toFixed(4)}, {photo.lng.toFixed(4)}
              </p>
              <input
                type="text"
                value={photo.caption}
                onChange={(e) => updatePhotoShareCaption(photo.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="添加分享文案..."
                className="w-full text-sm mt-1 bg-transparent border-b border-transparent focus:border-slate-300 outline-none placeholder:text-slate-300"
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
