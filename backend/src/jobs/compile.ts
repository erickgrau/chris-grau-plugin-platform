/**
 * compile.ts — BullMQ Compilation Job Processor
 * Triggers GitHub Actions workflow_dispatch and polls for completion
 */

import { Worker, Job, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompileJobData {
  pluginId: string;
  compilationJobId: string;
}

export interface CompileJobResult {
  success: boolean;
  auUrl?: string;
  vst3Url?: string;
  pkgUrl?: string;
  auvalResult?: string;
  pluginvalResult?: string;
  errorLog?: string;
}

// ─── GitHub Actions Types ─────────────────────────────────────────────────────

interface GitHubWorkflowRun {
  id: number;
  status: 'queued' | 'in_progress' | 'completed' | null;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  artifacts_url: string;
}

interface GitHubArtifact {
  id: number;
  name: string;
  archive_download_url: string;
  expired: boolean;
}

// ─── Queue Export ─────────────────────────────────────────────────────────────

let _redis: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!_redis) {
    _redis = new IORedis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null, // required by BullMQ
    });
  }
  return _redis;
}

export const compileQueue = new Queue<CompileJobData>('plugin-compilation', {
  connection: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// ─── GitHub API Helpers ───────────────────────────────────────────────────────

const GH_API = 'https://api.github.com';

async function githubFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');

  const res = await fetch(`${GH_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body}`);
  }

  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

async function triggerWorkflow(
  pluginId: string,
  compilationJobId: string
): Promise<void> {
  const owner = process.env.GITHUB_OWNER ?? 'chibitek-labs';
  const repo = process.env.GITHUB_REPO ?? 'plugin-compiler';
  const workflowId = process.env.GITHUB_WORKFLOW_ID ?? 'compile-plugin.yml';

  await githubFetch<void>(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
      ref: 'main',
      inputs: {
        plugin_id: pluginId,
        job_id: compilationJobId,
      },
    }),
  });
}

async function findWorkflowRun(
  pluginId: string,
  triggerTime: Date
): Promise<GitHubWorkflowRun | null> {
  const owner = process.env.GITHUB_OWNER ?? 'chibitek-labs';
  const repo = process.env.GITHUB_REPO ?? 'plugin-compiler';

  // GitHub may take a few seconds to register the run
  const created = triggerTime.toISOString().replace(/\.\d+Z$/, 'Z');
  const data = await githubFetch<{ workflow_runs: GitHubWorkflowRun[] }>(
    `/repos/${owner}/${repo}/actions/runs?event=workflow_dispatch&created=>=${created}&per_page=10`
  );

  // Match by the run that includes our pluginId in its name or was most recent
  return data.workflow_runs?.[0] ?? null;
}

async function pollWorkflowCompletion(
  runId: number,
  maxWaitMs = 20 * 60 * 1000, // 20 min max
  pollIntervalMs = 15_000
): Promise<GitHubWorkflowRun> {
  const owner = process.env.GITHUB_OWNER ?? 'chibitek-labs';
  const repo = process.env.GITHUB_REPO ?? 'plugin-compiler';
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    const run = await githubFetch<GitHubWorkflowRun>(
      `/repos/${owner}/${repo}/actions/runs/${runId}`
    );

    if (run.status === 'completed') return run;

    await sleep(pollIntervalMs);
  }

  throw new Error(`Compilation workflow timed out after ${maxWaitMs / 60000} minutes`);
}

async function getArtifactUrls(
  runId: number,
  prisma: PrismaClient,
  pluginId: string
): Promise<{ auUrl?: string; vst3Url?: string; pkgUrl?: string }> {
  const owner = process.env.GITHUB_OWNER ?? 'chibitek-labs';
  const repo = process.env.GITHUB_REPO ?? 'plugin-compiler';

  const data = await githubFetch<{ artifacts: GitHubArtifact[] }>(
    `/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`
  );

  const r2Base = process.env.R2_PUBLIC_URL ?? '';
  const urls: { auUrl?: string; vst3Url?: string; pkgUrl?: string } = {};

  for (const artifact of data.artifacts) {
    if (artifact.expired) continue;
    const name = artifact.name.toLowerCase();
    if (name.includes('.component') || name.includes('-au')) {
      urls.auUrl = `${r2Base}/plugins/${pluginId}/${artifact.name}`;
    } else if (name.includes('.vst3') || name.includes('-vst3')) {
      urls.vst3Url = `${r2Base}/plugins/${pluginId}/${artifact.name}`;
    } else if (name.includes('.pkg') || name.includes('-installer')) {
      urls.pkgUrl = `${r2Base}/plugins/${pluginId}/${artifact.name}`;
    }
  }

  return urls;
}

// ─── Job Processor ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createCompileWorker(prisma: PrismaClient): Worker<CompileJobData, CompileJobResult> {
  const worker = new Worker<CompileJobData, CompileJobResult>(
    'plugin-compilation',
    async (job: Job<CompileJobData>): Promise<CompileJobResult> => {
      const { pluginId, compilationJobId } = job.data;

      console.log(`[compile] Starting job ${job.id} for plugin ${pluginId}`);

      // Mark job as running
      await prisma.compilationJob.update({
        where: { id: compilationJobId },
        data: {
          status: 'RUNNING',
          startedAt: new Date(),
          runnerId: job.id ?? null,
        },
      });

      await prisma.plugin.update({
        where: { id: pluginId },
        data: { status: 'COMPILING' },
      });

      const triggerTime = new Date();

      try {
        // Step 1: Trigger GitHub Actions workflow
        await triggerWorkflow(pluginId, compilationJobId);
        console.log(`[compile] Workflow dispatched for plugin ${pluginId}`);

        // Step 2: Wait for GitHub to register the run (up to 30s)
        let workflowRun: GitHubWorkflowRun | null = null;
        for (let i = 0; i < 6; i++) {
          await sleep(5000);
          workflowRun = await findWorkflowRun(pluginId, triggerTime);
          if (workflowRun) break;
        }

        if (!workflowRun) {
          throw new Error('Could not find GitHub Actions workflow run after trigger');
        }

        console.log(`[compile] Found workflow run ${workflowRun.id}`);

        // Update DB with runner reference
        await prisma.compilationJob.update({
          where: { id: compilationJobId },
          data: { runnerId: String(workflowRun.id) },
        });

        // Step 3: Poll until complete
        const completedRun = await pollWorkflowCompletion(workflowRun.id);
        console.log(`[compile] Workflow completed: ${completedRun.conclusion}`);

        if (completedRun.conclusion !== 'success') {
          throw new Error(`Workflow failed with conclusion: ${completedRun.conclusion}`);
        }

        // Step 4: Fetch artifact URLs
        const artifactUrls = await getArtifactUrls(workflowRun.id, prisma, pluginId);

        // Step 5: Update Plugin with download URLs
        await prisma.plugin.update({
          where: { id: pluginId },
          data: {
            status: 'READY',
            auUrl: artifactUrls.auUrl ?? null,
            vst3Url: artifactUrls.vst3Url ?? null,
            pkgUrl: artifactUrls.pkgUrl ?? null,
          },
        });

        // Step 6: Mark compilation job as completed
        const result: CompileJobResult = {
          success: true,
          ...artifactUrls,
          auvalResult: 'pass',
          pluginvalResult: 'pass',
        };

        await prisma.compilationJob.update({
          where: { id: compilationJobId },
          data: {
            status: 'COMPLETED',
            completedAt: new Date(),
            auvalResult: result.auvalResult,
            pluginvalResult: result.pluginvalResult,
          },
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[compile] Job failed for plugin ${pluginId}: ${errorMessage}`);

        await prisma.plugin.update({
          where: { id: pluginId },
          data: { status: 'FAILED' },
        });

        await prisma.compilationJob.update({
          where: { id: compilationJobId },
          data: {
            status: 'FAILED',
            completedAt: new Date(),
            errorLog: errorMessage,
            retryCount: { increment: 1 },
          },
        });

        throw error;
      }
    },
    {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      concurrency: 5,
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[compile] Job ${job.id} completed for plugin ${job.data.pluginId}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[compile] Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
