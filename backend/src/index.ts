/**
 * index.ts — Chibitek Plugin Platform Backend
 * Fastify server entry point
 */

import 'dotenv/config';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import { pluginRoutes } from './routes/plugins.js';
import { previewRoutes } from './routes/preview.js';
import { createCompileWorker } from './jobs/compile.js';

// ─── Init ─────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

// ─── CORS (manual, avoids dependency) ────────────────────────────────────────

fastify.addHook('onRequest', async (req, reply) => {
  const origin = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
  reply.header('Access-Control-Allow-Origin', origin);
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS,PATCH');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    reply.status(204).send();
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check
fastify.get('/health', async () => ({
  status: 'ok',
  service: 'chibitek-plugin-platform-backend',
  version: process.env.npm_package_version ?? '0.1.0',
  timestamp: new Date().toISOString(),
}));

// WebSocket: real-time job status updates
fastify.get('/ws/plugins/:id/status', { websocket: true }, (socket, req) => {
  const pluginId = (req.params as { id: string }).id;
  fastify.log.info(`WebSocket connected for plugin ${pluginId}`);

  let interval: ReturnType<typeof setInterval> | null = null;

  const sendStatus = async () => {
    try {
      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
        select: {
          id: true,
          status: true,
          auUrl: true,
          vst3Url: true,
          pkgUrl: true,
        },
      });

      if (!plugin) {
        socket.socket.send(JSON.stringify({ error: 'Plugin not found' }));
        if (interval) clearInterval(interval);
        socket.socket.close();
        return;
      }

      socket.socket.send(JSON.stringify(plugin));

      // Stop polling once terminal state is reached
      if (plugin.status === 'READY' || plugin.status === 'FAILED') {
        if (interval) clearInterval(interval);
        socket.socket.close();
      }
    } catch (err) {
      fastify.log.error(err, 'WebSocket status poll error');
    }
  };

  // Send immediately, then every 5s
  sendStatus();
  interval = setInterval(sendStatus, 5000);

  socket.socket.on('close', () => {
    if (interval) clearInterval(interval);
    fastify.log.info(`WebSocket disconnected for plugin ${pluginId}`);
  });
});

// ─── BullMQ Worker ────────────────────────────────────────────────────────────

let worker: ReturnType<typeof createCompileWorker> | null = null;

if (process.env.START_WORKER !== 'false') {
  worker = createCompileWorker(prisma);
  fastify.log.info('BullMQ compile worker started');
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await fastify.close();
    if (worker) await worker.close();
    await prisma.$disconnect();
    fastify.log.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ─── Start ────────────────────────────────────────────────────────────────────

const start = async () => {
  try {
    // Register plugins and routes
    await fastify.register(fastifyWebsocket);
    await fastify.register(pluginRoutes, { prisma });
    await fastify.register(previewRoutes, { prisma });

    // Test DB connection
    await prisma.$connect();
    fastify.log.info('Database connected');

    const host = process.env.HOST ?? '0.0.0.0';
    const port = parseInt(process.env.PORT ?? '3001', 10);

    await fastify.listen({ host, port });
    fastify.log.info(`Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err, 'Server startup failed');
    await prisma.$disconnect();
    process.exit(1);
  }
};

start();
