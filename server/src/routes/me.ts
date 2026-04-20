import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '../types/index.js';
import { store } from '../store/memory-store.js';

export function meRoutes(app: FastifyInstance): void {
  app.get('/api/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).auth as AuthContext;
    const tenant = store.getTenant(auth.tenantId);
    return reply.code(200).send({
      userId: auth.userId,
      tenantId: auth.tenantId,
      tenantName: tenant?.name ?? null,
      role: auth.role,
    });
  });
}
