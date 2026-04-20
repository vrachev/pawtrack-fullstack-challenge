import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { authMiddleware } from './middleware/auth.js';
import { bookingRoutes } from './routes/bookings.js';
import { petRoutes } from './routes/pets.js';
import { meRoutes } from './routes/me.js';

export function buildApp(opts: { logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false });

  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-User-Id'],
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      await authMiddleware(request, reply);
    }
  });

  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  bookingRoutes(app);
  petRoutes(app);
  meRoutes(app);

  return app;
}
