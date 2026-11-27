import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import AuthSplitLayout from "@/modules/auth/ui/AuthSplitLayout"
import LoginForm from "@/modules/auth/react/LoginFormController"

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/journeys")
  return (
    <AuthSplitLayout>
      <LoginForm />
    </AuthSplitLayout>
  )
}
