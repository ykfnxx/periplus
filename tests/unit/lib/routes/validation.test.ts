import { describe, expect, it } from 'vitest';
import { validateRouteInput } from '@/lib/routes/validation';

describe('validateRouteInput', () => {
  it('accepts decimal stayHours for route points', () => {
    const result = validateRouteInput({
      name: '杭州三日',
      description: '古迹和美食',
      points: [
        {
          name: '灵隐寺',
          lat: 30.2401,
          lng: 120.1023,
          order: 0,
          stayHours: 1.5,
          notes: '上午去',
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.points[0].stayHours).toBe(1.5);
    }
  });

  it('rejects non-positive stayHours', () => {
    const result = validateRouteInput({
      name: '杭州三日',
      points: [
        {
          name: '灵隐寺',
          lat: 30.2401,
          lng: 120.1023,
          order: 0,
          stayHours: 0,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: 'Invalid point data: stayHours must be greater than 0',
    });
  });

  it('rejects legacy stayDays input', () => {
    const result = validateRouteInput({
      name: '杭州三日',
      points: [
        {
          name: '灵隐寺',
          lat: 30.2401,
          lng: 120.1023,
          order: 0,
          stayDays: 1,
        },
      ],
    });

    expect(result).toEqual({
      ok: false,
      error: 'Invalid point data: stayDays has been replaced by stayHours',
    });
  });
});
