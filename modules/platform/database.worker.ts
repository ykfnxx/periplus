import { getCloudflareContext } from "@opennextjs/cloudflare"
import { PrismaClient } from "@periplus/worker-prisma/wasm.js"
import { PrismaPg } from "@prisma/adapter-pg"

const clients = new WeakMap<object, PrismaClient>()

// A Hyperdrive connection may only be used in the request that opened it.
export const prisma = new Proxy({} as PrismaClient, {
  get(_, property) {
    const { ctx, env } = getCloudflareContext()
    let client = clients.get(ctx)
    if (!client) {
      client = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: env.HYPERDRIVE.connectionString,
          max: 1,
          idleTimeoutMillis: 100,
        }),
      })
      clients.set(ctx, client)
    }
    const member = Reflect.get(client, property)
    return typeof member === "function" ? member.bind(client) : member
  },
})
