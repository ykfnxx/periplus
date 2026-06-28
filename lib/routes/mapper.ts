import type { RouteDto, RoutePointDto } from '@/types/route';

interface RoutePointRecord {
  id: string;
  routeId: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
  stayHours: number | null;
  notes: string | null;
}

interface RouteRecord {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  points: RoutePointRecord[];
}

function mapPointToDto(point: RoutePointRecord): RoutePointDto {
  return {
    id: point.id,
    name: point.name,
    lat: point.lat,
    lng: point.lng,
    order: point.order,
    stayHours: point.stayHours ?? undefined,
    notes: point.notes ?? undefined,
  };
}

export function mapRouteToDto(route: RouteRecord): RouteDto {
  return {
    id: route.id,
    name: route.name,
    description: route.description ?? undefined,
    createdAt: route.createdAt.toISOString(),
    updatedAt: route.updatedAt.toISOString(),
    points: route.points.map(mapPointToDto),
  };
}
