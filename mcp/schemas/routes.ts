import { z } from "zod"

export const routeInputSchema = z.unknown()

export const listRoutesInputSchema = z.object({})

export const getRouteInputSchema = z.object({
  id: z.string().min(1),
})

export const createRouteInputSchema = routeInputSchema

export const updateRouteInputSchema = z.object({
  id: z.string().min(1),
  route: routeInputSchema,
})

export const deleteRouteInputSchema = z.object({
  id: z.string().min(1),
})
