import { describe, expect, it } from 'vitest';
import {
  validateRouteInput,
  validateRoutePointCreateInput,
  validateRoutePointPatchInput,
  validateRoutePointPosition,
} from '@/lib/routes/validation';

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

describe('route point validators', () => {
  it('validates point creation input without requiring order', () => {
    const result = validateRoutePointCreateInput({
      name: '西湖',
      lat: 30.246,
      lng: 120.146,
      stayHours: 2.5,
      notes: '下午散步',
    });

    expect(result).toEqual({
      ok: true,
      data: {
        name: '西湖',
        lat: 30.246,
        lng: 120.146,
        stayHours: 2.5,
        notes: '下午散步',
      },
    });
  });

  it('validates nullable point patch fields', () => {
    const result = validateRoutePointPatchInput({
      stayHours: null,
      notes: null,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        stayHours: null,
        notes: null,
      },
    });
  });

  it('rejects empty point patches', () => {
    const result = validateRoutePointPatchInput({});

    expect(result).toEqual({
      ok: false,
      error: 'Invalid point patch: at least one field is required',
    });
  });

  it('validates relative route point positions', () => {
    expect(validateRoutePointPosition({ placement: 'start' })).toEqual({
      ok: true,
      data: { placement: 'start' },
    });

    expect(validateRoutePointPosition({ placement: 'after', pointId: 'point-1' })).toEqual({
      ok: true,
      data: { placement: 'after', pointId: 'point-1' },
    });
  });

  it('rejects relative positions without anchor point ids', () => {
    const result = validateRoutePointPosition({ placement: 'before' });

    expect(result).toEqual({
      ok: false,
      error: 'Invalid point position: before requires pointId',
    });
  });
});
