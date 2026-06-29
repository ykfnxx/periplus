'use client';

import { Settings } from 'lucide-react';

export default function MapSettingsButton() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <button
        type="button"
        aria-label="地图设置"
        title="地图设置"
        className="pointer-events-auto absolute top-5 right-5 flex h-11 w-11 items-center justify-center rounded-full border border-[rgb(44_36_22_/_16%)] bg-[var(--periplus-soft-white)]/95 text-[var(--periplus-ink)] shadow-[var(--periplus-soft-shadow)] transition hover:border-[var(--periplus-russet)] hover:text-[var(--periplus-russet)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--periplus-russet)]"
      >
        <Settings className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
