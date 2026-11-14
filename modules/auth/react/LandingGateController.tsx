"use client"
import LandingGate from "../ui/LandingGate"
import LoginForm from "./LoginFormController"
import RegisterForm from "./RegisterFormController"
export default function LandingGateController() {
  return (
    <LandingGate
      renderLogin={(switchMode) => (
        <LoginForm onSwitchToRegister={switchMode} />
      )}
      renderRegister={(switchMode) => (
        <RegisterForm onSwitchToLogin={switchMode} />
      )}
    />
  )
}
