'use client';

import { useRef, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { parseExifGps, wgs84ToGcj02, readFileAsDataURL } from '@/lib/exif';

export default function PhotoUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const addPhotoShare = useMapStore((s) => s.addPhotoShare);

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

      const gps = await parseExifGps(file);
      if (!gps) {
        alert('无法读取该照片的位置信息，请确保照片包含 GPS 数据');
        return;
      }

      const [gcjLng, gcjLat] = wgs84ToGcj02(gps.lng, gps.lat);
      const imageDataUrl = await readFileAsDataURL(file);

      addPhotoShare({
        lat: gcjLat,
        lng: gcjLng,
        imageDataUrl,
        caption: '',
      });

      // Clear input to allow re-selecting same file
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [addPhotoShare]
  );

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="w-full px-4 py-2 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700 transition-colors"
      >
        + 添加照片分享
      </button>
    </div>
  );
}
