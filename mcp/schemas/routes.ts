import { z } from 'zod';

const pointPositionSchema = z.discriminatedUnion('placement', [
  z.object({ placement: z.literal('start') }),
  z.object({ placement: z.literal('end') }),
  z.object({ placement: z.literal('before'), pointId: z.string().min(1) }),
  z.object({ placement: z.literal('after'), pointId: z.string().min(1) }),
]);

const routePointInputSchema = z.object({
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  order: z.number().finite(),
  stayHours: z.number().positive().optional(),
  notes: z.string().optional(),
});

const routePointCreateSchema = routePointInputSchema.omit({ order: true });

const routePointPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    stayHours: z.number().positive().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one patch field is required',
  });

export const routeInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  points: z.array(routePointInputSchema).min(1),
});

export const listRoutesInputSchema = z.object({});

export const getRouteInputSchema = z.object({
  id: z.string().min(1),
});

export const createRouteInputSchema = routeInputSchema;

export const updateRouteInputSchema = z.object({
  id: z.string().min(1),
  route: routeInputSchema,
});

export const deleteRouteInputSchema = z.object({
  id: z.string().min(1),
});

export const addRoutePointInputSchema = z.object({
  routeId: z.string().min(1),
  point: routePointCreateSchema,
  position: pointPositionSchema.optional(),
});

export const updateRoutePointInputSchema = z.object({
  routeId: z.string().min(1),
  pointId: z.string().min(1),
  patch: routePointPatchSchema.optional(),
  position: pointPositionSchema.optional(),
});

export const deleteRoutePointInputSchema = z.object({
  routeId: z.string().min(1),
  pointId: z.string().min(1),
});

export const reorderRoutePointsInputSchema = z.object({
  routeId: z.string().min(1),
  pointIds: z.array(z.string().min(1)).min(1),
});
