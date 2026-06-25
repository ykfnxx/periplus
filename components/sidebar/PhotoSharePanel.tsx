'use client';

import PhotoUploader from './PhotoUploader';
import PhotoShareList from './PhotoShareList';

export default function PhotoSharePanel() {
  return (
    <div className="mt-4 pt-4 border-t border-slate-200">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">照片分享</h3>
      <PhotoUploader />
      <div className="mt-2">
        <PhotoShareList />
      </div>
    </div>
  );
}
