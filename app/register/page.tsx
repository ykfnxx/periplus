import RegisterForm from "@/components/auth/RegisterForm"

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--periplus-cream)] px-6 text-[var(--periplus-ink)]">
      <section className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <h1 className="text-4xl font-black tracking-normal">Periplus</h1>
          <p className="mt-2 text-sm font-bold text-[var(--periplus-walnut)]">
            注册
          </p>
        </div>
        <RegisterForm />
      </section>
    </main>
  )
}
