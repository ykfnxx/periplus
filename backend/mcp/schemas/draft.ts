import { z } from 'zod';
import {
  pointPositionSchema,
  routeInputSchema,
  routePointCreateSchema,
  routePointPatchSchema,
} from '@/mcp/schemas/routes';

export const getCurrentDraftInputSchema = z.object({});

export const replaceDraftInputSchema = z.object({
  route: routeInputSchema.nullable(),
});

export const addDraftPointInputSchema = z.object({
  point: routePointCreateSchema,
  position: pointPositionSchema.optional(),
});

export const updateDraftPointInputSchema = z.object({
  pointId: z.string().min(1),
  patch: routePointPatchSchema.optional(),
  position: pointPositionSchema.optional(),
});

export const deleteDraftPointInputSchema = z.object({
  pointId: z.string().min(1),
});

export const reorderDraftPointsInputSchema = z.object({
  pointIds: z.array(z.string().min(1)).min(1),
});
