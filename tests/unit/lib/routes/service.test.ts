import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMocks = vi.hoisted(() => ({
  route: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    route: prismaMocks.route,
  },
}));

import { createRoute, getRoute, RouteInputError } from '@/lib/routes/service';

describe('route service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
