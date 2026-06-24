import { describe, it, expect } from 'vitest';
import { silkRoadRoute } from '@/lib/mock-routes';

describe('silkRoadRoute', () => {
  it('has correct name and description', () => {
    expect(silkRoadRoute.name).toBe('丝绸之路');
    expect(silkRoadRoute.description).toContain('长安');
  });

  it('has 7 points in correct order', () => {
    expect(silkRoadRoute.points).toHaveLength(7);
    const orders = silkRoadRoute.points.map((p) => p.order);
    expect(orders).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('first point is 西安 and last is 乌鲁木齐', () => {
    const sorted = [...silkRoadRoute.points].sort((a, b) => a.order - b.order);
    expect(sorted[0].name).toBe('西安');
    expect(sorted[6].name).toBe('乌鲁木齐');
  });

  it('all coordinates are within valid China bounds (GCJ-02)', () => {
    for (const point of silkRoadRoute.points) {
      expect(point.lat).toBeGreaterThanOrEqual(18);
      expect(point.lat).toBeLessThanOrEqual(54);
      expect(point.lng).toBeGreaterThanOrEqual(73);
      expect(point.lng).toBeLessThanOrEqual(135);
    }
  });
});
