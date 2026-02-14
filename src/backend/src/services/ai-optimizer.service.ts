import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

export type AIOptimization = {
  type: string;
  description: string;
  estimatedSaving: string;
  line: number;
  before: string;
  after: string;
};

export type AICodeEdit = {
  action: 'replace' | 'insert' | 'delete';
  lineStart: number;
  lineEnd: number;
  before: string;
  after: string;
  rationale: string;
};

export type AIVerifierResult = {
  approved: boolean;
  summary: string;
  riskFlags: string[];
};

export type AIOptimizationMeta = {
  provider: string;
  model: string;
  retriesUsed: number;
  schemaRepairAttempts: number;
  verifier: AIVerifierResult;
  warnings: string[];
};

export type AIOptimizationResponse = {
  optimizations: AIOptimization[];
  edits: AICodeEdit[];
  optimizedContract: string;
  totalEstimatedSaving: string;
  meta: AIOptimizationMeta;
};

type ProviderResult = {
  text: string;
  provider: string;
  model: string;
  retriesUsed: number;
};

type Provider = {
  name: string;
  models: string[];
  generate: (model: string, prompt: string) => Promise<string>;
};

type OptimizerOptions = {
  feedback?: string;
};

const DEFAULT_VERIFIER: AIVerifierResult = {
  approved: false,
  summary: 'Verifier unavailable.',
  riskFlags: ['verifier_unavailable'],
};

const DEFAULT_RESPONSE: AIOptimizationResponse = {
  optimizations: [],
  edits: [],
  optimizedContract: '',
  totalEstimatedSaving: 'Unknown (AI disabled)',
  meta: {
    provider: 'none',
    model: 'none',
    retriesUsed: 0,
    schemaRepairAttempts: 0,
    verifier: DEFAULT_VERIFIER,
    warnings: [],
  },
};

export class AIOptimizerService {
  public static async getOptimizations(code: string, gasProfile: unknown, options?: OptimizerOptions): Promise<AIOptimizationResponse> {
    const providers = this.getProviders();
    if (providers.length === 0) {
      return {
        ...DEFAULT_RESPONSE,
        optimizedContract: code,
        totalEstimatedSaving: 'Unavailable (no AI provider key configured)',
        meta: {
          ...DEFAULT_RESPONSE.meta,
          warnings: ['No AI provider configured. Set GEMINI_API_KEY/GOOGLE_API_KEY or OPENAI_API_KEY.'],
        },
      };
    }

    let lastError = 'No successful AI result.';
    let schemaRepairAttempts = 0;
    let retriesUsed = 0;
    const warnings: string[] = [];

    const maxCycles = this.envInt('AI_MAX_OPTIMIZER_CYCLES', 3);
    let feedback = options?.feedback || '';

    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      try {
        const optimizerPrompt = this.buildOptimizerPrompt(code, gasProfile, feedback);
        const optimizedCall = await this.callWithFallback(providers, optimizerPrompt);
        retriesUsed += optimizedCall.retriesUsed;

        let parsed = this.parseJsonLoose(optimizedCall.text);
        let validation = this.validateOptimizationPayload(parsed, code);
        if (!validation.valid) {
          const repairPrompt = this.buildRepairPrompt(optimizerPrompt, optimizedCall.text, validation.errors);
          const repairedCall = await this.callWithFallback(providers, repairPrompt);
          retriesUsed += repairedCall.retriesUsed;
          schemaRepairAttempts += 1;
          parsed = this.parseJsonLoose(repairedCall.text);
          validation = this.validateOptimizationPayload(parsed, code);
          if (!validation.valid) {
            lastError = `Schema validation failed after repair: ${validation.errors.join('; ')}`;
            feedback = `Your prior JSON was invalid: ${validation.errors.join('; ')}. Output valid JSON only.`;
            continue;
          }
        }

        const candidate = parsed as Omit<AIOptimizationResponse, 'meta'>;
        const verifier = await this.verifyCandidate(code, gasProfile, candidate.optimizedContract, candidate.edits, providers);
        if (!verifier.approved) {
          lastError = `Verifier rejected candidate: ${verifier.summary}`;
          feedback = `Verifier rejected previous attempt. Risks: ${verifier.riskFlags.join(', ')}. Summary: ${verifier.summary}`;
          warnings.push(lastError);
          continue;
        }

        return {
          ...candidate,
          meta: {
            provider: optimizedCall.provider,
            model: optimizedCall.model,
            retriesUsed,
            schemaRepairAttempts,
            verifier,
            warnings,
          },
        };
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : 'Unknown AI optimization error';
        warnings.push(`Cycle ${cycle} failed: ${lastError}`);
      }
    }

    return {
      ...DEFAULT_RESPONSE,
      optimizedContract: code,
      totalEstimatedSaving: `Unavailable (AI failed: ${lastError})`,
      meta: {
        provider: 'none',
        model: 'none',
        retriesUsed,
        schemaRepairAttempts,
        verifier: DEFAULT_VERIFIER,
        warnings,
      },
    };
  }

  private static async verifyCandidate(
    originalCode: string,
    gasProfile: unknown,
    optimizedCode: string,
    edits: AICodeEdit[],
    providers: Provider[]
  ): Promise<AIVerifierResult> {
    const prompt = this.buildVerifierPrompt(originalCode, gasProfile, optimizedCode, edits);
    try {
      const call = await this.callWithFallback(providers, prompt);
      const parsed = this.parseJsonLoose(call.text) as Partial<AIVerifierResult>;
      const approved = typeof parsed.approved === 'boolean' ? parsed.approved : false;
      const summary = typeof parsed.summary === 'string' ? parsed.summary : 'Verifier did not provide summary.';
      const riskFlags = Array.isArray(parsed.riskFlags) ? parsed.riskFlags.filter((x) => typeof x === 'string') : ['invalid_verifier_response'];
      return { approved, summary, riskFlags };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown verifier error';
      return {
        approved: false,
        summary: `Verifier failed: ${message}`,
        riskFlags: ['verifier_call_failed'],
      };
    }
  }

  private static async callWithFallback(providers: Provider[], prompt: string): Promise<ProviderResult> {
    const retries = this.envInt('AI_PROVIDER_RETRIES', 2);
    const baseDelayMs = this.envInt('AI_RETRY_BASE_DELAY_MS', 600);
    let failures: string[] = [];

    for (const provider of providers) {
      for (const model of provider.models) {
        for (let retry = 0; retry <= retries; retry++) {
          try {
            const text = await provider.generate(model, prompt);
            if (!text || !text.trim()) {
              throw new Error('Empty AI response.');
            }
            return {
              text,
              provider: provider.name,
              model,
              retriesUsed: retry,
            };
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown provider error';
            failures.push(`${provider.name}/${model} retry ${retry}: ${message}`);
            if (!this.isRetriableError(error) || retry === retries) {
              continue;
            }
            await this.sleep(this.computeBackoff(baseDelayMs, retry));
          }
        }
      }
    }
    throw new Error(`All providers/models failed. ${failures.join(' | ')}`);
  }

  private static getProviders(): Provider[] {
    const providers: Provider[] = [];
    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (geminiKey) {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      providers.push({
        name: 'gemini',
        models: this.modelList('AI_GEMINI_MODELS', ['gemini-2.5-flash', 'gemini-2.5-flash-lite']),
        generate: async (model: string, prompt: string) => {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.15,
              topP: 0.95,
              maxOutputTokens: 8192,
            },
          });
          return response.text || '';
        },
      });
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    if (openAIKey) {
      providers.push({
        name: 'openai',
        models: this.modelList('AI_OPENAI_MODELS', ['gpt-4.1-mini']),
        generate: async (model: string, prompt: string) => {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openAIKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: 'You return strict JSON only.' },
                { role: 'user', content: prompt },
              ],
            }),
          });
          if (!res.ok) {
            const body = await res.text();
            throw new Error(`OpenAI error ${res.status}: ${body}`);
          }
          const payload = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };
          return payload.choices?.[0]?.message?.content || '';
        },
      });
    }

    return providers;
  }

  private static validateOptimizationPayload(payload: unknown, originalCode: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (typeof payload !== 'object' || payload === null) {
      return { valid: false, errors: ['Payload must be an object.'] };
    }
    const p = payload as Record<string, unknown>;
    if (!Array.isArray(p.optimizations)) {
      errors.push('optimizations must be an array.');
    }
    if (!Array.isArray(p.edits)) {
      errors.push('edits must be an array.');
    }
    if (typeof p.optimizedContract !== 'string') {
      errors.push('optimizedContract must be a string.');
    }
    if (typeof p.totalEstimatedSaving !== 'string') {
      errors.push('totalEstimatedSaving must be a string.');
    }

    if (Array.isArray(p.edits)) {
      p.edits.forEach((edit, idx) => {
        const e = edit as Record<string, unknown>;
        if (!['replace', 'insert', 'delete'].includes(String(e.action))) {
          errors.push(`edits[${idx}].action invalid`);
        }
        if (typeof e.lineStart !== 'number' || typeof e.lineEnd !== 'number') {
          errors.push(`edits[${idx}] lineStart/lineEnd must be numbers`);
        }
        if (typeof e.before !== 'string' || typeof e.after !== 'string' || typeof e.rationale !== 'string') {
          errors.push(`edits[${idx}] before/after/rationale must be strings`);
        }
      });
    }

    if (typeof p.optimizedContract === 'string' && p.optimizedContract.trim().length === 0) {
      errors.push('optimizedContract must not be empty.');
    }
    if (typeof p.optimizedContract === 'string' && p.optimizedContract === originalCode) {
      errors.push('optimizedContract is identical to original; produce meaningful edits.');
    }

    return { valid: errors.length === 0, errors };
  }

  private static parseJsonLoose(raw: string): unknown {
    const trimmed = raw.trim();
    try {
      return JSON.parse(trimmed);
    } catch {
      const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fencedMatch?.[1]) {
        return JSON.parse(fencedMatch[1]);
      }
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      }
      throw new Error('Response is not valid JSON.');
    }
  }

  private static buildOptimizerPrompt(code: string, gasProfile: unknown, feedback: string): string {
    return `
You are an expert Solidity gas optimizer.
Goal: reduce gas while preserving behavior.

Hard constraints:
- Preserve contract semantics and authorization logic.
- Preserve externally observable behavior and ABI compatibility.
- Do not introduce reentrancy risks.
- Only use unchecked when provably safe.
- Return JSON only.

Input contract:
${code}

Gas profile:
${JSON.stringify(gasProfile, null, 2)}

Feedback from previous failed attempts (if any):
${feedback || 'None'}

Return this exact JSON shape:
{
  "optimizations": [
    {
      "type": "string",
      "description": "string",
      "estimatedSaving": "string",
      "line": 1,
      "before": "string",
      "after": "string"
    }
  ],
  "edits": [
    {
      "action": "replace|insert|delete",
      "lineStart": 1,
      "lineEnd": 1,
      "before": "string",
      "after": "string",
      "rationale": "string"
    }
  ],
  "optimizedContract": "full solidity source string",
  "totalEstimatedSaving": "string"
}

Do not wrap JSON in markdown.
`;
  }

  private static buildRepairPrompt(originalPrompt: string, badOutput: string, errors: string[]): string {
    return `
Your previous output was invalid JSON for the required schema.
Schema errors:
- ${errors.join('\n- ')}

Original instructions:
${originalPrompt}

Previous invalid output:
${badOutput}

Return corrected JSON only, no markdown.
`;
  }

  private static buildVerifierPrompt(
    originalCode: string,
    gasProfile: unknown,
    optimizedCode: string,
    edits: AICodeEdit[]
  ): string {
    return `
You are a strict Solidity optimization verifier.
Assess whether optimized code is safe and behavior-preserving.

Original:
${originalCode}

Optimized:
${optimizedCode}

Claimed edits:
${JSON.stringify(edits, null, 2)}

Gas profile baseline:
${JSON.stringify(gasProfile, null, 2)}

Return JSON only:
{
  "approved": true,
  "summary": "string",
  "riskFlags": ["string"]
}

Set approved=false if there is any likely semantic or security regression risk.
`;
  }

  private static isRetriableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
      message.includes('429') ||
      message.includes('5') ||
      message.includes('timeout') ||
      message.includes('temporar') ||
      message.includes('rate') ||
      message.includes('fetch failed') ||
      message.includes('econnreset')
    );
  }

  private static computeBackoff(baseMs: number, retry: number): number {
    const jitter = Math.floor(Math.random() * 150);
    return baseMs * Math.pow(2, retry) + jitter;
  }

  private static async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private static modelList(envName: string, fallback: string[]): string[] {
    const raw = process.env[envName];
    if (!raw) {
      return fallback;
    }
    const parsed = raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return parsed.length ? parsed : fallback;
  }

  private static envInt(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
      return fallback;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  }
}
