'use client';

import { LocateFixed, Map as MapIcon, Plus, Star } from 'lucide-react';
import { useMapStore } from '@/stores/mapStore';

const iconButtonBaseClass =
  'flex h-11 w-11 items-center justify-center border border-[rgb(44_36_22_/_16%)] bg-[var(--periplus-soft-white)]/95 text-[var(--periplus-ink)] shadow-[var(--periplus-soft-shadow)] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--periplus-russet)]';

const iconButtonClass = `${iconButtonBaseClass} hover:border-[var(--periplus-russet)] hover:text-[var(--periplus-russet)]`;

export default function MapFloatingControls() {
  const map = useMapStore((state) => state.map);
  const startPointLocationSelection = useMapStore(
    (state) => state.startPointLocationSelection
  );
  const setActiveWorkbenchTab = useMapStore(
    (state) => state.setActiveWorkbenchTab
  );

  const locate = () => {
    map?.setZoomAndCenter(5, [104.5, 36.5]);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div className="pointer-events-auto absolute top-5 right-5 flex overflow-hidden rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)]/90 shadow-[var(--periplus-soft-shadow)]">
        <button
          type="button"
          disabled
          aria-label="地图样式"
          title="地图样式"
          className={`${iconButtonBaseClass} cursor-not-allowed rounded-none border-0 text-[var(--periplus-teak)] opacity-45 shadow-none`}
        >
          <MapIcon className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="探索推荐"
          title="探索推荐"
          onClick={() => setActiveWorkbenchTab('explore')}
          className={`${iconButtonClass} rounded-none border-0 border-l border-l-[rgb(44_36_22_/_12%)] shadow-none`}
        >
          <Star className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="pointer-events-auto absolute right-5 bottom-5 flex flex-col gap-3">
        <button
          type="button"
          aria-label="定位到默认视图"
          title="定位到默认视图"
          onClick={locate}
          className={`${iconButtonClass} rounded-full`}
        >
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="地图选点"
          title="地图选点"
          onClick={startPointLocationSelection}
          className={`${iconButtonClass} rounded-full bg-[var(--periplus-russet)] text-[var(--periplus-soft-white)] hover:border-[var(--periplus-ink)] hover:bg-[var(--periplus-ink)] hover:text-[var(--periplus-soft-white)]`}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
