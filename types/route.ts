export interface RoutePointDto {
  id: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
  stayHours?: number;
  notes?: string;
}

export interface RouteDto {
  id: string;
  name: string;
  description?: string;
  points: RoutePointDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RoutePointInput {
  name: string;
  lat: number;
  lng: number;
  order: number;
  stayHours?: number;
  notes?: string;
}

export interface RouteInput {
  name: string;
  description?: string;
  points: RoutePointInput[];
}

export type CreateRouteInput = RouteInput;
export type UpdateRouteInput = RouteInput;

export type Route = RouteDto;
export type RoutePoint = RoutePointDto;
