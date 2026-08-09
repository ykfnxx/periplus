import { z } from "zod"
import { HOTEL_PLACE_TYPES } from "@/lib/hotels/types"

const requestIdSchema = z.string().trim().min(1)

export const hotelSearchInputSchema = z
  .object({
    requestId: requestIdSchema,
    originQuery: z.string().trim().min(1),
    place: z.string().trim().min(1),
    placeType: z.enum(HOTEL_PLACE_TYPES),
    countryCode: z.string().trim().length(2).optional(),
    checkInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    stayNights: z.number().int().positive().max(30),
    adultCount: z.number().int().positive().max(10),
    size: z.number().int().positive().max(10).default(5),
  })
  .strict()
