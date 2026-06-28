import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeServiceMocks = vi.hoisted(() => ({
  listRoutes: vi.fn(),
  getRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
  addRoutePoint: vi.fn(),
  updateRoutePoint: vi.fn(),
  deleteRoutePoint: vi.fn(),
  reorderRoutePoints: vi.fn(),
}));

vi.mock('@/lib/routes/service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/routes/service')>(
    '@/lib/routes/service'
  );
  return {
    ...actual,
    listRoutes: routeServiceMocks.listRoutes,
    getRoute: routeServiceMocks.getRoute,
    createRoute: routeServiceMocks.createRoute,
    updateRoute: routeServiceMocks.updateRoute,
    deleteRoute: routeServiceMocks.deleteRoute,
    addRoutePoint: routeServiceMocks.addRoutePoint,
    updateRoutePoint: routeServiceMocks.updateRoutePoint,
    deleteRoutePoint: routeServiceMocks.deleteRoutePoint,
    reorderRoutePoints: routeServiceMocks.reorderRoutePoints,
  };
});

import { routeToolHandlers } from '@/mcp/tools/routes';

const routeDto = {
  id: 'route-1',
  name: '杭州三日',
  points: [
    {
      id: 'point-1',
      name: '灵隐寺',
      lat: 30.2401,
      lng: 120.1023,
      order: 0,
    },
  ],
  createdAt: '2026-06-25T08:00:00.000Z',
  updatedAt: '2026-06-25T09:00:00.000Z',
};

describe('route MCP tool handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists routes through the route service', async () => {
    routeServiceMocks.listRoutes.mockResolvedValueOnce([routeDto]);

    const result = await routeToolHandlers.listRoutes({});

    expect(routeServiceMocks.listRoutes).toHaveBeenCalledWith();
    expect(result.content[0].text).toContain('route-1');
  });

  it('returns not_found when get_route misses', async () => {
    routeServiceMocks.getRoute.mockResolvedValueOnce(null);

    const result = await routeToolHandlers.getRoute({ id: 'missing-route' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not_found');
  });

  it('adds route points with relative position', async () => {
    routeServiceMocks.addRoutePoint.mockResolvedValueOnce(routeDto);

    const result = await routeToolHandlers.addRoutePoint({
      routeId: 'route-1',
      point: { name: '西湖', lat: 30.246, lng: 120.146 },
      position: { placement: 'after', pointId: 'point-1' },
    });

    expect(routeServiceMocks.addRoutePoint).toHaveBeenCalledWith('route-1', {
      point: { name: '西湖', lat: 30.246, lng: 120.146 },
      position: { placement: 'after', pointId: 'point-1' },
    });
    expect(result.content[0].text).toContain('route-1');
  });

  it('moves route points through update_route_point', async () => {
    routeServiceMocks.updateRoutePoint.mockResolvedValueOnce(routeDto);

    await routeToolHandlers.updateRoutePoint({
      routeId: 'route-1',
      pointId: 'point-1',
      position: { placement: 'end' },
    });

    expect(routeServiceMocks.updateRoutePoint).toHaveBeenCalledWith('route-1', 'point-1', {
      position: { placement: 'end' },
    });
  });

  it('returns invalid_input for schema failures', async () => {
    const result = await routeToolHandlers.addRoutePoint({
      routeId: 'route-1',
      point: { name: 'Bad coordinate', lat: 200, lng: 120 },
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('invalid_input');
  });
});
