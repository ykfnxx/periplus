import RouteCard from '@/components/RouteCard';
import { silkRoadRoute } from '@/lib/mock-routes';
import Link from 'next/link';
import type { Route } from '@/stores/mapStore';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Periplus</h1>
          <Link
            href="/map"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            创建新路线
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <section className="mb-8">
          <h2 className="text-lg font-semibold mb-4">经典路线</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <RouteCard route={silkRoadRoute} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">已保存的路线</h2>
          <SavedRoutes />
        </section>
      </main>
    </div>
  );
}

async function SavedRoutes() {
  const res = await fetch('http://localhost:3000/api/routes', {
    cache: 'no-store',
  });

  if (!res.ok) {
    return <p className="text-sm text-slate-400">暂无保存的路线</p>;
  }

  const routes = await res.json();

  if (routes.length === 0) {
    return <p className="text-sm text-slate-400">暂无保存的路线</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {routes.map((route: Route) => (
        <RouteCard key={route.id} route={route} />
      ))}
    </div>
  );
}
