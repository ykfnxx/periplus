import type { CreateRouteInput, RouteDto, UpdateRouteInput } from '@/types/route';

export class RouteApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'RouteApiError';
  }
}

async function parseRouteResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : '路线请求失败';
    throw new RouteApiError(message, response.status);
  }

  return body as T;
}

export async function listRoutes(): Promise<RouteDto[]> {
  const response = await fetch('/api/routes', { cache: 'no-store' });
  return parseRouteResponse<RouteDto[]>(response);
}

export async function getRoute(id: string): Promise<RouteDto> {
  const response = await fetch(`/api/routes/${id}`, { cache: 'no-store' });
  return parseRouteResponse<RouteDto>(response);
}

export async function createRoute(input: CreateRouteInput): Promise<RouteDto> {
  const response = await fetch('/api/routes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseRouteResponse<RouteDto>(response);
}

export async function updateRoute(id: string, input: UpdateRouteInput): Promise<RouteDto> {
  const response = await fetch(`/api/routes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return parseRouteResponse<RouteDto>(response);
}
