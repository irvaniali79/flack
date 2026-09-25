// GET /api/admin/cutover/report — build the migration cutover validation
// report (phase 3). `?format=markdown` returns a downloadable sign-off
// document instead of the JSON shape the UI consumes.
import { HttpError, requireAdmin } from '@/lib/auth'
import { buildCutoverReport, reportToMarkdown } from '@/lib/slack/cutover'

export async function GET(request: Request) {
  try {
    const me = await requireAdmin()
    const report = await buildCutoverReport(me.orgId)

    const format = new URL(request.url).searchParams.get('format')
    if (format === 'markdown') {
      const markdown = reportToMarkdown(report)
      return new Response(markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="cutover-report-${new Date().toISOString().slice(0, 10)}.md"`,
        },
      })
    }

    return Response.json({ report })
  } catch (err) {
    if (err instanceof HttpError) {
      return Response.json({ error: err.message }, { status: err.status })
    }
    console.error('[api] cutover report error:', err)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const dynamic = 'force-dynamic'
