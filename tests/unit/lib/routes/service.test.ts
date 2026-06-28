import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
  route: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  routePoint: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    route: prismaMocks.route,
    routePoint: prismaMocks.routePoint,
    $transaction: prismaMocks.$transaction,
  },
}));

import {
  addRoutePoint,
  createRoute,
  deleteRoutePoint,
  getRoute,
  reorderRoutePoints,
  RouteInputError,
  updateRoutePoint,
} from '@/lib/routes/service';

describe('route service', () => {
  const baseRoute = {
    id: 'route-1',
    name: '杭州三日',
    description: null,
    createdAt: new Date('2026-06-25T08:00:00.000Z'),
    updatedAt: new Date('2026-06-25T09:00:00.000Z'),
    points: [
      {
        id: 'point-1',
        routeId: 'route-1',
        name: '灵隐寺',
        lat: 30.2401,
        lng: 120.1023,
        order: 0,
        stayHours: 1.5,
        notes: null,
      },
      {
        id: 'point-2',
        routeId: 'route-1',
        name: '西湖',
        lat: 30.246,
        lng: 120.146,
        order: 1,
        stayHours: 2,
        notes: null,
      },
    ],
  };

  const routeAfterMutation = {
    ...baseRoute,
    updatedAt: new Date('2026-06-25T10:00:00.000Z'),
    points: [
      baseRoute.points[0],
      {
        id: 'point-3',
        routeId: 'route-1',
        name: '河坊街',
        lat: 30.242,
        lng: 120.171,
        order: 1,
        stayHours: 1,
        notes: '晚上去',
      },
      { ...baseRoute.points[1], order: 2 },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMocks.$transaction.mockImplementation(async (callback) =>
      callback({
        route: prismaMocks.route,
        routePoint: prismaMocks.routePoint,
      })
    );
  });

  it('creates routes through Prisma and returns a DTO', async () => {
    prismaMocks.route.create.mockResolvedValueOnce({
      id: 'route-1',
      name: '杭州三日',
      description: null,
      createdAt: new Date('2026-06-25T08:00:00.000Z'),
      updatedAt: new Date('2026-06-25T09:00:00.000Z'),
      points: [
        {
          id: 'point-1',
          routeId: 'route-1',
          name: '灵隐寺',
          lat: 30.2401,
          lng: 120.1023,
          order: 0,
          stayHours: 1.5,
          notes: null,
        },
      ],
    });

    const route = await createRoute({
      name: '杭州三日',
      points: [
        {
          name: '灵隐寺',
          lat: 30.2401,
          lng: 120.1023,
          order: 0,
          stayHours: 1.5,
        },
      ],
    });

    expect(prismaMocks.route.create).toHaveBeenCalledWith({
      data: {
        name: '杭州三日',
        description: undefined,
        points: {
          create: [
            {
              name: '灵隐寺',
              lat: 30.2401,
              lng: 120.1023,
              order: 0,
              stayHours: 1.5,
              notes: undefined,
            },
          ],
        },
      },
      include: { points: { orderBy: { order: 'asc' } } },
    });
    expect(route.points[0].stayHours).toBe(1.5);
  });

  it('throws RouteInputError for invalid route input', async () => {
    await expect(
      createRoute({
        name: '',
        points: [],
      })
    ).rejects.toBeInstanceOf(RouteInputError);

    expect(prismaMocks.route.create).not.toHaveBeenCalled();
  });

  it('returns null when a route is not found', async () => {
    prismaMocks.route.findUnique.mockResolvedValueOnce(null);

    await expect(getRoute('missing-route')).resolves.toBeNull();
  });

  it('adds a route point after an anchor and normalizes order', async () => {
    prismaMocks.route.findUnique
      .mockResolvedValueOnce(baseRoute)
      .mockResolvedValueOnce(routeAfterMutation);
    prismaMocks.routePoint.create.mockResolvedValueOnce({
      id: 'point-3',
      routeId: 'route-1',
      name: '河坊街',
      lat: 30.242,
      lng: 120.171,
      order: 2,
      stayHours: 1,
      notes: '晚上去',
    });

    const route = await addRoutePoint('route-1', {
      point: {
        name: '河坊街',
        lat: 30.242,
        lng: 120.171,
        stayHours: 1,
        notes: '晚上去',
      },
      position: { placement: 'after', pointId: 'point-1' },
    });

    expect(prismaMocks.routePoint.create).toHaveBeenCalledWith({
      data: {
        routeId: 'route-1',
        name: '河坊街',
        lat: 30.242,
        lng: 120.171,
        order: 2,
        stayHours: 1,
        notes: '晚上去',
      },
    });
    expect(prismaMocks.routePoint.update).toHaveBeenCalledWith({
      where: { id: 'point-3' },
      data: { order: 4 },
    });
    expect(prismaMocks.routePoint.update).toHaveBeenCalledWith({
      where: { id: 'point-3' },
      data: { order: 1 },
    });
    expect(route?.points.map((point) => point.id)).toEqual(['point-1', 'point-3', 'point-2']);
  });

  it('returns null when adding a point to a missing route', async () => {
    prismaMocks.route.findUnique.mockResolvedValueOnce(null);

    await expect(
      addRoutePoint('missing-route', {
        point: {
          name: '河坊街',
          lat: 30.242,
          lng: 120.171,
        },
      })
    ).resolves.toBeNull();

    expect(prismaMocks.routePoint.create).not.toHaveBeenCalled();
  });

  it('rejects adding a route point relative to an anchor outside the route', async () => {
    prismaMocks.route.findUnique.mockResolvedValueOnce(baseRoute);

    await expect(
      addRoutePoint('route-1', {
        point: {
          name: '河坊街',
          lat: 30.242,
          lng: 120.171,
        },
        position: { placement: 'before', pointId: 'other-route-point' },
      })
    ).rejects.toBeInstanceOf(RouteInputError);

    expect(prismaMocks.routePoint.create).not.toHaveBeenCalled();
  });

  it('updates a route point patch and moves it before another point', async () => {
    prismaMocks.route.findUnique
      .mockResolvedValueOnce(baseRoute)
      .mockResolvedValueOnce({
        ...baseRoute,
        points: [
          { ...baseRoute.points[1], order: 0 },
          { ...baseRoute.points[0], name: '灵隐寺飞来峰', order: 1 },
        ],
      });

    const route = await updateRoutePoint('route-1', 'point-1', {
      patch: { name: '灵隐寺飞来峰' },
      position: { placement: 'before', pointId: 'point-2' },
    });

    expect(prismaMocks.routePoint.update).toHaveBeenCalledWith({
      where: { id: 'point-1' },
      data: { name: '灵隐寺飞来峰' },
    });
    expect(route?.points.map((point) => point.id)).toEqual(['point-2', 'point-1']);
  });

  it('rejects positioning a route point relative to itself', async () => {
    prismaMocks.route.findUnique.mockResolvedValueOnce(baseRoute);

    await expect(
      updateRoutePoint('route-1', 'point-1', {
        patch: { name: '灵隐寺飞来峰' },
        position: { placement: 'before', pointId: 'point-1' },
      })
    ).rejects.toBeInstanceOf(RouteInputError);
  });

  it('deletes a route point and normalizes remaining order', async () => {
    prismaMocks.route.findUnique
      .mockResolvedValueOnce(baseRoute)
      .mockResolvedValueOnce({
        ...baseRoute,
        points: [{ ...baseRoute.points[1], order: 0 }],
      });

    const route = await deleteRoutePoint('route-1', 'point-1');

    expect(prismaMocks.routePoint.delete).toHaveBeenCalledWith({
      where: { id: 'point-1' },
    });
    expect(route?.points).toHaveLength(1);
    expect(route?.points[0].order).toBe(0);
  });

  it('rejects incomplete route point reorder lists', async () => {
    prismaMocks.route.findUnique.mockResolvedValueOnce(baseRoute);

    await expect(reorderRoutePoints('route-1', ['point-1'])).rejects.toBeInstanceOf(RouteInputError);
  });

  it('reorders route points from a complete unique list and normalizes order', async () => {
    prismaMocks.route.findUnique
      .mockResolvedValueOnce(baseRoute)
      .mockResolvedValueOnce({
        ...baseRoute,
        points: [
          { ...baseRoute.points[1], order: 0 },
          { ...baseRoute.points[0], order: 1 },
        ],
      });

    const route = await reorderRoutePoints('route-1', ['point-2', 'point-1']);

    expect(prismaMocks.routePoint.update).toHaveBeenCalledWith({
      where: { id: 'point-2' },
      data: { order: 2 },
    });
    expect(prismaMocks.routePoint.update).toHaveBeenCalledWith({
      where: { id: 'point-1' },
      data: { order: 1 },
    });
    expect(route?.points.map((point) => point.id)).toEqual(['point-2', 'point-1']);
  });

  it('derives temporary reorder orders above the current max order', async () => {
    const highOrderRoute = {
      ...baseRoute,
      points: [
        { ...baseRoute.points[0], order: 1000000 },
        { ...baseRoute.points[1], order: 1000001 },
      ],
    };
    prismaMocks.route.findUnique
      .mockResolvedValueOnce(highOrderRoute)
      .mockResolvedValueOnce({
        ...baseRoute,
        points: [
          { ...baseRoute.points[1], order: 0 },
          { ...baseRoute.points[0], order: 1 },
        ],
      });

    await reorderRoutePoints('route-1', ['point-2', 'point-1']);

    expect(prismaMocks.routePoint.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'point-2' },
      data: { order: 1000002 },
    });
  });
});
