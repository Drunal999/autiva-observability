import type { Metadata } from 'next'
import { Plus_Jakarta_Sans, JetBrains_Mono, Inter, Instrument_Serif } from 'next/font/google'
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
// Display face for the one headline moment on the city home; everything else stays on the UI sans.
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
})
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'AUTIVA — Your business workspace',
  description: 'Your automations, decisions and team in one business city.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(jakarta.variable, jetbrainsMono.variable, instrumentSerif.variable, "font-sans", inter.variable)}>
      <body>
        <AmbientBackground />
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  )
}
