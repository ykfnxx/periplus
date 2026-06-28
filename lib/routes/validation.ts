import type { RouteInput, RoutePointInput } from '@/types/route';

type ValidationResult =
  | { ok: true; data: RouteInput }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function validatePoint(point: unknown): { ok: true; data: RoutePointInput } | { ok: false; error: string } {
  if (!isRecord(point)) {
    return { ok: false, error: 'Invalid point data: name, lat, lng, order required' };
  }

  if ('stayDays' in point) {
    return {
      ok: false,
      error: 'Invalid point data: stayDays has been replaced by stayHours',
    };
  }

  if (
    typeof point.name !== 'string' ||
    point.name.trim().length === 0 ||
    typeof point.lat !== 'number' ||
    typeof point.lng !== 'number' ||
    typeof point.order !== 'number'
  ) {
    return { ok: false, error: 'Invalid point data: name, lat, lng, order required' };
  }

  if (!Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90) {
    return { ok: false, error: 'Invalid point data: lat must be between -90 and 90' };
  }

  if (!Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180) {
    return { ok: false, error: 'Invalid point data: lng must be between -180 and 180' };
  }

  if (!Number.isFinite(point.order)) {
    return { ok: false, error: 'Invalid point data: order must be a finite number' };
  }

  if (point.stayHours !== undefined) {
    if (
      typeof point.stayHours !== 'number' ||
      !Number.isFinite(point.stayHours) ||
      point.stayHours <= 0
    ) {
      return {
        ok: false,
        error: 'Invalid point data: stayHours must be greater than 0',
      };
    }
  }

  if (!isOptionalString(point.notes)) {
    return { ok: false, error: 'Invalid point data: notes must be a string' };
  }

  return {
    ok: true,
    data: {
      name: point.name.trim(),
      lat: point.lat,
      lng: point.lng,
      order: point.order,
      stayHours: point.stayHours,
      notes: point.notes?.trim() || undefined,
    },
  };
}

export function validateRouteInput(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'Invalid input: name and points required' };
  }

  if (
    typeof input.name !== 'string' ||
    input.name.trim().length === 0 ||
    !Array.isArray(input.points) ||
    input.points.length === 0
  ) {
    return { ok: false, error: 'Invalid input: name and points required' };
  }

  if (!isOptionalString(input.description)) {
    return { ok: false, error: 'Invalid input: description must be a string' };
  }

  const points: RoutePointInput[] = [];
  for (const point of input.points) {
    const result = validatePoint(point);
    if (!result.ok) return result;
    points.push(result.data);
  }

  return {
    ok: true,
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      points,
    },
  };
}
