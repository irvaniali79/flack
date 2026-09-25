// Shared server-side LLM helper for AI agents + summaries.
// SERVER ONLY — z-ai-web-dev-sdk must never be imported on the client.
import ZAI from 'z-ai-web-dev-sdk'

export interface LLMMessage {
  role: 'system' | 'assistant' | 'user'
  content: string
}

// Module-level singleton promise: one ZAI instance, reused across all calls.
let zaiPromise: Promise<ZAI> | null = null

function getZai(): Promise<ZAI> {
  if (!zaiPromise) {
    zaiPromise = ZAI.create().catch((err) => {
      // Reset so a later call can retry creation
      zaiPromise = null
      throw err
    })
  }
  return zaiPromise
}

const CALL_TIMEOUT_MS = 90_000
const RETRY_DELAY_MS = 500

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('LLM request timed out')), CALL_TIMEOUT_MS)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

async function callOnce(messages: LLMMessage[]): Promise<string> {
  const zai = await getZai()
  const completion = await withTimeout(
    zai.chat.completions.create({
      messages,
      thinking: { type: 'disabled' },
    }),
  )
  const reply = completion?.choices?.[0]?.message?.content
  if (typeof reply !== 'string' || !reply.trim()) throw new Error('LLM returned an empty response')
  return reply.trim()
}

/**
 * Call the LLM with one retry (500ms delay) on failure or empty reply.
 * Throws when both attempts fail — callers handle the error path.
 */
export async function callLLM(messages: LLMMessage[]): Promise<string> {
  let lastError: unknown = new Error('LLM call failed')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await callOnce(messages)
    } catch (err) {
      lastError = err
      console.error(`[agents] LLM attempt ${attempt + 1} failed:`, err instanceof Error ? err.message : err)
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
  }
  throw lastError
}
