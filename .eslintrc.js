/**
 * JS rather than JSON so this reasoning can live next to the rule.
 *
 * The JSON version carried the explanation in a "comment" key, which ESLint
 * rejects as an unknown property — and an invalid config does not fail the
 * build, it just SKIPS LINTING. Several "the build passes" runs passed with no
 * linting at all before that was noticed.
 */
module.exports = {
  extends: ['next/core-web-vitals', 'next/typescript'],
  overrides: [
    {
      // Vendored third-party components (reui). They ship, so react-hooks and
      // accessibility rules stay ON — a stale dependency array is a real bug
      // wherever it lives. Only the two stylistic rules their upstream style
      // trips are relaxed, so re-vendoring does not mean re-editing them.
      files: ['src/components/reui/**'],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
}
