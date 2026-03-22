/**
 * index.ts — Chibitek Plugin Platform Backend
 * Fastify server entry point
 */

import 'dotenv/config';
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { supabase } from './lib/supabase.js';
import { pluginRoutes } from './routes/plugins.js';
import { previewRoutes } from './routes/preview.js';
import { createCompileWorker } from './jobs/compile.js';

// ─── Init ─────────────────────────────────────────────────────────────────────

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
fastify.get('/', async (req, reply) => {
  reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Chris Grau Plugin Platform — API</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d0d14; color: #e0e0f0; margin: 0; padding: 40px; }
    h1 { font-size: 1.8rem; margin-bottom: 4px; color: #fff; }
    p { color: #888; margin-top: 4px; }
    .badge { display: inline-block; background: #1a1a2e; border: 1px solid #2a2a4a; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; color: #7c8cff; margin-bottom: 24px; }
    .endpoints { list-style: none; padding: 0; }
    .endpoints li { background: #111120; border: 1px solid #1e1e35; border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; font-family: monospace; }
    .method { color: #7c8cff; font-weight: bold; margin-right: 12px; }
    .path { color: #e0e0f0; }
    .desc { display: block; color: #666; font-size: 0.8rem; margin-top: 4px; font-family: sans-serif; }
    .status { color: #4caf82; font-size: 0.85rem; }
  </style>
</head>
<body>
  <h1>🎵 Chris Grau Plugin Platform</h1>
  <p>AI-powered AU/VST3 audio plugin factory</p>
  <div class="badge">API v0.1.0 · Online</div>
  <ul class="endpoints">
    <li><span class="method">GET</span><span class="path">/health</span><span class="desc">Service health check</span></li>
    <li><span class="method">POST</span><span class="path">/api/plugins/generate</span><span class="desc">Generate a DspSpec from natural language description</span></li>
    <li><span class="method">POST</span><span class="path">/api/plugins/:id/compile</span><span class="desc">Trigger GitHub Actions JUCE build</span></li>
    <li><span class="method">GET</span><span class="path">/api/plugins/:id/status</span><span class="desc">Get plugin build status and download URLs</span></li>
    <li><span class="method">GET</span><span class="path">/api/plugins</span><span class="desc">List plugins for a user</span></li>
    <li><span class="method">POST</span><span class="path">/api/plugins/:id/preview</span><span class="desc">Stream WAV preview of compiled plugin</span></li>
  </ul>
  <p class="status">✓ All systems operational</p>
</body>
</html>`);
});

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
      const { data: plugin, error } = await supabase
        .from('plugins')
        .select('id, status, auUrl, vst3Url, pkgUrl')
        .eq('id', pluginId)
        .single();

      if (error || !plugin) {
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
  worker = createCompileWorker();
  fastify.log.info('BullMQ compile worker started');
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully...`);
  try {
    await fastify.close();
    if (worker) await worker.close();
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
    await fastify.register(pluginRoutes);
    await fastify.register(previewRoutes);

    const host = process.env.HOST ?? '0.0.0.0';
    const port = parseInt(process.env.PORT ?? '3001', 10);

    await fastify.listen({ host, port });
    fastify.log.info(`Server running at http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err, 'Server startup failed');
    process.exit(1);
  }
};

start();
