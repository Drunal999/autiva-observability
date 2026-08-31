import Anthropic from '@anthropic-ai/sdk'

/**
 * The room's agent: it reads a day of chat and writes back a summary.
 *
 * INERT UNTIL CONFIGURED. Without `ANTHROPIC_API_KEY` this reports that it is
 * not set up and never calls anything. Every other call in this codebase is
 * free; this one is metered, so the absence of a key must be an obvious,
 * explained state rather than a stack trace or a silent no-op.
 *
 * "GROWS AND LEARNS WITH US" — what that actually means here, stated plainly
 * so nobody is misled by the phrase:
 *
 *   The model does not learn from your chats. Nothing here trains anything;
 *   weights are fixed, and a conversation leaves no trace in them.
 *
 *   What it does have is MEMORY. Past summaries live in the room as messages,
 *   and each new summary is given the recent ones as context — so it knows what
 *   was already decided, stops re-explaining it, and can say "this follows on
 *   from Tuesday". Continuity, accumulated by us, not learning done by it.
 *
 * That distinction matters when somebody later asks why it "forgot" something:
 * the answer will be that the thing was never in the context, not that it
 * failed to learn.
 */

/** Cheapest model that writes a decent summary. See docs/chat-agent.md. */
export const CHAT_AGENT_MODEL = 'claude-haiku-4-5'

/** A summary is a paragraph or two. This caps the cost of a runaway response. */
const MAX_TOKENS = 1200

export const AGENT_NAME = 'Room agent'

export function isChatAgentConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

export interface ChatLine {
  author: string
  at: string
  body: string
}

export interface SummaryResult {
  ok: boolean
  text?: string
  error?: string
  /** Reported back so the cost of the feature is visible, not hidden. */
  usage?: { input: number; output: number }
}

const SYSTEM = [
  'You summarise a small engineering team’s chat room for teammates who were away.',
  '',
  'Write for someone catching up in thirty seconds. Lead with what was decided or',
  'changed. Then anything still open or waiting on a person. Skip greetings, banter',
  'and anything that needs no follow-up.',
  '',
  'Rules:',
  '- Attribute decisions to the person who made them, by name.',
  '- If something was discussed but NOT settled, say so plainly rather than',
  '  implying a conclusion. An invented decision is worse than no summary.',
  '- Do not repeat what earlier summaries already established; build on them.',
  '- If the day holds nothing worth reporting, say exactly that in one line.',
  '- No preamble, no sign-off, no "here is a summary". Start with the content.',
  '- Plain prose and short bullets. No headings.',
].join('\n')

/**
 * Summarises one day of conversation.
 *
 * `priorSummaries` is the memory: the last few summaries, oldest first, so the
 * agent can build on what it already said instead of restating it.
 */
export async function summariseChat(
  lines: ChatLine[],
  priorSummaries: string[] = []
): Promise<SummaryResult> {
  if (!isChatAgentConfigured()) {
    return {
      ok: false,
      error:
        'The room agent is not configured. Set ANTHROPIC_API_KEY to switch it on — ' +
        'it is billed per use, separately from any Claude subscription.',
    }
  }
  if (lines.length === 0) {
    return { ok: false, error: 'There is nothing to summarise yet today.' }
  }

  const transcript = lines
    .map((l) => `[${new Date(l.at).toISOString().slice(11, 16)}] ${l.author}: ${l.body}`)
    .join('\n')

  const memory = priorSummaries.length
    ? `Earlier summaries of this room, oldest first. Build on these rather than repeating them:\n\n${priorSummaries.join('\n\n---\n\n')}\n\n`
    : ''

  try {
    const client = new Anthropic()
    const response = await client.messages.create({
      model: CHAT_AGENT_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${memory}Today's conversation:\n\n${transcript}`,
        },
      ],
    })

    // content is a discriminated union; narrow before reading .text.
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    if (!text) return { ok: false, error: 'The agent returned nothing.' }

    return {
      ok: true,
      text,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    }
  } catch (err) {
    // Typed classes, not string matching — the distinction between "your key is
    // wrong" and "try again shortly" is the whole value of the message.
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: 'ANTHROPIC_API_KEY was rejected. Check the key.' }
    }
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, error: 'Rate limited by the API. Try again in a moment.' }
    }
    if (err instanceof Anthropic.APIError) {
      return { ok: false, error: `The API returned ${err.status}: ${err.message}` }
    }
    return { ok: false, error: 'Could not reach the API.' }
  }
}
