import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthContext } from '../types/index.js';
import { store } from '../store/memory-store.js';
import { slotsOverlap } from '../services/overlap.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function sitterRoutes(app: FastifyInstance): void {
  /**
   * GET /api/sitters
   * List all sitters for the authenticated tenant.
   */
  app.get('/api/sitters', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).auth as AuthContext;
    const sitters = store.getSittersByTenant(auth.tenantId);
    return reply.code(200).send({ data: sitters });
  });

  /**
   * GET /api/sitters/available
   * Return sitters in the caller's tenant with no non-cancelled bookings
   * overlapping the requested slot, sorted alphabetically by name.
   */
  app.get('/api/sitters/available', async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = (request as any).auth as AuthContext;
    const q = request.query as {
      tenantId?: string;
      scheduledDate?: string;
      startTime?: string;
      endTime?: string;
    };

    const errors: string[] = [];
    if (!q.scheduledDate) {
      errors.push('scheduledDate is required');
    } else if (Number.isNaN(new Date(q.scheduledDate).getTime())) {
      errors.push('scheduledDate must be a valid ISO datetime');
    }
    if (!q.startTime || !HHMM.test(q.startTime)) errors.push('startTime must be HH:MM');
    if (!q.endTime || !HHMM.test(q.endTime)) errors.push('endTime must be HH:MM');
    if (errors.length) return reply.code(400).send({ error: errors.join('; ') });

    const tenantId = auth.role === 'admin' && q.tenantId ? q.tenantId : auth.tenantId;
    const requested = {
      scheduledDate: q.scheduledDate!,
      startTime: q.startTime!,
      endTime: q.endTime!,
    };

    const sitters = store.getSittersByTenant(tenantId);
    const bookings = store
      .getBookingsByTenant(tenantId)
      .filter(b => b.status !== 'cancelled');

    const available = sitters
      .filter(s => !bookings.some(b => b.sitterId === s.id && slotsOverlap(requested, b)))
      .sort((a, b) => a.name.localeCompare(b.name));

    return reply.code(200).send({ data: available });
  });
}
