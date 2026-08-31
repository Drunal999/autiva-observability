import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Declared inside vi.hoisted: the vi.mock factory is lifted above every
// top-level statement, so classes declared normally are not yet initialised
// when it runs.
const h = vi.hoisted(() => {
  class FakeAPIError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  class FakeAuthError extends FakeAPIError {}
  class FakeRateLimitError extends FakeAPIError {}
  return { create: vi.fn(), FakeAPIError, FakeAuthError, FakeRateLimitError }
})

vi.mock('@anthropic-ai/sdk', () => {
  // A real class, because the module is used with `new Anthropic()`. A
  // vi.fn() returning an object is not constructible.
  class Anthropic {
    messages = { create: h.create }
    static APIError = h.FakeAPIError
    static AuthenticationError = h.FakeAuthError
    static RateLimitError = h.FakeRateLimitError
  }
  return { default: Anthropic }
})

import { summariseChat, isChatAgentConfigured, CHAT_AGENT_MODEL } from '../chatAgent'

const LINES = [
  { author: 'Devarshi', at: '2026-08-31T09:00:00Z', body: 'moving the ingest endpoint' },
  { author: 'Hardik', at: '2026-08-31T09:05:00Z', body: 'agreed, I will take the hooks' },
]

let saved: string | undefined
beforeEach(() => {
  vi.clearAllMocks()
  saved = process.env.ANTHROPIC_API_KEY
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test'
  h.create.mockResolvedValue({
    content: [{ type: 'text', text: 'Devarshi moved the ingest endpoint. Hardik took the hooks.' }],
    usage: { input_tokens: 900, output_tokens: 60 },
  })
})
afterEach(() => {
  if (saved === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = saved
})

describe('the room agent stays inert until configured', () => {
  it('reports itself off with no key', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(isChatAgentConfigured()).toBe(false)
  })

  it('treats a blank key as no key', () => {
    process.env.ANTHROPIC_API_KEY = '   '
    expect(isChatAgentConfigured()).toBe(false)
  })

  it('NEVER calls the API without a key, and says why', async () => {
    // The whole point of building this inert: no key must mean no spend, and
    // an explained state rather than a stack trace.
    delete process.env.ANTHROPIC_API_KEY
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/ANTHROPIC_API_KEY/)
    expect(r.error).toMatch(/billed per use/)
    expect(h.create).not.toHaveBeenCalled()
  })

  it('does not call the API with nothing to summarise', async () => {
    const r = await summariseChat([])
    expect(r.ok).toBe(false)
    expect(h.create).not.toHaveBeenCalled()
  })
})

describe('summarising', () => {
  it('uses Haiku 4.5 and caps the response', async () => {
    await summariseChat(LINES)
    const req = h.create.mock.calls[0][0]
    expect(req.model).toBe('claude-haiku-4-5')
    expect(CHAT_AGENT_MODEL).toBe('claude-haiku-4-5')
    expect(req.max_tokens).toBeLessThanOrEqual(1200)
  })

  it('sends the conversation with who said what', async () => {
    await summariseChat(LINES)
    const content = h.create.mock.calls[0][0].messages[0].content as string
    expect(content).toContain('Devarshi: moving the ingest endpoint')
    expect(content).toContain('Hardik: agreed, I will take the hooks')
  })

  it('passes earlier summaries as memory, oldest first', async () => {
    // Memory, not learning: the model is told what it already said so it can
    // build on it. Nothing is trained.
    await summariseChat(LINES, ['Monday: chose Neon.', 'Tuesday: hooks landed.'])
    const content = h.create.mock.calls[0][0].messages[0].content as string
    expect(content.indexOf('Monday: chose Neon.')).toBeLessThan(content.indexOf('Tuesday: hooks landed.'))
    expect(content).toMatch(/build on these rather than repeating/i)
  })

  it('sends no memory block when there is no history', async () => {
    await summariseChat(LINES)
    expect(h.create.mock.calls[0][0].messages[0].content).not.toMatch(/Earlier summaries/)
  })

  it('instructs it not to invent a decision', async () => {
    // An invented conclusion in a summary teammates trust is the worst failure
    // this feature has.
    await summariseChat(LINES)
    expect(h.create.mock.calls[0][0].system).toMatch(/NOT settled/)
  })

  it('returns the text and the token usage', async () => {
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(true)
    expect(r.text).toContain('Devarshi moved the ingest endpoint')
    expect(r.usage).toEqual({ input: 900, output: 60 })
  })

  it('reads only text blocks from the response', async () => {
    h.create.mockResolvedValue({
      content: [
        { type: 'thinking', thinking: 'ignore me' },
        { type: 'text', text: 'the summary' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    expect((await summariseChat(LINES)).text).toBe('the summary')
  })

  it('treats an empty response as a failure rather than posting nothing', async () => {
    h.create.mockResolvedValue({ content: [], usage: { input_tokens: 1, output_tokens: 0 } })
    expect((await summariseChat(LINES)).ok).toBe(false)
  })
})

describe('failures are told apart', () => {
  it('says the key was rejected', async () => {
    h.create.mockRejectedValue(new h.FakeAuthError(401, 'bad key'))
    expect((await summariseChat(LINES)).error).toMatch(/key/i)
  })

  it('says to try again when rate limited', async () => {
    h.create.mockRejectedValue(new h.FakeRateLimitError(429, 'slow down'))
    expect((await summariseChat(LINES)).error).toMatch(/try again/i)
  })

  it('reports the status for any other API error', async () => {
    h.create.mockRejectedValue(new h.FakeAPIError(500, 'upstream blew up'))
    expect((await summariseChat(LINES)).error).toMatch(/500/)
  })

  it('never throws at the caller', async () => {
    // This is triggered by a button in a chat window; an exception here would
    // take the room down with it.
    h.create.mockRejectedValue(new Error('socket hang up'))
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
