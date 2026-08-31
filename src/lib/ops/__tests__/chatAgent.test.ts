import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { summariseChat, isChatAgentConfigured, CHAT_AGENT_MODEL } from '../chatAgent'

const LINES = [
  { author: 'Devarshi', at: '2026-08-31T09:00:00Z', body: 'moving the ingest endpoint' },
  { author: 'Hardik', at: '2026-08-31T09:05:00Z', body: 'agreed, I will take the hooks' },
]

const reply = (content: string) => ({
  ok: true,
  status: 200,
  json: async () => ({
    choices: [{ message: { content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 900, completion_tokens: 60, cost: 0 },
  }),
})

let fetchMock: ReturnType<typeof vi.fn>
let savedKey: string | undefined

beforeEach(() => {
  savedKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = 'sk-or-v1-test'
  fetchMock = vi.fn().mockResolvedValue(reply('Devarshi moved the ingest endpoint.'))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (savedKey === undefined) delete process.env.OPENROUTER_API_KEY
  else process.env.OPENROUTER_API_KEY = savedKey
})

const bodyOf = () => JSON.parse(fetchMock.mock.calls[0][1].body as string)
const userMsg = () => bodyOf().messages.find((m: { role: string }) => m.role === 'user').content
const systemMsg = () => bodyOf().messages.find((m: { role: string }) => m.role === 'system').content

describe('the room agent stays inert until configured', () => {
  it('reports itself off with no key', () => {
    delete process.env.OPENROUTER_API_KEY
    expect(isChatAgentConfigured()).toBe(false)
  })

  it('treats a blank key as no key', () => {
    process.env.OPENROUTER_API_KEY = '   '
    expect(isChatAgentConfigured()).toBe(false)
  })

  it('NEVER calls out without a key, and names the one that is missing', async () => {
    delete process.env.OPENROUTER_API_KEY
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/OPENROUTER_API_KEY/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not call out with nothing to summarise', async () => {
    expect((await summariseChat([])).ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('the request', () => {
  it('goes to OpenRouter with the configured model', async () => {
    await summariseChat(LINES)
    expect(fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(bodyOf().model).toBe(CHAT_AGENT_MODEL)
  })

  it('excludes the chain of thought from the reply', async () => {
    // Without this the model's reasoning arrives inside `content` and would be
    // posted into the room as though it were the summary.
    await summariseChat(LINES)
    expect(bodyOf().reasoning).toEqual({ exclude: true })
  })

  it('leaves room for reasoning AND an answer', async () => {
    // This is a reasoning model: its chain of thought counts against the same
    // budget as the answer. At 80 tokens the first real call came back as
    // "Here's a thinking process: 1. Analyze User Input..." and stopped,
    // never reaching the summary. A tight cap yields no summary, not a short
    // one.
    await summariseChat(LINES)
    expect(bodyOf().max_tokens).toBeGreaterThanOrEqual(1000)
  })

  it('sends the conversation with who said what', async () => {
    await summariseChat(LINES)
    expect(userMsg()).toContain('Devarshi: moving the ingest endpoint')
    expect(userMsg()).toContain('Hardik: agreed, I will take the hooks')
  })

  it('passes earlier summaries as memory, oldest first', async () => {
    // Memory, not learning: it is told what it already said so it can build on
    // it. Nothing is trained.
    await summariseChat(LINES, ['Monday: chose Neon.', 'Tuesday: hooks landed.'])
    expect(userMsg().indexOf('Monday: chose Neon.')).toBeLessThan(
      userMsg().indexOf('Tuesday: hooks landed.')
    )
  })

  it('sends no memory block when there is no history', async () => {
    await summariseChat(LINES)
    expect(userMsg()).not.toMatch(/Earlier summaries/)
  })

  it('instructs it not to invent a decision', async () => {
    // An invented conclusion in a summary teammates trust is the worst failure
    // this feature has.
    await summariseChat(LINES)
    expect(systemMsg()).toMatch(/NOT settled/)
  })

  it('sends the key as a bearer token', async () => {
    await summariseChat(LINES)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-or-v1-test')
  })
})

describe('the response', () => {
  it('returns the text and the usage', async () => {
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(true)
    expect(r.text).toBe('Devarshi moved the ingest endpoint.')
    expect(r.usage).toEqual({ input: 900, output: 60, cost: 0 })
  })

  it('refuses a truncated summary rather than posting half a thought', async () => {
    // Half a day's record, presented as the whole record, is worse than none.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Devarshi moved the' }, finish_reason: 'length' }],
        usage: { completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 3980 } },
      }),
    })
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(false)
    // The numbers are the point: "returned nothing" says only that something is
    // wrong, while "3980 reasoning tokens" says what to change.
    expect(r.error).toMatch(/3980 reasoning tokens/)
  })

  it('reports an empty reply that burned the budget as exactly that', async () => {
    // The failure that cost several rounds to diagnose: a normal stop reason,
    // no error, and nothing in the message, because the model spent the whole
    // budget thinking and never reached the answer.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '' }, finish_reason: 'stop' }],
        usage: { completion_tokens: 3990, completion_tokens_details: { reasoning_tokens: 3990 } },
      }),
    })
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/never got to the summary/i)
  })

  it('treats an empty reply as a failure', async () => {
    fetchMock.mockResolvedValue(reply('   '))
    expect((await summariseChat(LINES)).ok).toBe(false)
  })
})

describe('failures are told apart', () => {
  const fail = (status: number, message = 'nope') => ({
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  })

  it('says the key was rejected', async () => {
    fetchMock.mockResolvedValue(fail(401))
    expect((await summariseChat(LINES)).error).toMatch(/key/i)
  })

  it('explains that free models throttle', async () => {
    // A bare "429" sends somebody hunting for a bug that is not there.
    fetchMock.mockResolvedValue(fail(429))
    expect((await summariseChat(LINES)).error).toMatch(/free models throttle/i)
  })

  it('reports the status for anything else', async () => {
    fetchMock.mockResolvedValue(fail(502, 'upstream gone'))
    expect((await summariseChat(LINES)).error).toMatch(/502/)
  })

  it('says so when it gives up waiting', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }))
    expect((await summariseChat(LINES)).error).toMatch(/too long/i)
  })

  it('never throws at the caller', async () => {
    // Triggered by a button in a chat window; an exception would take the room
    // down with it.
    fetchMock.mockRejectedValue(new Error('socket hang up'))
    const r = await summariseChat(LINES)
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })
})
