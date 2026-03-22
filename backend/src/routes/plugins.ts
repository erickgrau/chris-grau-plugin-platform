/**
 * plugins.ts — Plugin Routes
 *
 * POST /api/plugins/generate   — AI-generate a DspSpec from description
 * POST /api/plugins/:id/compile — Enqueue compilation job
 * GET  /api/plugins/:id/status  — Get plugin status + download URLs
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generateDspSpec } from '../services/ai.js';
import { compileQueue } from '../jobs/compile.js';
import { supabase } from '../lib/supabase.js';

// ─── Request/Response Schemas ──────────────────────────────────────────────────

const GenerateRequestSchema = z.object({
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  mode: z.number().int().min(1).max(3).default(2),
  name: z.string().min(1).max(100).optional(),
  userId: z.string().optional(), // In production, pull from session
});

const CompileRequestSchema = z.object({
  userId: z.string().optional(), // In production, pull from session
});

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function pluginRoutes(
  fastify: FastifyInstance
): Promise<void> {

  // ─── POST /api/plugins/generate ─────────────────────────────────────────────

  fastify.post(
    '/api/plugins/generate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = GenerateRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten(),
        });
      }

      const { description, mode, name, userId } = parseResult.data;

      // Resolve or create user
      let resolvedUserId = userId;
      if (!resolvedUserId) {
        // Dev mode: use/create a default dev user
        const { data: existingUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', 'dev@chibitek.local')
          .single();

        if (existingUser) {
          resolvedUserId = existingUser.id;
        } else {
          const now = new Date().toISOString();
          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
              id: crypto.randomUUID(),
              email: 'dev@chibitek.local',
              name: 'Dev User',
              tier: 'PRO',
              buildsThisMonth: 0,
              createdAt: now,
              updatedAt: now,
            })
            .select('id')
            .single();

          if (createError || !newUser) {
            fastify.log.error(createError, 'Failed to create dev user');
            return reply.status(500).send({ error: 'Failed to resolve user' });
          }
          resolvedUserId = newUser.id;
        }
      }

      // Check build limits for FREE tier
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', resolvedUserId)
        .single();

      if (userError || !user) {
        return reply.status(404).send({ error: 'User not found' });
      }
      if (user.tier === 'FREE' && user.buildsThisMonth >= 3) {
        return reply.status(429).send({
          error: 'Monthly build limit reached',
          message: 'Free tier is limited to 3 builds per month. Upgrade to PRO to continue.',
        });
      }

      try {
        // Generate DspSpec via Claude
        const dspSpec = await generateDspSpec(description, mode);

        // Persist plugin record
        const now = new Date().toISOString();
        const { data: plugin, error: pluginError } = await supabase
          .from('plugins')
          .insert({
            id: crypto.randomUUID(),
            userId: resolvedUserId,
            name: name ?? derivePluginName(description),
            description,
            mode,
            dspSpec: dspSpec as object,
            status: 'PENDING',
            version: '1.0.0',
            createdAt: now,
            updatedAt: now,
          })
          .select()
          .single();

        if (pluginError || !plugin) {
          throw new Error(pluginError?.message ?? 'Failed to create plugin');
        }

        return reply.status(201).send({
          pluginId: plugin.id,
          name: plugin.name,
          dspSpec,
          status: plugin.status,
          message: 'DspSpec generated. Call POST /api/plugins/:id/compile to build.',
        });
      } catch (err) {
        fastify.log.error(err, 'Failed to generate DspSpec');
        return reply.status(500).send({
          error: 'AI generation failed',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }
  );

  // ─── POST /api/plugins/:id/compile ──────────────────────────────────────────

  fastify.post(
    '/api/plugins/:id/compile',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id: pluginId } = req.params;

      const { data: plugin, error: pluginError } = await supabase
        .from('plugins')
        .select('*')
        .eq('id', pluginId)
        .single();

      if (pluginError || !plugin) {
        return reply.status(404).send({ error: 'Plugin not found' });
      }

      if (plugin.status === 'COMPILING') {
        return reply.status(409).send({
          error: 'Plugin is already compiling',
          message: 'Wait for the current compilation to finish.',
        });
      }

      if (!plugin.dspSpec) {
        return reply.status(400).send({
          error: 'Plugin has no DspSpec',
          message: 'Call POST /api/plugins/generate first to generate a DspSpec.',
        });
      }

      // Create CompilationJob record
      const now = new Date().toISOString();
      const { data: compilationJob, error: jobError } = await supabase
        .from('compilation_jobs')
        .insert({
          id: crypto.randomUUID(),
          pluginId,
          status: 'QUEUED',
          retryCount: 0,
          createdAt: now,
          updatedAt: now,
        })
        .select()
        .single();

      if (jobError || !compilationJob) {
        fastify.log.error(jobError, 'Failed to create compilation job');
        return reply.status(500).send({ error: 'Failed to create compilation job' });
      }

      // Update plugin status
      await supabase
        .from('plugins')
        .update({ status: 'PENDING', updatedAt: new Date().toISOString() })
        .eq('id', pluginId);

      // Enqueue BullMQ job
      const bullJob = await compileQueue.add(
        `compile-${pluginId}` as string,
        {
          pluginId,
          compilationJobId: compilationJob.id,
        },
        {
          jobId: `compile-${pluginId}-${Date.now()}`,
          priority: 1,
        }
      );

      return reply.status(202).send({
        jobId: bullJob.id,
        compilationJobId: compilationJob.id,
        pluginId,
        status: 'QUEUED',
        message: 'Compilation job enqueued. Poll GET /api/plugins/:id/status for updates.',
      });
    }
  );

  // ─── GET /api/plugins/:id/status ────────────────────────────────────────────

  fastify.get(
    '/api/plugins/:id/status',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id: pluginId } = req.params;

      const { data: plugin, error: pluginError } = await supabase
        .from('plugins')
        .select('*')
        .eq('id', pluginId)
        .single();

      if (pluginError || !plugin) {
        return reply.status(404).send({ error: 'Plugin not found' });
      }

      // Fetch latest compilation job
      const { data: jobs } = await supabase
        .from('compilation_jobs')
        .select('*')
        .eq('pluginId', pluginId)
        .order('createdAt', { ascending: false })
        .limit(1);

      const latestJob = jobs?.[0] ?? null;

      return reply.send({
        pluginId: plugin.id,
        name: plugin.name,
        status: plugin.status,
        version: plugin.version,
        downloads: {
          au: plugin.auUrl ?? null,
          vst3: plugin.vst3Url ?? null,
          pkg: plugin.pkgUrl ?? null,
        },
        compilationJob: latestJob
          ? {
              id: latestJob.id,
              status: latestJob.status,
              startedAt: latestJob.startedAt,
              completedAt: latestJob.completedAt,
              auvalResult: latestJob.auvalResult,
              pluginvalResult: latestJob.pluginvalResult,
              errorLog: latestJob.errorLog,
              retryCount: latestJob.retryCount,
            }
          : null,
        createdAt: plugin.createdAt,
        updatedAt: plugin.updatedAt,
      });
    }
  );

  // ─── GET /api/plugins (list user's plugins) ──────────────────────────────────

  fastify.get(
    '/api/plugins',
    async (req: FastifyRequest<{ Querystring: { userId?: string } }>, reply: FastifyReply) => {
      const userId = req.query.userId;
      if (!userId) {
        return reply.status(400).send({ error: 'userId query param required' });
      }

      const { data: plugins, error } = await supabase
        .from('plugins')
        .select('id, name, description, mode, status, version, auUrl, vst3Url, pkgUrl, createdAt, updatedAt')
        .eq('userId', userId)
        .order('createdAt', { ascending: false });

      if (error) {
        fastify.log.error(error, 'Failed to list plugins');
        return reply.status(500).send({ error: 'Failed to list plugins' });
      }

      return reply.send({ plugins: plugins ?? [] });
    }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function derivePluginName(description: string): string {
  // Extract first ~5 words as a plugin name
  const words = description
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 5);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
