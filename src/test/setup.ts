import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// vitest.config.ts doesn't set test.globals, so @testing-library/react's
// automatic afterEach(cleanup) registration never fires — without this,
// component renders accumulate across tests in the same file.
afterEach(() => {
  cleanup()
})

