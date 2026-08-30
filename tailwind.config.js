/**
 * The single Tailwind config.
 *
 * There were two: a tracked `tailwind.config.ts` and an untracked
 * `tailwind.config.js`. Tailwind resolves `.js` first, so the untracked one
 * silently won — which meant the effective config was not in version control
 * and differed from the one anyone reading the repo would have found.
 *
 * The stale `.js` was wrong in two ways that produced no error anywhere:
 *
 *  1. It mapped tokens as `hsl(var(--card))`, but globals.css defines them as
 *     COMPLETE colour values (`--card: oklch(0.205 0 0)`, `--border:
 *     oklch(1 0 0 / 10%)`, `--background: #0a1020`). The output was
 *     `hsl(oklch(...))` — invalid, so browsers dropped the declaration and
 *     every `bg-card` / `border-border` / `bg-muted` rendered as nothing.
 *  2. It had no `fontFamily`, so `font-mono` and `font-sans` fell back to
 *     Tailwind's defaults instead of the JetBrains Mono and Plus Jakarta
 *     faces the app loads. Text still rendered, in the wrong typeface — the
 *     kind of regression that looks like a design choice.
 *
 * Merging the correct `.ts` into the tracked `.js` and deleting the other, so
 * there is one config, it is the one in git, and it is right.
 */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // Bare `var(--x)`, NOT `hsl(var(--x))`: these variables already hold
        // complete colours (oklch, hex), so wrapping them in hsl() produces
        // invalid CSS that is silently discarded.
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // shadcn/reui tokens — required so `border-border`, `bg-card` and
        // friends resolve under Tailwind v3.
        border: 'var(--border)',
        input: 'var(--input)',
        ring: 'var(--ring)',
        card: { DEFAULT: 'var(--card)', foreground: 'var(--card-foreground)' },
        popover: { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary: { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary: { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted: { DEFAULT: 'var(--muted)', foreground: 'var(--muted-foreground)' },
        accent: { DEFAULT: 'var(--accent)', foreground: 'var(--accent-foreground)' },
        destructive: { DEFAULT: 'var(--destructive)', foreground: 'var(--destructive-foreground)' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // Restored from the config that was being shadowed. Without these,
      // `font-mono` is Tailwind's default stack rather than JetBrains Mono,
      // and `backdrop-blur-xs` emits nothing at all — it is not a v3 default.
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      backdropBlur: { xs: '4px' },
      boxShadow: { glass: '0 8px 32px 0 rgba(0, 0, 0, 0.37)' },
      transitionTimingFunction: { fluid: 'cubic-bezier(0.4, 0, 0.2, 1)' },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
