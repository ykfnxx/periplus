import { getCurrentUser } from "@/modules/auth/server/context"
import JoinJourney from "@/modules/travelogue/ui/JoinJourney"

export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const [{ token }, user] = await Promise.all([params, getCurrentUser()])
  return <JoinJourney key={token} token={token} authenticated={!!user} />
}
