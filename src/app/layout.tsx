import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono, Inter } from 'next/font/google'
import './globals.css'
import { SessionProviderWrapper } from '@/components/SessionProviderWrapper'
import { AmbientBackground } from '@/components/AmbientBackground'
import { cn } from "@/lib/utils";

const inter = Inter({subsets:['latin'],variable:'--font-sans'});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'JARVIS. — Team Board',
  description: 'Internal Team Dashboard — Task & Assignment Board',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(jakarta.variable, jetbrainsMono.variable, "font-sans", inter.variable)}>
      <body>
        <AmbientBackground />
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  )
}
