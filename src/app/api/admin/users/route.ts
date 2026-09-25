import { z } from 'zod'
import { db } from '@/lib/db'
import { handle, HttpError, requireAdmin } from '@/lib/auth'
import { writeAudit } from '@/lib/audit'
import { serializeUser } from '@/lib/serialize'

export const dynamic = 'force-dynamic'

// ─── GET: all users with message counts ──────────────────────────────────────

export async function GET() {
  return handle(async () => {
    const me = await requireAdmin()
    const users = await db.user.findMany({
      where: { orgId: me.orgId },
      orderBy: [{ createdAt: 'asc' }],
      include: { agent: { select: { handle: true } }, _count: { select: { messages: true } } },
    })
    return {
      users: users.map((user) => ({
        ...serializeUser(user),
        messageCount: user._count.messages,
      })),
    }
  })
}

// ─── PATCH: change a member's role / active status ───────────────────────────

const patchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(['owner', 'admin', 'member']).optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(request: Request) {
  return handle(async () => {
    const me = await requireAdmin()
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) throw new HttpError(400, 'userId with role and/or isActive is required')
    const { userId, role, isActive } = parsed.data
    if (role === undefined && isActive === undefined) {
      throw new HttpError(400, 'Nothing to update')
    }

    const target = await db.user.findFirst({ where: { id: userId, orgId: me.orgId } })
    if (!target) throw new HttpError(404, 'User not found')

    // Guard: cannot change your own role
    if (userId === me.id && role !== undefined && role !== me.role) {
      throw new HttpError(400, 'You cannot change your own role')
    }
    // Guard: cannot deactivate yourself
    if (userId === me.id && isActive === false) {
      throw new HttpError(400, 'You cannot deactivate your own account')
    }
    // Guard: cannot demote/deactivate the last active owner
    const demotesOwner =
      target.role === 'owner' && ((role !== undefined && role !== 'owner') || isActive === false)
    if (demotesOwner) {
      const otherActiveOwners = await db.user.count({
        where: { orgId: me.orgId, role: 'owner', isActive: true, id: { not: target.id } },
      })
      if (otherActiveOwners === 0) {
        throw new HttpError(400, 'Cannot demote or deactivate the last owner')
      }
    }

    const updated = await db.user.update({
      where: { id: target.id },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
      include: { agent: { select: { handle: true } } },
    })

    await writeAudit({
      orgId: me.orgId,
      actorId: me.id,
      action: 'user.updated',
      target: updated.name,
      meta: {
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })

    return { user: serializeUser(updated) }
  })
}
