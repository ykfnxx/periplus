import { describe, expect, it } from 'vitest';
import { mapRouteToDto } from '@/lib/routes/mapper';

describe('mapRouteToDto', () => {
  it('maps Prisma route records to route DTOs', () => {
    const dto = mapRouteToDto({
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

    expect(dto).toEqual({
      id: 'route-1',
      name: '杭州三日',
      description: undefined,
      createdAt: '2026-06-25T08:00:00.000Z',
      updatedAt: '2026-06-25T09:00:00.000Z',
      points: [
        {
          id: 'point-1',
          name: '灵隐寺',
          lat: 30.2401,
          lng: 120.1023,
          order: 0,
          stayHours: 1.5,
          notes: undefined,
        },
      ],
    });
  });
});
