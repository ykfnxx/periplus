import Link from 'next/link';
import type { Route } from '@/types/route';

interface RouteCardProps {
  route: Route;
}

export default function RouteCard({ route }: RouteCardProps) {
  return (
    <Link
      href={`/map?route=${route.id}`}
      className="block p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all bg-white"
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">{route.name}</h3>
          {route.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{route.description}</p>
          )}
        </div>
        <span className="text-2xl">🗺️</span>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
        <span>{route.points.length} 个地点</span>
        <span>•</span>
        <span>{new Date(route.updatedAt).toLocaleDateString('zh-CN')}</span>
      </div>
    </Link>
  );
}
