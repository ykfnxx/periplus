import { prisma } from '@/lib/prisma';
import type {
  CreateRouteInput,
  RouteDto,
  RoutePointCreateInput,
  RoutePointPatchInput,
  RoutePointPosition,
  UpdateRouteInput,
} from '@/types/route';
import { mapRouteToDto } from './mapper';
import {
  validateRouteInput,
  validateRoutePointCreateInput,
  validateRoutePointPatchInput,
  validateRoutePointPosition,
} from './validation';

const routeInclude = { points: { orderBy: { order: 'asc' as const } } };

export class RouteInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RouteInputError';
  }
}

interface AddRoutePointInput {
  point: RoutePointCreateInput;
  position?: RoutePointPosition;
}

interface UpdateRoutePointInput {
  patch?: RoutePointPatchInput;
  position?: RoutePointPosition;
}

function validatedRouteInput(input: unknown): CreateRouteInput {
  const result = validateRouteInput(input);
  if (!result.ok) {
    throw new RouteInputError(result.error);
  }
  return result.data;
}

function validatedPointCreateInput(input: unknown): RoutePointCreateInput {
  const result = validateRoutePointCreateInput(input);
  if (!result.ok) {
    throw new RouteInputError(result.error);
  }
  return result.data;
}

function validatedPointPatchInput(input: unknown): RoutePointPatchInput {
  const result = validateRoutePointPatchInput(input);
  if (!result.ok) {
    throw new RouteInputError(result.error);
  }
  return result.data;
}

function validatedPointPosition(input: unknown): RoutePointPosition {
  const result = validateRoutePointPosition(input);
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

function maxPointOrder(points: { order: number }[]): number {
  return points.reduce((maxOrder, point) => Math.max(maxOrder, point.order), -1);
}

function pointPatchData(patch: RoutePointPatchInput) {
  return Object.fromEntries(
    Object.entries({
      name: patch.name,
      lat: patch.lat,
      lng: patch.lng,
      stayHours: patch.stayHours,
      notes: patch.notes,
    }).filter(([, value]) => value !== undefined)
  );
}

function orderedIdsWithPosition(
  pointIds: string[],
  movingPointId: string,
  position: RoutePointPosition
): string[] {
  const remainingIds = pointIds.filter((pointId) => pointId !== movingPointId);

  if (position.placement === 'start') {
    return [movingPointId, ...remainingIds];
  }

  if (position.placement === 'end') {
    return [...remainingIds, movingPointId];
  }

  if (position.pointId === movingPointId) {
    throw new RouteInputError('Invalid point position: point cannot be positioned relative to itself');
  }

  const anchorIndex = remainingIds.indexOf(position.pointId);
  if (anchorIndex === -1) {
    throw new RouteInputError('Invalid point position: anchor point must belong to the same route');
  }

  const insertIndex = position.placement === 'before' ? anchorIndex : anchorIndex + 1;
  return [
    ...remainingIds.slice(0, insertIndex),
    movingPointId,
    ...remainingIds.slice(insertIndex),
  ];
}

interface RoutePointOrderWriter {
  routePoint: {
    update(args: { where: { id: string }; data: { order: number } }): Promise<unknown>;
  };
}

async function normalizePointOrders(
  db: RoutePointOrderWriter,
  orderedPointIds: string[]
): Promise<void> {
  const tempBase = 1000000;

  for (const [index, pointId] of orderedPointIds.entries()) {
    await db.routePoint.update({
      where: { id: pointId },
      data: { order: tempBase + index },
    });
  }

  for (const [index, pointId] of orderedPointIds.entries()) {
    await db.routePoint.update({
      where: { id: pointId },
      data: { order: index },
    });
  }
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

export async function addRoutePoint(
  routeId: string,
  input: AddRoutePointInput
): Promise<RouteDto | null> {
  const point = validatedPointCreateInput(input?.point);
  const position = validatedPointPosition(input?.position);

  return prisma.$transaction(async (tx) => {
    const route = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    if (!route) return null;

    if (
      (position.placement === 'before' || position.placement === 'after') &&
      !route.points.some((routePoint) => routePoint.id === position.pointId)
    ) {
      throw new RouteInputError('Invalid point position: anchor point must belong to the same route');
    }

    const createdPoint = await tx.routePoint.create({
      data: {
        routeId,
        name: point.name,
        lat: point.lat,
        lng: point.lng,
        order: maxPointOrder(route.points) + 1,
        stayHours: point.stayHours,
        notes: point.notes,
      },
    });

    const orderedPointIds = orderedIdsWithPosition(
      [...route.points.map((routePoint) => routePoint.id), createdPoint.id],
      createdPoint.id,
      position
    );
    await normalizePointOrders(tx, orderedPointIds);

    const updatedRoute = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    return updatedRoute ? mapRouteToDto(updatedRoute) : null;
  });
}

export async function updateRoutePoint(
  routeId: string,
  pointId: string,
  input: UpdateRoutePointInput
): Promise<RouteDto | null> {
  const patch = input?.patch === undefined ? undefined : validatedPointPatchInput(input.patch);
  const position = input?.position === undefined ? undefined : validatedPointPosition(input.position);
  if (!patch && !position) {
    throw new RouteInputError('Invalid point update: patch or position required');
  }

  return prisma.$transaction(async (tx) => {
    const route = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    if (!route) return null;

    const existingPoint = route.points.find((point) => point.id === pointId);
    if (!existingPoint) return null;

    const orderedPointIds = position
      ? orderedIdsWithPosition(
          route.points.map((point) => point.id),
          pointId,
          position
        )
      : route.points.map((point) => point.id);

    if (patch) {
      await tx.routePoint.update({
        where: { id: pointId },
        data: pointPatchData(patch),
      });
    }
    await normalizePointOrders(tx, orderedPointIds);

    const updatedRoute = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    return updatedRoute ? mapRouteToDto(updatedRoute) : null;
  });
}

export async function deleteRoutePoint(
  routeId: string,
  pointId: string
): Promise<RouteDto | null> {
  return prisma.$transaction(async (tx) => {
    const route = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    if (!route) return null;

    const existingPoint = route.points.find((point) => point.id === pointId);
    if (!existingPoint) return null;

    await tx.routePoint.delete({
      where: { id: pointId },
    });

    await normalizePointOrders(
      tx,
      route.points.filter((point) => point.id !== pointId).map((point) => point.id)
    );

    const updatedRoute = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    return updatedRoute ? mapRouteToDto(updatedRoute) : null;
  });
}

export async function reorderRoutePoints(
  routeId: string,
  pointIds: string[]
): Promise<RouteDto | null> {
  if (!Array.isArray(pointIds) || pointIds.some((pointId) => typeof pointId !== 'string')) {
    throw new RouteInputError('Invalid point reorder: pointIds must be an array of point IDs');
  }

  return prisma.$transaction(async (tx) => {
    const route = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    if (!route) return null;

    const routePointIds = route.points.map((point) => point.id);
    const expectedPointIds = new Set(routePointIds);
    const seenPointIds = new Set<string>();

    if (pointIds.length !== routePointIds.length) {
      throw new RouteInputError('Invalid point reorder: pointIds must include every route point exactly once');
    }

    for (const pointId of pointIds) {
      if (!expectedPointIds.has(pointId) || seenPointIds.has(pointId)) {
        throw new RouteInputError('Invalid point reorder: pointIds must include every route point exactly once');
      }
      seenPointIds.add(pointId);
    }

    await normalizePointOrders(tx, pointIds);

    const updatedRoute = await tx.route.findUnique({
      where: { id: routeId },
      include: routeInclude,
    });
    return updatedRoute ? mapRouteToDto(updatedRoute) : null;
  });
}
