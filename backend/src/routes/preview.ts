/**
 * preview.ts — Audio Preview Route
 *
 * POST /api/plugins/:id/preview — Render a note preview from an AU plugin and stream back WAV audio.
 *
 * Caches rendered previews at /tmp/preview-cache/:pluginId/:note.wav
 * Caches downloaded .component artifacts at /tmp/plugin-cache/:pluginId/
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';

const execFileAsync = promisify(execFile);

// ─── Constants ────────────────────────────────────────────────────────────────

const PLUGIN_CACHE_DIR = '/tmp/plugin-cache';
const PREVIEW_CACHE_DIR = '/tmp/preview-cache';

// Path to the compiled Swift renderer binary.
// Set RENDER_BINARY_PATH env var to override, otherwise resolve relative to cwd (backend/).
const RENDER_BINARY = path.resolve(
  process.env.RENDER_BINARY_PATH ??
  path.join(process.cwd(), '..', 'scripts', 'render_preview')
);

// ─── Validation ───────────────────────────────────────────────────────────────

const PreviewBodySchema = z.object({
  note: z.number().int().min(0).max(127),
  duration: z.number().min(0.1).max(10).default(2),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download a URL to a local file path.
 * Supports http and https.
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = createWriteStream(dest);

    protocol
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          file.close();
          reject(new Error(`Download failed with status ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve()));
      })
      .on('error', (err) => {
        file.close();
        reject(err);
      });

    file.on('error', (err) => {
      file.close();
      reject(err);
    });
  });
}

// ─── Route Plugin ─────────────────────────────────────────────────────────────

export async function previewRoutes(
  fastify: FastifyInstance,
  options: { prisma: PrismaClient }
): Promise<void> {
  const { prisma } = options;

  // POST /api/plugins/:id/preview
  fastify.post(
    '/api/plugins/:id/preview',
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id: pluginId } = req.params;

      // Validate request body
      const parseResult = PreviewBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten(),
        });
      }
      const { note, duration } = parseResult.data;

      // Look up plugin in database
      const plugin = await prisma.plugin.findUnique({ where: { id: pluginId } });
      if (!plugin) {
        return reply.status(404).send({ error: 'Plugin not found' });
      }

      // Must be READY with an AU artifact URL
      if (plugin.status !== 'READY' || !plugin.auUrl) {
        return reply.status(400).send({ error: 'Plugin not compiled yet' });
      }

      // ── Check preview cache ──────────────────────────────────────────────────
      const previewDir = path.join(PREVIEW_CACHE_DIR, pluginId);
      const previewPath = path.join(previewDir, `${note}.wav`);

      if (await fileExists(previewPath)) {
        fastify.log.info(`Preview cache hit: ${previewPath}`);
        reply.header('Content-Type', 'audio/wav');
        reply.header('Cache-Control', 'public, max-age=3600');
        return reply.send(createReadStream(previewPath));
      }

      // ── Download .component artifact if not cached ───────────────────────────
      const pluginCacheDir = path.join(PLUGIN_CACHE_DIR, pluginId);
      await ensureDir(pluginCacheDir);
      await ensureDir(previewDir);

      const artifactName = path.basename(new URL(plugin.auUrl).pathname);
      const artifactPath = path.join(pluginCacheDir, artifactName);

      if (!(await fileExists(artifactPath))) {
        fastify.log.info(`Downloading AU artifact: ${plugin.auUrl}`);
        try {
          await downloadFile(plugin.auUrl, artifactPath);
        } catch (err) {
          fastify.log.error(err, 'Failed to download AU artifact');
          return reply.status(502).send({ error: 'Failed to download plugin artifact' });
        }
      }

      // If the artifact is a zip, extract it
      let componentPath = artifactPath;
      if (artifactName.endsWith('.zip')) {
        const extractDir = path.join(pluginCacheDir, 'extracted');
        await ensureDir(extractDir);
        try {
          await execFileAsync('unzip', ['-o', '-q', artifactPath, '-d', extractDir]);
          // Find .component in extracted files
          const { stdout } = await execFileAsync('find', [extractDir, '-name', '*.component', '-maxdepth', '3']);
          const found = stdout.trim().split('\n').filter(Boolean)[0];
          if (found) {
            componentPath = found;
          }
        } catch (err) {
          fastify.log.warn(err, 'Unzip failed, using artifact as-is');
        }
      }

      // ── Run the Swift renderer ───────────────────────────────────────────────
      fastify.log.info(`Rendering preview: plugin=${componentPath} note=${note} duration=${duration}`);

      try {
        await execFileAsync(
          RENDER_BINARY,
          [
            '--plugin', componentPath,
            '--note', String(note),
            '--duration', String(duration),
            '--output', previewPath,
          ],
          { timeout: 30_000 }
        );
      } catch (err) {
        fastify.log.error(err, 'Preview render process failed');
        const details = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({
          error: 'Preview render failed',
          details,
        });
      }

      // Verify output was produced
      if (!(await fileExists(previewPath))) {
        return reply.status(500).send({ error: 'Renderer produced no output file' });
      }

      // ── Stream WAV back to client ────────────────────────────────────────────
      reply.header('Content-Type', 'audio/wav');
      reply.header('Cache-Control', 'public, max-age=3600');
      return reply.send(createReadStream(previewPath));
    }
  );
}
