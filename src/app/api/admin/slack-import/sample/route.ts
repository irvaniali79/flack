// GET /api/admin/slack-import/sample — generates a small but realistic Slack
// workspace-export ZIP so the import flow can be tried end-to-end without a
// real Slack workspace. Includes: 5 users (2 with emails that match existing
// Acme accounts → email matching demo; 2 brand-new; 1 bot), 2 channels with
// mrkdwn, mentions, a thread, reactions, pinned + subtype + deleted noise.
import { zipSync, strToU8 } from 'fflate'

const DAY = 86_400
const HOUR = 3_600

export async function GET() {
  // Historic dates relative to "now" so the import always shows real history
  const nowSec = Math.floor(Date.now() / 1000)
  const t = (daysAgo: number, hourOffset = 0) => (nowSec - daysAgo * DAY + hourOffset * HOUR).toFixed(6) as string

  const users = [
    {
      id: 'U900',
      name: 'maya.r',
      deleted: false,
      is_bot: false,
      profile: { email: 'maya.rivera@import.test', real_name: 'Maya Rivera', display_name: 'maya', title: 'Imported marketing lead' },
    },
    {
      id: 'U901',
      name: 'dev.tom',
      deleted: false,
      is_bot: false,
      profile: { email: 'dev.tom@import.test', real_name: 'Tom Nguyen', display_name: 'tom', title: 'Imported backend dev' },
    },
    // These two match existing Acme users by email → "matched" on import
    { id: 'U902', name: 'priya', deleted: false, is_bot: false, profile: { email: 'priya@acme.test', real_name: 'Priya Patel', display_name: 'priya' } },
    { id: 'U903', name: 'sarah', deleted: false, is_bot: false, profile: { email: 'sarah@acme.test', real_name: 'Sarah Chen', display_name: 'sarah' } },
    // A bot — imports as "(Slack bot)" user so attribution survives
    { id: 'B950', name: 'standup-bot', deleted: false, is_bot: true, profile: { real_name: 'standup-bot', display_name: 'standup-bot' } },
    // Deleted account — messages render as "Unknown", no user created
    { id: 'U904', name: 'former.teammate', deleted: true, is_bot: false, profile: { email: 'former@import.test', real_name: 'Old Teammate' } },
  ]

  const channels = [
    {
      id: 'C900',
      name: 'marketing-import',
      created: nowSec - 40 * DAY,
      creator: 'U900',
      topic: { value: 'Campaign chatter imported from Slack' },
      purpose: { value: 'Everything pre-migration marketing' },
      members: ['U900', 'U901', 'U902', 'U903', 'B950'],
    },
    {
      id: 'C901',
      name: 'incident-review',
      created: nowSec - 25 * DAY,
      creator: 'U903',
      topic: { value: 'Post-mortems and on-call follow-ups' },
      purpose: { value: '' },
      members: ['U901', 'U902', 'U903', 'U904'],
    },
  ]

  // prettier-ignore
  const marketingMessages = [
    { type: 'message', subtype: 'channel_join', ts: t(30, 0), user: 'U900', text: '<@U900> has joined the channel' }, // skipped
    { type: 'message', ts: t(30, 1), user: 'U900', text: 'Kicking off our *big Q3 campaign planning* here 🎯 — brief: <https://example.com/brief|campaign brief>' },
    { type: 'message', ts: t(30, 2), user: 'U902', text: 'Love it. The positioning from the ~old deck~ new deck is much sharper.' },
    { type: 'message', ts: t(29, 0), user: 'U901', text: 'Landing page draft is up: `campaign.landing.dev` — <@U900> want a first pass review?' },
    { type: 'message', thread_ts: t(29, 0), ts: t(29, 1), user: 'U900', text: 'Yes please! Especially the hero copy.' },
    { type: 'message', thread_ts: t(29, 0), ts: t(29, 2), user: 'U903', text: '+1, ping me when it’s ready and I’ll run it past the exec review' },
    { type: 'message', ts: t(28, 0), user: 'U903', text: 'Reminder <!channel>: campaign review Thursday 10:00 — agenda in the doc', pinned_to: ['C900'], reactions: [{ name: 'eyes', users: ['U900', 'U901'] }, { name: 'thumbsup', users: ['U902'] }] },
    { type: 'message', ts: t(27, 0), user: 'B950', text: 'Weekly standup digest: 14 tasks moved, 3 blockers cleared :tada:' },
    { type: 'message', ts: t(26, 0), user: 'U904', text: 'This message is from a deleted account — renders as Unknown' },
    { type: 'message', ts: t(25, 9), user: 'U902', text: 'Final metrics are in — 2.3x pipeline vs last quarter 📈', reactions: [{ name: 'tada', users: ['U900', 'U901', 'U903'] }] },
    { type: 'message', ts: t(25, 10), user: 'U900', text: 'this one was deleted in Slack', deleted: true }, // skipped
  ]

  // prettier-ignore
  const incidentMessages = [
    { type: 'message', ts: t(12, 0), user: 'U901', text: 'P1: checkout returning 500s for ~4 minutes. Cause: bad connection-pool config shipped in v1.4.2', reactions: [{ name: 'fire', users: ['U902', 'U903'] }] },
    { type: 'message', thread_ts: t(12, 0), ts: t(12, 1), user: 'U902', text: 'Rolled back at 14:32 — error rate back to baseline' },
    { type: 'message', thread_ts: t(12, 0), ts: t(12, 2), user: 'U903', text: 'Adding a pool-config regression test before we reship' },
    { type: 'message', thread_ts: t(12, 0), ts: t(11, 0), user: 'U901', text: 'Post-mortem doc: <https://example.com/pm|incident 47 post-mortem> — action items assigned', pinned_to: ['C901'] },
    { type: 'message', subtype: 'channel_purpose', ts: t(11, 1), user: 'U903', text: 'updated the channel description' }, // skipped
    { type: 'message', ts: t(5, 0), user: 'U902', text: 'Two weeks clean since the fix — closing this out ✅' },
  ]

  const zip = zipSync(
    {
      'users.json': strToU8(JSON.stringify(users, null, 2)),
      'channels.json': strToU8(JSON.stringify(channels, null, 2)),
      'groups.json': strToU8(JSON.stringify([], null, 2)),
      'dms.json': strToU8(JSON.stringify([], null, 2)),
      'marketing-import.json': strToU8(JSON.stringify(marketingMessages, null, 2)),
      'incident-review.json': strToU8(JSON.stringify(incidentMessages, null, 2)),
    },
    { level: 6 },
  )

  return new Response(zip, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="acme-sample-slack-export.zip"',
      'Content-Length': String(zip.length),
    },
  })
}

export const dynamic = 'force-dynamic'
