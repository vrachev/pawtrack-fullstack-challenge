import type { FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '../types/index.js';
import { store } from '../store/memory-store.js';

/**
 * Auth middleware: identifies the caller from X-User-Id and derives
 * the tenant and role from the user record. X-Tenant-Id and X-User-Role
 * headers (if sent) are ignored — role and tenant are never client-assertable.
 * In production, X-User-Id would be extracted from a verified JWT.
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = request.headers['x-user-id'] as string | undefined;

  if (!userId) {
    return reply.code(401).send({
      error: 'Unauthorized1',
      message: 'Missing X-User-Id header',
    });
  }

  const user = store.getUser(userId);
  if (!user) {
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Unknown user',
    });
  }

  const authContext: AuthContext = {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
  };

  (request as any).auth = authContext;
}
