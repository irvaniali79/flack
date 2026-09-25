import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireUser } from '@/lib/auth'
import { callLLM, type LLMMessage } from '@/lib/agents/llm'

export const dynamic = 'force-dynamic'

const MAX_MESSAGES = 40

const summarySchema = z.object({
  channelId: z.string().min(1),
  threadOf: z.string().min(1).optional().nullable(),
})

function formatTime(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

// ─── POST: AI summary of a channel ("Catch me up") or a thread ───────────────

export async function POST(request: Request) {
  return handle(async () => {
    const me = await requireUser()
    const parsed = summarySchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'channelId is required')
    const { channelId, threadOf } = parsed.data

    const channel = await db.channel.findFirst({
      where: { id: channelId, orgId: me.orgId },
      include: { members: { where: { userId: me.id } } },
    })
    if (!channel) throw new HttpError(404, 'Channel not found')
    const isMember = channel.members.length > 0
    if (!isMember && channel.kind !== 'public') {
      throw new HttpError(403, 'You are not a member of this channel')
    }

    // Gather the conversation: thread replies, or the most recent messages
    let rows
    if (threadOf) {
      const [root, replies] = await Promise.all([
        db.message.findFirst({
          where: { id: threadOf, channelId: channel.id },
          include: { sender: true },
        }),
        db.message.findMany({
          where: { channelId: channel.id, parentId: threadOf, deletedAt: null },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: { sender: true },
        }),
      ])
      if (!root) throw new HttpError(404, 'Thread not found')
      rows = [root, ...replies]
    } else {
      rows = (
        await db.message.findMany({
          where: { channelId: channel.id, deletedAt: null },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: MAX_MESSAGES,
          include: { sender: true },
        })
      ).reverse()
    }

    if (rows.length === 0) {
      throw new HttpError(400, 'Nothing to summarize yet — this conversation is empty')
    }

    const transcript = rows
      .map((row) => `${row.sender?.name ?? 'Unknown'} (${formatTime(row.createdAt)}): ${row.body}`)
      .join('\n')

    const isDm = channel.kind === 'dm' || channel.kind === 'group_dm'
    const where = isDm
      ? 'a direct message conversation'
      : `the channel #${channel.name}${channel.topic ? ` (topic: ${channel.topic})` : ''}`

    const llmMessages: LLMMessage[] = [
      {
        role: 'system',
        content:
          'You are Aria, an assistant inside a team chat. Summarize conversations crisply. ' +
          "Output Markdown: a 1-2 sentence overview, then '## Key points' with 3-6 bullets, " +
          "then '## Decisions & action items' if any exist (with @names), then '## Open questions' if any. " +
          'Never invent facts.',
      },
      {
        role: 'user',
        content: `Summarize this recent conversation from ${where}:\n\n${transcript}`,
      },
    ]

    const summary = await callLLM(llmMessages)
    return { summary }
  })
}
