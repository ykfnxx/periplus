import { prisma } from '@/lib/prisma';
import type { CreateRouteInput, RouteDto, UpdateRouteInput } from '@/types/route';
import { mapRouteToDto } from './mapper';
import { validateRouteInput } from './validation';

const routeInclude = { points: { orderBy: { order: 'asc' as const } } };

export class RouteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteInputError';
  }
}

function validatedRouteInput(input: unknown): CreateRouteInput {
  const result = validateRouteInput(input);
  if (!result.ok) {
    throw new RouteInputError(result.error);
  }
  return result.data;
}

function pointCreateData(point: CreateRouteInput['points'][number]) {
  return {
    name: point.name,
    lat: point.lat,
    lng: point.lng,
    order: point.order,
    stayHours: point.stayHours,
    notes: point.notes,
  };
}

export async function listRoutes(): Promise<RouteDto[]> {
  const routes = await prisma.route.findMany({
    include: routeInclude,
    orderBy: { updatedAt: 'desc' },
  });
  return routes.map(mapRouteToDto);
}

export async function getRoute(id: string): Promise<RouteDto | null> {
  const route = await prisma.route.findUnique({
    where: { id },
    include: routeInclude,
  });
  return route ? mapRouteToDto(route) : null;
}

export async function createRoute(input: CreateRouteInput): Promise<RouteDto> {
  const data = validatedRouteInput(input);
  const route = await prisma.route.create({
    data: {
      name: data.name,
      description: data.description,
      points: {
        create: data.points.map(pointCreateData),
      },
    },
    include: routeInclude,
  });
  return mapRouteToDto(route);
}

export async function updateRoute(id: string, input: UpdateRouteInput): Promise<RouteDto | null> {
  const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing) return null;

  const data = validatedRouteInput(input);
  const route = await prisma.route.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      points: {
        deleteMany: {},
        create: data.points.map(pointCreateData),
      },
    },
    include: routeInclude,
  });
  return mapRouteToDto(route);
}

export async function deleteRoute(id: string): Promise<boolean> {
  const existing = await prisma.route.findUnique({ where: { id } });
  if (!existing) return false;

  await prisma.route.delete({ where: { id } });
  return true;
}
