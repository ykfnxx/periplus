'use client';

import { useRef, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { parseExifGps, wgs84ToGcj02, readFileAsDataURL } from '@/lib/exif';

export default function PhotoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addPhotoShare = useMapStore((s) => s.addPhotoShare);
  const setPendingPhotoDataUrl = useMapStore((s) => s.setPendingPhotoDataUrl);
  const setIsSelectingLocation = useMapStore((s) => s.setIsSelectingLocation);
  const isSelectingLocation = useMapStore((s) => s.isSelectingLocation);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Check file type
      if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
      }

      // Check file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('图片大小不能超过 5MB');
        return;
      }

      const imageDataUrl = await readFileAsDataURL(file);
      const gps = await parseExifGps(file);

      if (gps) {
        // Photo has GPS - place it directly
        const [gcjLng, gcjLat] = wgs84ToGcj02(gps.lng, gps.lat);
        addPhotoShare({
          lat: gcjLat,
          lng: gcjLng,
          imageDataUrl,
          caption: '',
        });
      } else {
        // No GPS - enter manual location selection mode
        setPendingPhotoDataUrl(imageDataUrl);
        setIsSelectingLocation(true);
        alert('照片没有 GPS 信息，请在地图上点击选择位置');
      }

      // Clear input to allow re-selecting same file
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [addPhotoShare, setPendingPhotoDataUrl, setIsSelectingLocation]
  );

  const handleCancelSelection = useCallback(() => {
    setPendingPhotoDataUrl(null);
    setIsSelectingLocation(false);
  }, [setPendingPhotoDataUrl, setIsSelectingLocation]);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {isSelectingLocation ? (
        <div className="space-y-2">
          <p className="text-sm text-amber-600 font-medium">
            请在地图上点击选择照片位置
          </p>
          <button
            onClick={handleCancelSelection}
            className="w-full px-4 py-2 bg-slate-200 text-slate-700 rounded text-sm hover:bg-slate-300 transition-colors"
          >
            取消选点
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 transition-colors"
        >
          + 添加照片分享
        </button>
      )}
    </div>
  );
}
