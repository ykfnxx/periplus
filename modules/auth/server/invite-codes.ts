import { randomBytes } from "node:crypto"
import { z } from "zod"
import { prisma } from "@/modules/data/db/prisma"
import { periplusServerConfig } from "@/config/periplus.server"

export const issueOptions = z
  .object({
    count: z.number().int().min(1).max(100).default(1),
    maxUses: z.number().int().positive().max(2147483647).default(1),
    expiresAt: z.iso
      .datetime({ offset: true })
      .refine((v) => Date.parse(v) > Date.now(), "有效期必须晚于当前时间")
      .optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export async function issueInviteCodes(
  options: z.output<typeof issueOptions>,
  createdById: string | null
) {
  return prisma.$transaction(async (tx) => {
    const codes: { code: string; url: string }[] = []
    while (codes.length < options.count) {
      const data = Array.from({ length: options.count - codes.length }, () => {
        const raw = Array.from(
          randomBytes(8),
          (byte) => alphabet[byte & 31]
        ).join("")
        return {
          code: `PERI-${raw.slice(0, 4)}-${raw.slice(4)}`,
          createdById,
          maxUses: options.maxUses,
          expiresAt: options.expiresAt,
          note: options.note,
        }
      })
      const issued = await tx.inviteCode.createManyAndReturn({
        data,
        skipDuplicates: true,
        select: { code: true },
      })
      for (const { code } of issued)
        codes.push({
          code,
          url: new URL(
            "/register?code=" + code,
            periplusServerConfig.app.baseUrl
          ).href,
        })
    }
    return codes
  })
}
