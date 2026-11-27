import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import AuthSplitLayout from "@/modules/auth/ui/AuthSplitLayout"
import RegisterForm from "@/modules/auth/react/RegisterFormController"

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string | string[] }>
}) {
  if (await getCurrentUser()) redirect("/journeys")
  const { code } = await searchParams
  return (
    <AuthSplitLayout register>
      <RegisterForm initialCode={typeof code === "string" ? code : ""} />
    </AuthSplitLayout>
  )
}
