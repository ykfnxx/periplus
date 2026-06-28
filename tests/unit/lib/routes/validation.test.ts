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

    expect(result).toStrictEqual({
      ok: true,
      data: {
        stayHours: null,
        notes: null,
      },
    });
    if (result.ok) {
      expect(Object.keys(result.data)).toStrictEqual(['stayHours', 'notes']);
    }
  });

  it('rejects empty point patches', () => {
    const result = validateRoutePointPatchInput({});

    expect(result).toEqual({
      ok: false,
      error: 'Invalid point patch: at least one field is required',
    });
  });

  it('rejects undefined-only point patches', () => {
    const result = validateRoutePointPatchInput({ notes: undefined });

    expect(result).toStrictEqual({
      ok: false,
      error: 'Invalid point patch: at least one field is required',
    });
  });

  it('rejects legacy stayDays point patches', () => {
    const result = validateRoutePointPatchInput({ stayDays: 1, notes: 'x' });

    expect(result).toStrictEqual({
      ok: false,
      error: 'Invalid point patch: stayDays has been replaced by stayHours',
    });
  });

  it('returns only supplied trimmed point patch fields', () => {
    const result = validateRoutePointPatchInput({
      name: ' 西湖 ',
      notes: ' 下午 ',
    });

    expect(result).toStrictEqual({
      ok: true,
      data: {
        name: '西湖',
        notes: '下午',
      },
    });
    if (result.ok) {
      expect(Object.keys(result.data)).toStrictEqual(['name', 'notes']);
    }
  });

  it('rejects point patches with inherited name only', () => {
    const result = validateRoutePointPatchInput(Object.create({ name: 'Inherited' }));

    expect(result).toStrictEqual({
      ok: false,
      error: 'Invalid point patch: at least one field is required',
    });
  });

  it('rejects point patches with inherited coordinates only', () => {
    const result = validateRoutePointPatchInput(Object.create({ lat: 30.246, lng: 120.146 }));

    expect(result).toStrictEqual({
      ok: false,
      error: 'Invalid point patch: at least one field is required',
    });
  });

  it('rejects point patches when inherited coordinates complete an own coordinate', () => {
    const input = Object.create({ lat: 30.246 });
    input.lng = 120.146;

    const result = validateRoutePointPatchInput(input);

    expect(result).toStrictEqual({
      ok: false,
      error: 'Invalid point patch: lat and lng must be numbers',
    });
  });

  it('omits explicit undefined notes from valid point patches', () => {
    const result = validateRoutePointPatchInput({
      name: ' 西湖 ',
      notes: undefined,
    });

    expect(result).toStrictEqual({
      ok: true,
      data: {
        name: '西湖',
      },
    });
    if (result.ok) {
      expect(Object.keys(result.data)).toStrictEqual(['name']);
    }
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
