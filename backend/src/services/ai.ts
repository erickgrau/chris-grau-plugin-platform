/**
 * ai.ts — Claude API Integration
 * Converts natural language descriptions into structured DspSpec JSON
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─── DspSpec Schema ───────────────────────────────────────────────────────────

export const DspParameterSchema = z.object({
  default: z.number(),
  min: z.number(),
  max: z.number(),
  label: z.string(),
  unit: z.string(),
});

export const DspSpecSchema = z.object({
  type: z.enum(['filter', 'compressor', 'reverb', 'delay', 'distortion', 'eq', 'synth', 'utility', 'custom']),
  algorithm: z.string().describe('e.g. "biquad-lowpass", "vintage-vca", "plate-reverb"'),
  parameters: z.record(z.string(), DspParameterSchema),
  signalFlow: z.array(z.string()).describe('Ordered list of processing stages'),
  templateId: z.string().nullable().describe('Reference to a built-in template, or null for custom'),
});

export type DspSpec = z.infer<typeof DspSpecSchema>;
export type DspParameter = z.infer<typeof DspParameterSchema>;

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert DSP (Digital Signal Processing) engineer and audio plugin architect.
Your job is to translate natural language descriptions of audio plugins into precise technical specifications (DspSpec JSON).

DSPSPEC JSON SCHEMA:
{
  "type": one of: "filter" | "compressor" | "reverb" | "delay" | "distortion" | "eq" | "synth" | "utility" | "custom",
  "algorithm": string describing the specific algorithm (e.g., "biquad-lowpass", "tube-saturation", "schroeder-reverb"),
  "parameters": {
    "[paramKey]": {
      "default": number,
      "min": number,
      "max": number,
      "label": string (human-readable name),
      "unit": string (e.g., "Hz", "dB", "ms", "%", "ratio", "")
    }
  },
  "signalFlow": string[] (ordered processing stages, e.g., ["input", "preamp", "filter", "output"]),
  "templateId": string | null (reference to built-in template, or null for custom)
}

RULES:
1. Always include at least 2 and at most 16 parameters
2. Parameter keys must be camelCase (e.g., "cutoffFrequency", "attackTime")
3. Parameter ranges must be musically sensible and physically accurate
4. signalFlow should describe the actual signal path through the plugin
5. If the description matches a known plugin type, set templateId to a known template ID
6. Return ONLY valid JSON, no markdown, no explanation`;

// ─── Template IDs ─────────────────────────────────────────────────────────────

const TEMPLATE_MAP: Record<string, string> = {
  lowpass: 'tpl-filter-lowpass-v1',
  highpass: 'tpl-filter-highpass-v1',
  bandpass: 'tpl-filter-bandpass-v1',
  compressor: 'tpl-compressor-vca-v1',
  limiter: 'tpl-compressor-limiter-v1',
  reverb: 'tpl-reverb-plate-v1',
  delay: 'tpl-delay-stereo-v1',
  distortion: 'tpl-dist-soft-clip-v1',
  overdrive: 'tpl-dist-tube-v1',
  eq: 'tpl-eq-parametric-v1',
  chorus: 'tpl-modulation-chorus-v1',
  flanger: 'tpl-modulation-flanger-v1',
  phaser: 'tpl-modulation-phaser-v1',
};

// ─── Main Function ────────────────────────────────────────────────────────────

export async function generateDspSpec(
  description: string,
  mode: number = 2
): Promise<DspSpec> {
  const modeContext = {
    1: 'Mode 1: Template-based. Map the description to the closest built-in template. templateId must be set.',
    2: 'Mode 2: AI-assisted. Create a custom spec but prefer known templates when they match well.',
    3: 'Mode 3: Custom DSP. Create a fully custom spec. templateId should be null unless it exactly matches.',
  }[mode] ?? 'Mode 2: AI-assisted.';

  const userMessage = `${modeContext}

Plugin description: "${description}"

Return a DspSpec JSON object for this audio plugin.`;

  let rawJson = '';

  // Use streaming for robustness with long responses
  const stream = await client.messages.stream({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  });

  const message = await stream.finalMessage();

  // Extract text content
  for (const block of message.content) {
    if (block.type === 'text') {
      rawJson += block.text;
    }
  }

  // Strip markdown code fences if Claude wrapped it anyway
  const jsonMatch = rawJson.match(/```(?:json)?\s*([\s\S]*?)```/);
  const cleanJson = jsonMatch ? jsonMatch[1].trim() : rawJson.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleanJson);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${rawJson.slice(0, 200)}`);
  }

  // Validate against our schema
  const result = DspSpecSchema.safeParse(parsed);
  if (!result.success) {
    // Attempt recovery: inject templateId null if missing
    if (parsed && typeof parsed === 'object' && !('templateId' in parsed)) {
      (parsed as Record<string, unknown>).templateId = null;
      const retry = DspSpecSchema.safeParse(parsed);
      if (retry.success) return retry.data;
    }
    throw new Error(`DspSpec validation failed: ${result.error.message}`);
  }

  return result.data;
}

// ─── Utility: Suggest template from description ───────────────────────────────

export function suggestTemplateId(description: string): string | null {
  const lower = description.toLowerCase();
  for (const [keyword, templateId] of Object.entries(TEMPLATE_MAP)) {
    if (lower.includes(keyword)) return templateId;
  }
  return null;
}
