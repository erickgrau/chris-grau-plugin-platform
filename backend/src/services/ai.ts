/**
 * ai.ts — Claude API Integration
 * Converts natural language descriptions into structured DspSpec JSON
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// ─── DspSpec Schema ───────────────────────────────────────────────────────────

export const DspLayerSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  blend: z.number().min(0).max(1).default(1),
  parameters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    min: z.number(),
    max: z.number(),
    default: z.number(),
    unit: z.string().default('linear'),
  })),
});

export const DspSpecSchema = z.object({
  plugin_type: z.enum(['effect', 'instrument', 'analyzer']).default('effect'),
  plugin_version: z.string().default('1.0.0'),
  manufacturer: z.string().default('Chibitek Labs'),
  description: z.string(),
  layers: z.array(DspLayerSchema).min(1).max(6),
  signalFlow: z.array(z.string()),
});

export type DspSpec = z.infer<typeof DspSpecSchema>;
export type DspLayer = z.infer<typeof DspLayerSchema>;

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── System Prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert DSP (Digital Signal Processing) engineer and audio plugin architect.
Your job is to translate natural language descriptions of audio plugins into precise technical specifications (DspSpec JSON).

DSPSPEC JSON SCHEMA:
{
  "plugin_type": "effect" | "instrument" | "analyzer",
  "plugin_version": "1.0.0",
  "manufacturer": "Chibitek Labs",
  "description": string,
  "layers": [
    {
      "id": string (camelCase unique id, e.g. "reverb_0"),
      "type": one of: "reverb" | "delay" | "eq" | "chorus" | "compressor" | "distortion",
      "label": string (human-readable, e.g. "Reverb"),
      "blend": number 0.0–1.0 (wet/dry mix for this layer, 1.0 = fully wet),
      "parameters": [
        {
          "id": string (camelCase, e.g. "roomSize"),
          "name": string (display name, e.g. "Room Size"),
          "min": number,
          "max": number,
          "default": number,
          "unit": "linear" | "dB" | "Hz" | "ms" | "%"
        }
      ]
    }
  ],
  "signalFlow": string[] (ordered processing stage ids)
}

LAYER RULES:
- Single effect description (e.g. "a reverb") → 1 layer
- Multi-effect description (e.g. "reverb into delay") → 2+ layers, one per effect
- "reverb + chorus + delay" → 3 layers
- Max 6 layers total
- Each layer has 2–6 parameters relevant to its type
- Typical parameters by type:
  - reverb: roomSize [0,1], damping [0,1], mix [0,1]
  - delay: delayTime [1,2000 ms], feedback [0,0.95], mix [0,1]
  - eq: cutoff [20,20000 Hz], q [0.1,10], gain [-24,24 dB]
  - chorus: rate [0.1,10 Hz], depth [0,1], mix [0,1]
  - compressor: threshold [-60,0 dB], ratio [1,20], attack [0.1,500 ms]
  - distortion: drive [1,20], outputGain [-20,20 dB]

Return ONLY valid JSON, no markdown, no explanation.`;

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
    model: 'claude-sonnet-4-5',
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
    // Attempt recovery: inject missing top-level defaults + convert old format
    if (parsed && typeof parsed === 'object') {
      const p = parsed as Record<string, unknown>;
      if (!p.plugin_type) p.plugin_type = 'effect';
      if (!p.manufacturer) p.manufacturer = 'Chibitek Labs';
      if (!p.plugin_version) p.plugin_version = '1.0.0';
      if (!p.description) p.description = 'AI-generated plugin';
      // Convert old flat parameters format to layers
      if (!p.layers && p.parameters) {
        const params = p.parameters as Record<string, unknown>;
        const layerParams = Array.isArray(params)
          ? params
          : Object.entries(params).map(([key, val]: [string, unknown]) => {
              const v = val as Record<string, unknown>;
              return { id: key, name: v.label || key, min: v.min ?? 0, max: v.max ?? 1, default: v.default ?? 0, unit: v.unit || 'linear' };
            });
        p.layers = [{
          id: (p.type as string) || 'layer_0',
          type: (p.type as string) || 'reverb',
          label: (p.type as string) ? String(p.type).charAt(0).toUpperCase() + String(p.type).slice(1) : 'Effect',
          blend: 1.0,
          parameters: layerParams,
        }];
        if (!p.signalFlow) p.signalFlow = [p.layers[0].id];
      }
      const retry = DspSpecSchema.safeParse(p);
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
