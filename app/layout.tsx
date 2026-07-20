import type { Metadata } from "next"
import { Noto_Sans_SC } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

// 中文 webfont：通过 CSS variable 注入，--font-sans 里西文 Avenir 系优先、Noto Sans SC 兜底中文
const notoSansSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Periplus - 旅行轨迹规划",
  description: "在地图上规划你的旅行路线",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={notoSansSC.variable}>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
