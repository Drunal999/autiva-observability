/**
 * The room's agent: it reads a day of chat and writes back a summary.
 *
 * Runs through OPENROUTER, not the Anthropic API — the key and model were
 * chosen by the team, and OpenRouter's endpoint is OpenAI-shaped, so this
 * speaks plain HTTP rather than pulling in an SDK for one call.
 *
 * INERT UNTIL CONFIGURED. Without `OPENROUTER_API_KEY` this reports that it is
 * not set up and never calls anything. The default model is a free tier, so the
 * bill is currently zero — but a key is still a credential and an unconfigured
 * capability should say so rather than fail when pressed.
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

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

/** Overridable, so swapping models is an env change rather than a deploy. */
export const CHAT_AGENT_MODEL =
  process.env.OPENROUTER_MODEL?.trim() || 'nvidia/nemotron-3.5-lightning:free'

/**
 * Generous ON PURPOSE, and the reason is not obvious.
 *
 * This is a reasoning model: its chain of thought is generated first and counts
 * against the same budget as the answer. At 80 tokens the first real test came
 * back as "Here's a thinking process: 1. Analyze User Input..." and stopped —
 * truncated mid-reasoning, having never reached the summary.
 *
 * At 2000 it failed differently and more quietly: a four-line conversation
 * spent 1,949 tokens reasoning and returned an EMPTY answer with a normal stop
 * reason. Nothing looked broken; there was simply nothing there. Double the
 * budget so the thinking and the summary both fit, and treat an empty reply as
 * the failure it is rather than posting silence into the room.
 */
const MAX_TOKENS = 4000

/**
 * Under Vercel's 60s ceiling, deliberately.
 *
 * Measured, not guessed: a four-line day takes this model 45-60 seconds,
 * because it reasons at length before answering. That is close enough to the
 * platform limit that the request must give up FIRST — a timeout we control
 * returns a sentence explaining itself, while one imposed by the platform
 * returns a gateway error with nothing useful in it.
 */
const TIMEOUT_MS = 55_000

export const AGENT_NAME = 'Room agent'

export function isChatAgentConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
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
  usage?: { input: number; output: number; cost?: number }
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
  '- Do not show your reasoning. Output only the summary itself.',
  '- Plain prose and short bullets. No headings.',
].join('\n')

export async function summariseChat(
  lines: ChatLine[],
  priorSummaries: string[] = []
): Promise<SummaryResult> {
  const key = process.env.OPENROUTER_API_KEY?.trim()
  if (!key) {
    return {
      ok: false,
      error:
        'The room agent is not configured. Set OPENROUTER_API_KEY to switch it on.',
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
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // OpenRouter attributes traffic with these; harmless, and it keeps the
        // request identifiable in their dashboard rather than anonymous.
        'HTTP-Referer': process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
        'X-Title': 'Autiva Mission Control',
      },
      body: JSON.stringify({
        model: CHAT_AGENT_MODEL,
        max_tokens: MAX_TOKENS,
        // Keeps the chain of thought out of the reply entirely. Without it the
        // model's reasoning arrives inside `content` and would be posted into
        // the room as though it were the summary.
        reasoning: { exclude: true },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `${memory}Today's conversation:\n\n${transcript}` },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    const payload = (await res.json().catch(() => null)) as {
      choices?: {
        message?: { content?: string; reasoning?: string }
        finish_reason?: string
        native_finish_reason?: string
      }[]
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        cost?: number
        completion_tokens_details?: { reasoning_tokens?: number }
      }
      error?: { message?: string; code?: number }
    } | null

    if (!res.ok || payload?.error) {
      const detail = payload?.error?.message ?? `HTTP ${res.status}`
      if (res.status === 401) return { ok: false, error: 'OPENROUTER_API_KEY was rejected. Check the key.' }
      if (res.status === 429) {
        return {
          ok: false,
          // The default model is a free tier, and free tiers queue. Saying so
          // turns a mystery failure into a wait.
          error: 'Rate limited — free models throttle when busy. Try again shortly.',
        }
      }
      return { ok: false, error: `OpenRouter returned ${res.status}: ${detail}` }
    }

    const choice = payload?.choices?.[0]
    const text = (choice?.message?.content ?? '').trim()

    if (choice?.finish_reason === 'length' || !text) {
      // These two are the same failure wearing different clothes, and the
      // distinction is invisible without the numbers: the model reasons before
      // it answers, so when the budget runs out it either stops mid-sentence
      // OR returns a perfectly normal-looking response with nothing in it.
      //
      // The message carries the numbers because guessing at this cost several
      // rounds: "returned nothing" alone says only that something is wrong,
      // while "spent 3,980 of 4,000 on reasoning" says exactly what to change.
      const reasoning = payload?.usage?.completion_tokens_details?.reasoning_tokens ?? 0
      const out = payload?.usage?.completion_tokens ?? 0
      const ranOut = out >= MAX_TOKENS * 0.95 || choice?.finish_reason === 'length'
      return {
        ok: false,
        error: ranOut
          ? `The model used its whole ${MAX_TOKENS}-token budget thinking (${reasoning} reasoning tokens) and never got to the summary. A shorter day, or a model that reasons less, would fix it.`
          : `The agent returned nothing (stop reason: ${choice?.finish_reason ?? 'unknown'}, ${reasoning} reasoning tokens).`,
      }
    }

    return {
      ok: true,
      text,
      usage: {
        input: payload?.usage?.prompt_tokens ?? 0,
        output: payload?.usage?.completion_tokens ?? 0,
        cost: payload?.usage?.cost,
      },
    }
  } catch (err) {
    if ((err as Error)?.name === 'TimeoutError') {
      return { ok: false, error: 'The agent took too long and was given up on.' }
    }
    return { ok: false, error: 'Could not reach OpenRouter.' }
  }
}
