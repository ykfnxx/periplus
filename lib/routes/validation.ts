import type {
  RouteInput,
  RoutePointCreateInput,
  RoutePointInput,
  RoutePointPatchInput,
  RoutePointPosition,
} from '@/types/route';

type ValidationResult =
  | { ok: true; data: RouteInput }
  | { ok: false; error: string };

type PointCreateValidationResult =
  | { ok: true; data: RoutePointCreateInput }
  | { ok: false; error: string };

type PointPatchValidationResult =
  | { ok: true; data: RoutePointPatchInput }
  | { ok: false; error: string };

type PointPositionValidationResult =
  | { ok: true; data: RoutePointPosition }
  | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function validateLatLng(lat: unknown, lng: unknown, context: string): string | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return `${context}: lat and lng must be numbers`;
  }

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return `${context}: lat must be between -90 and 90`;
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return `${context}: lng must be between -180 and 180`;
  }

  return null;
}

function validateStayHours(value: unknown, context: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return `${context}: stayHours must be greater than 0`;
  }
  return null;
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

  const latLngError = validateLatLng(point.lat, point.lng, 'Invalid point data');
  if (latLngError) return { ok: false, error: latLngError };

  if (!Number.isFinite(point.order)) {
    return { ok: false, error: 'Invalid point data: order must be a finite number' };
  }

  const stayHoursError = validateStayHours(point.stayHours, 'Invalid point data');
  if (stayHoursError) return { ok: false, error: stayHoursError };

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
      stayHours: typeof point.stayHours === 'number' ? point.stayHours : undefined,
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

export function validateRoutePointCreateInput(input: unknown): PointCreateValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'Invalid point data: name, lat, lng required' };
  }

  if ('stayDays' in input) {
    return {
      ok: false,
      error: 'Invalid point data: stayDays has been replaced by stayHours',
    };
  }

  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return { ok: false, error: 'Invalid point data: name is required' };
  }

  const latLngError = validateLatLng(input.lat, input.lng, 'Invalid point data');
  if (latLngError) return { ok: false, error: latLngError };

  const stayHoursError = validateStayHours(input.stayHours, 'Invalid point data');
  if (stayHoursError) return { ok: false, error: stayHoursError };

  if (!isOptionalString(input.notes)) {
    return { ok: false, error: 'Invalid point data: notes must be a string' };
  }

  const lat = input.lat as number;
  const lng = input.lng as number;

  return {
    ok: true,
    data: {
      name: input.name.trim(),
      lat,
      lng,
      stayHours: typeof input.stayHours === 'number' ? input.stayHours : undefined,
      notes: input.notes?.trim() || undefined,
    },
  };
}

export function validateRoutePointPatchInput(input: unknown): PointPatchValidationResult {
  if (!isRecord(input)) {
    return { ok: false, error: 'Invalid point patch: object required' };
  }

  if ('stayDays' in input) {
    return {
      ok: false,
      error: 'Invalid point patch: stayDays has been replaced by stayHours',
    };
  }

  const data: RoutePointPatchInput = {};

  if ('name' in input && input.name !== undefined) {
    if (typeof input.name !== 'string' || input.name.trim().length === 0) {
      return { ok: false, error: 'Invalid point patch: name must be a non-empty string' };
    }
    data.name = input.name.trim();
  }

  if (input.lat !== undefined || input.lng !== undefined) {
    const latLngError = validateLatLng(input.lat, input.lng, 'Invalid point patch');
    if (latLngError) return { ok: false, error: latLngError };
    data.lat = input.lat as number;
    data.lng = input.lng as number;
  }

  if ('stayHours' in input && input.stayHours !== undefined) {
    if (input.stayHours === null) {
      data.stayHours = null;
    } else {
      const stayHoursError = validateStayHours(input.stayHours, 'Invalid point patch');
      if (stayHoursError) return { ok: false, error: stayHoursError };
      data.stayHours = input.stayHours as number;
    }
  }

  if ('notes' in input && input.notes !== undefined) {
    if (!isOptionalNullableString(input.notes)) {
      return { ok: false, error: 'Invalid point patch: notes must be a string or null' };
    }
    data.notes = input.notes === null ? null : input.notes.trim() || null;
  }

  if (Object.keys(data).length === 0) {
    return { ok: false, error: 'Invalid point patch: at least one field is required' };
  }

  return {
    ok: true,
    data,
  };
}

export function validateRoutePointPosition(input: unknown): PointPositionValidationResult {
  if (input === undefined) {
    return { ok: true, data: { placement: 'end' } };
  }

  if (!isRecord(input) || typeof input.placement !== 'string') {
    return { ok: false, error: 'Invalid point position: placement required' };
  }

  if (input.placement === 'start' || input.placement === 'end') {
    return { ok: true, data: { placement: input.placement } };
  }

  if (input.placement === 'before' || input.placement === 'after') {
    if (typeof input.pointId !== 'string' || input.pointId.trim().length === 0) {
      return { ok: false, error: `Invalid point position: ${input.placement} requires pointId` };
    }
    return {
      ok: true,
      data: { placement: input.placement, pointId: input.pointId.trim() },
    };
  }

  return { ok: false, error: 'Invalid point position: placement must be start, end, before, or after' };
}
