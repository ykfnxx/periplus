import { beforeEach, describe, expect, it, vi } from 'vitest';

const routeServiceMocks = vi.hoisted(() => ({
  createRoute: vi.fn(),
  getRoute: vi.fn(),
  updateRoute: vi.fn(),
}));

vi.mock('@/lib/routes/service', () => routeServiceMocks);

import { DraftStore } from '@/backend/draft-store';
import type { Route } from '@/types/route';

const routeInput = {
  name: '杭州周末',
  points: [
    { name: '西湖', lat: 30.246, lng: 120.146, order: 0 },
    { name: '灵隐寺', lat: 30.24, lng: 120.102, order: 1 },
  ],
};

describe('DraftStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds draft points by relative position and normalizes order', () => {
    const store = new DraftStore();
    const initial = store.replaceDraft('session-1', routeInput);
    const firstPointId = initial.route!.points[0].id;

    const snapshot = store.addDraftPoint('session-1', {
      point: { name: '龙井村', lat: 30.223, lng: 120.091, stayHours: 2 },
      position: { placement: 'before', pointId: firstPointId },
    });

    expect(snapshot.route!.points.map((point) => point.name)).toEqual([
      '龙井村',
      '西湖',
      '灵隐寺',
    ]);
    expect(snapshot.route!.points.map((point) => point.order)).toEqual([0, 1, 2]);
  });

  it('saves a new draft through route creation', async () => {
    const savedRoute: Route = {
      id: 'route-saved',
      name: '杭州周末',
      points: [
        { id: 'point-1', name: '西湖', lat: 30.246, lng: 120.146, order: 0 },
        { id: 'point-2', name: '灵隐寺', lat: 30.24, lng: 120.102, order: 1 },
      ],
      createdAt: '2026-06-30T00:00:00.000Z',
      updatedAt: '2026-06-30T01:00:00.000Z',
    };
    routeServiceMocks.createRoute.mockResolvedValueOnce(savedRoute);
    const store = new DraftStore();
    store.replaceDraft('session-1', routeInput);

    const snapshot = await store.saveDraft('session-1');

    expect(routeServiceMocks.createRoute).toHaveBeenCalledWith(routeInput);
    expect(snapshot.sourceRouteId).toBe('route-saved');
    expect(snapshot.route!.id).toBe('route-saved');
  });
});
