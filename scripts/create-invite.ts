import { parseArgs } from "node:util"
import {
  issueInviteCodes,
  issueOptions,
} from "../modules/auth/server/invite-codes"
import { prisma } from "../modules/data/db/prisma"

const { values } = parseArgs({
  options: {
    count: { type: "string" },
    uses: { type: "string" },
    "expires-at": { type: "string" },
    note: { type: "string" },
  },
})
try {
  const options = issueOptions.parse({
    count: Number(values.count ?? 1),
    maxUses: Number(values.uses ?? 1),
    expiresAt: values["expires-at"],
    note: values.note,
  })
  for (const invite of await issueInviteCodes(options, null))
    console.log(invite.code, invite.url)
} finally {
  await prisma.$disconnect()
}
