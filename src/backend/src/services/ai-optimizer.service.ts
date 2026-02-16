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

export type ProgressCallback = (message: string) => void;

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
  generate: (model: string, prompt: string, mode: 'optimizer' | 'verifier' | 'generator') => Promise<string>;
};

type OptimizerOptions = {
  feedback?: string;
  jobId?: string;
  onProgress?: ProgressCallback;
};

type AIOptimizationDraft = {
  optimizations: AIOptimization[];
  edits: AICodeEdit[];
  totalEstimatedSaving: string;
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
  public static async getOptimizations(
    code: string,
    gasProfile: unknown,
    options?: OptimizerOptions
  ): Promise<AIOptimizationResponse> {
    const jobId = options?.jobId;
    const onProgress = options?.onProgress;
    const providers = this.getProviders();
    this.logInfo(
      `AI optimization start. providers=${providers.map((p) => `${p.name}[${p.models.join(',')}]`).join(' ')}`,
      jobId
    );
    onProgress?.('Initializing AI optimizer...');
    
    if (providers.length === 0) {
      this.logWarn('No AI providers configured. Returning original contract.', jobId);
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

    const maxCycles = this.envInt('AI_MAX_OPTIMIZER_CYCLES', 2);
    let feedback = options?.feedback || '';

    for (let cycle = 1; cycle <= maxCycles; cycle++) {
      try {
        onProgress?.(`AI optimization cycle ${cycle}/${maxCycles}: analyzing contract...`);
        this.logInfo(`AI cycle ${cycle}/${maxCycles} started.`, jobId);
        const optimizerPrompt = this.buildOptimizerPrompt(code, gasProfile, feedback);
        this.logInfo(`Optimizer prompt chars=${optimizerPrompt.length}`, jobId);
        onProgress?.('Calling AI model (this may take 30-60s)...');
        const optimizedCall = await this.callWithFallback(providers, optimizerPrompt, 'optimizer', jobId);
        retriesUsed += optimizedCall.retriesUsed;
        this.logInfo(
          `Optimizer response received provider=${optimizedCall.provider} model=${optimizedCall.model} chars=${optimizedCall.text.length}`,
          jobId
        );
        onProgress?.('AI response received, validating JSON schema...');
        this.logRawResponse('optimizer', optimizedCall.text, jobId);

        let parsed: unknown;
        try {
          parsed = this.parseJsonBestEffort(optimizedCall.text);
        } catch (parseError: unknown) {
          const parseMessage = parseError instanceof Error ? parseError.message : 'Unknown JSON parse error';
          this.logWarn(`Optimizer JSON parse failed: ${parseMessage}`, jobId);
          onProgress?.('JSON parse failed, repairing output...');
          const repairPrompt = this.buildRepairPrompt(optimizerPrompt, optimizedCall.text, [
            `JSON parse failure: ${parseMessage}`,
          ]);
          this.logInfo(`Repair prompt (parse failure) chars=${repairPrompt.length}`, jobId);
          onProgress?.('Calling AI to repair JSON output...');
          const repairedCall = await this.callWithFallback(providers, repairPrompt, 'optimizer', jobId);
          retriesUsed += repairedCall.retriesUsed;
          schemaRepairAttempts += 1;
          this.logInfo(
            `Repair response received provider=${repairedCall.provider} model=${repairedCall.model} chars=${repairedCall.text.length}`,
            jobId
          );
          this.logRawResponse('repair(parse_failure)', repairedCall.text, jobId);
          parsed = this.parseJsonBestEffort(repairedCall.text);
        }

        let validation = this.validateOptimizationDraft(parsed);
        if (!validation.valid) {
          this.logWarn(`Schema validation failed. errors=${validation.errors.join(' | ')}`, jobId);
          onProgress?.('Schema validation failed, requesting repair...');
          const repairPrompt = this.buildRepairPrompt(optimizerPrompt, optimizedCall.text, validation.errors);
          this.logInfo(`Repair prompt chars=${repairPrompt.length}`, jobId);
          onProgress?.('Calling AI to fix schema violations...');
          const repairedCall = await this.callWithFallback(providers, repairPrompt, 'optimizer', jobId);
          retriesUsed += repairedCall.retriesUsed;
          schemaRepairAttempts += 1;
          this.logInfo(
            `Repair response received provider=${repairedCall.provider} model=${repairedCall.model} chars=${repairedCall.text.length}`,
            jobId
          );
          this.logRawResponse('repair(schema_failure)', repairedCall.text, jobId);
          parsed = this.parseJsonBestEffort(repairedCall.text);
          validation = this.validateOptimizationDraft(parsed);
          if (!validation.valid) {
            lastError = `Schema validation failed after repair: ${validation.errors.join('; ')}`;
            feedback = `Your prior JSON was invalid: ${validation.errors.join('; ')}. Output valid JSON only.`;
            onProgress?.(`Cycle ${cycle} failed: schema validation failed after repair`);
            continue;
          }
        }

        const draft = parsed as AIOptimizationDraft;
        onProgress?.('Generating optimized contract code...');
        const generated = await this.generateOptimizedContract(code, draft.edits, providers, jobId);
        retriesUsed += generated.retriesUsed;
        const optimizedContract = generated.code;
        onProgress?.('Verifying optimization safety and correctness...');
        const verifier = await this.verifyCandidate(code, gasProfile, optimizedContract, draft.edits, providers, jobId);
        if (!verifier.approved) {
          lastError = `Verifier rejects candidate: ${verifier.summary}`;
          this.logWarn(lastError, jobId);
          feedback = `Verifier rejects previous attempt. Risks: ${verifier.riskFlags.join(', ')}. Summary: ${verifier.summary}`;
          warnings.push(lastError);
          onProgress?.(`Cycle ${cycle} failed: verifier rejected optimization`);
          continue;
        }

        this.logInfo(
          `AI optimization accepted provider=${optimizedCall.provider} model=${optimizedCall.model}`,
          jobId
        );
        onProgress?.('Optimization verified and accepted!');
        return {
          optimizations: draft.optimizations,
          edits: draft.edits,
          optimizedContract,
          totalEstimatedSaving: draft.totalEstimatedSaving,
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
        this.logWarn(`AI cycle ${cycle} failed: ${lastError}`, jobId);
        warnings.push(`Cycle ${cycle} failed: ${lastError}`);
      }
    }

    this.logWarn(`AI optimization exhausted all cycles. lastError=${lastError}`, jobId);
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
    providers: Provider[],
    jobId?: string
  ): Promise<AIVerifierResult> {
    const prompt = this.buildVerifierPrompt(originalCode, gasProfile, optimizedCode, edits);
    try {
      this.logInfo(`Verifier prompt chars=${prompt.length}`, jobId);
      const call = await this.callWithFallback(providers, prompt, 'verifier', jobId);
      this.logInfo(`Verifier response provider=${call.provider} model=${call.model} chars=${call.text.length}`, jobId);
      this.logRawResponse('verifier', call.text, jobId);
      const parsed = this.parseJsonBestEffort(call.text) as Partial<AIVerifierResult>;
      const approved = typeof parsed.approved === 'boolean' ? parsed.approved : false;
      const summary = typeof parsed.summary === 'string' ? parsed.summary : 'Verifier did not provide summary.';
      const riskFlags = Array.isArray(parsed.riskFlags) ? parsed.riskFlags.filter((x) => typeof x === 'string') : ['invalid_verifier_response'];
      return { approved, summary, riskFlags };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown verifier error';
      this.logWarn(`Verifier call failed: ${message}`, jobId);
      return {
        approved: false,
        summary: `Verifier failed: ${message}`,
        riskFlags: ['verifier_call_failed'],
      };
    }
  }

  private static async generateOptimizedContract(
    originalCode: string,
    edits: AICodeEdit[],
    providers: Provider[],
    jobId?: string
  ): Promise<{ code: string; retriesUsed: number }> {
    const prompt = this.buildGeneratorPrompt(originalCode, edits);
    this.logInfo(`Generator prompt chars=${prompt.length}`, jobId);
    const call = await this.callWithFallback(providers, prompt, 'generator', jobId);
    this.logInfo(`Generator response provider=${call.provider} model=${call.model} chars=${call.text.length}`, jobId);
    this.logRawResponse('generator', call.text, jobId);
    const code = this.normalizeGeneratedCode(call.text);
    if (!code || code.trim().length < 40 || !code.includes('contract ')) {
      throw new Error('Generated optimized contract is empty or invalid.');
    }
    return { code, retriesUsed: call.retriesUsed };
  }

  private static async callWithFallback(
    providers: Provider[],
    prompt: string,
    mode: 'optimizer' | 'verifier' | 'generator',
    jobId?: string
  ): Promise<ProviderResult> {
    const retries = this.envInt('AI_PROVIDER_RETRIES', 2);
    const baseDelayMs = this.envInt('AI_RETRY_BASE_DELAY_MS', 600);
    let failures: string[] = [];

    for (const provider of providers) {
      for (const model of provider.models) {
        for (let retry = 0; retry <= retries; retry++) {
          const startedAt = Date.now();
          try {
            this.logInfo(`Calling AI provider=${provider.name} model=${model} retry=${retry}`, jobId);
            const text = await provider.generate(model, prompt, mode);
            if (!text || !text.trim()) {
              throw new Error('Empty AI response.');
            }
            this.logInfo(
              `AI call success provider=${provider.name} model=${model} retry=${retry} latencyMs=${Date.now() - startedAt}`,
              jobId
            );
            return {
              text,
              provider: provider.name,
              model,
              retriesUsed: retry,
            };
          } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Unknown provider error';
            this.logWarn(
              `AI call failed provider=${provider.name} model=${model} retry=${retry} latencyMs=${Date.now() - startedAt} error=${message}`,
              jobId
            );
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
      const models = this.modelList('AI_GEMINI_MODELS');
      if (!models.length) {
        this.logWarn('Gemini key present but AI_GEMINI_MODELS is empty. Gemini provider disabled.');
      } else {
      providers.push({
        name: 'gemini',
        models,
        generate: async (model: string, prompt: string, mode: 'optimizer' | 'verifier' | 'generator') => {
          const responseSchema =
            mode === 'verifier' ? this.verifierResponseSchema() : mode === 'optimizer' ? this.optimizerResponseSchema() : undefined;
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: mode === 'generator' ? 'text/plain' : 'application/json',
              ...(responseSchema ? { responseSchema: responseSchema as any } : {}),
              temperature: 0.15,
              topP: 0.95,
              maxOutputTokens: 32768,
            },
          });
          return response.text || '';
        },
      });
      }
    }

    const openAIKey = process.env.OPENAI_API_KEY;
    if (openAIKey) {
      const models = this.modelList('AI_OPENAI_MODELS');
      if (!models.length) {
        this.logWarn('OpenAI key present but AI_OPENAI_MODELS is empty. OpenAI provider disabled.');
      } else {
      providers.push({
        name: 'openai',
        models,
        generate: async (model: string, prompt: string, mode: 'optimizer' | 'verifier' | 'generator') => {
          const asJson = mode !== 'generator';
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openAIKey}`,
            },
            body: JSON.stringify({
              model,
              temperature: 0.1,
              max_tokens: 16384,
              ...(asJson ? { response_format: { type: 'json_object' } } : {}),
              messages: [
                { role: 'system', content: asJson ? 'You return strict JSON only.' : 'Return Solidity code only.' },
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
    }

    return providers;
  }

  private static validateOptimizationDraft(payload: unknown): { valid: boolean; errors: string[] } {
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

  private static parseJsonBestEffort(raw: string): unknown {
    try {
      return this.parseJsonLoose(raw);
    } catch {
      // Common Gemini malformations: trailing commas and control chars.
      const trimmed = raw.trim();
      const firstBrace = trimmed.indexOf('{');
      const lastBrace = trimmed.lastIndexOf('}');
      if (firstBrace < 0 || lastBrace <= firstBrace) {
        throw new Error('Response does not contain a JSON object.');
      }

      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      const cleaned = candidate
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

      try {
        return JSON.parse(cleaned);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown best-effort parse error';
        throw new Error(`Best-effort parse failed: ${message}`);
      }
    }
  }

  private static normalizeGeneratedCode(raw: string): string {
    let text = raw.trim();
    const fenced = text.match(/```(?:solidity|sol)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      text = fenced[1].trim();
    }
    text = this.fixCommonInvalidForSyntax(text);
    return text;
  }

  private static fixCommonInvalidForSyntax(code: string): string {
    // Fix common invalid model output:
    // for (uint256 i = 0; i < len; unchecked { ++i; })
    // Convert to checked increment to preserve semantics and compile.
    let fixed = code.replace(
      /for\s*\(\s*uint256\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*0\s*;\s*([^;]+?)\s*;\s*unchecked\s*\{\s*\+\+\1\s*;?\s*\}\s*\)/g,
      'for (uint256 $1 = 0; $2; ++$1)'
    );

    // Fix invalid require with custom errors:
    // require(condition, CustomError()) -> if (!condition) revert CustomError();
    // Pattern: require(msg.sender == owner || !paused, ContractPaused());
    // Becomes: if (!(msg.sender == owner || !paused)) revert ContractPaused();
    fixed = fixed.replace(
      /require\s*\(\s*(.+?)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*\)\s*\)\s*;/g,
      'if (!($1)) revert $2();'
    );

    return fixed;
  }

  private static buildOptimizerPrompt(code: string, gasProfile: unknown, feedback: string): string {
    return `
You are an expert Solidity gas optimizer.
Goal: reduce gas while preserving behavior.

CRITICAL CONSTRAINTS (MUST FOLLOW):
1. PRESERVE ABI COMPATIBILITY - DO NOT CHANGE:
   - Function signatures (name, parameters, visibility, mutability)
   - State variable types (do NOT change uint256 to uint128, etc.)
   - Do NOT change 'public' to 'immutable' or 'private'
   - Event signatures
   
2. HIGH-IMPACT OPTIMIZATIONS (PRIORITIZE THESE):
   - Storage packing: reorder struct fields to use fewer slots
   - Cache array lengths: uint256 len = arr.length; for (i < len)
   - Use calldata instead of memory for external function params
   - Use storage pointers: Account storage acct = accounts[msg.sender];
   
3. SAFE OPTIMIZATIONS:
   - Unchecked for loop counters ONLY: for (i = 0; i < len; ) { ... unchecked { ++i; } }
   - Remove redundant checks: uint256 >= 0
   - Use existing custom errors: if (!condition) revert CustomError();

4. CUSTOM ERRORS - CORRECT SYNTAX:
   - WRONG: require(condition, CustomError())  <- DOES NOT COMPILE
   - CORRECT: if (!condition) revert CustomError();
   - Only use custom errors with 'revert', NEVER with 'require'

5. FORBIDDEN CHANGES:
   - Do NOT change state variable types or visibility
   - Do NOT add new custom errors (use existing ones only)
   - Do NOT change function visibility
   - Do NOT remove or add functions/events
   - Do NOT use unchecked for balance/token arithmetic (only counters)

6. Return JSON only - NO markdown, NO code fences.

OUTPUT LIMITS (to avoid truncation):
- Maximum 3 optimizations
- Maximum 3 edits  
- Each "before"/"after": max 80 characters
- Descriptions: max 120 chars

Input contract:
${code}

Gas profile:
${JSON.stringify(gasProfile, null, 2)}

Feedback from previous failed attempts (if any):
${feedback || 'None'}

Return this exact JSON shape (valid JSON, no trailing commas):
{
  "optimizations": [
    {
      "type": "string",
      "description": "string (max 120 chars)",
      "estimatedSaving": "string",
      "line": 1,
      "before": "string (max 80 chars)",
      "after": "string (max 80 chars)"
    }
  ],
  "edits": [
    {
      "action": "replace|insert|delete",
      "lineStart": 1,
      "lineEnd": 1,
      "before": "string (max 80 chars)",
      "after": "string (max 80 chars)",
      "rationale": "string (max 120 chars)"
    }
  ],
  "totalEstimatedSaving": "string"
}
`;
  }

  private static buildRepairPrompt(originalPrompt: string, badOutput: string, errors: string[]): string {
    return `
Your previous output was invalid JSON for the required schema.
Schema errors:
- ${errors.join('\n- ')}

Original instructions:
${originalPrompt}

Previous invalid output (DO NOT REPEAT THIS FORMAT):
${badOutput}

CRITICAL: This time output VALID JSON only:
- NO markdown code fences
- NO trailing commas
- Maximum 3 optimizations
- Maximum 3 edits
- Each before/after: max 80 characters

Return corrected JSON only. Nothing else.
`;
  }

  private static buildGeneratorPrompt(originalCode: string, edits: AICodeEdit[]): string {
    return `
You are an expert Solidity refactoring engine.
Apply the requested edits to produce one final optimized contract.

CRITICAL RULES:
1. PRESERVE ABI COMPATIBILITY:
   - Do NOT change function signatures
   - Do NOT change state variable types or visibility (keep 'public' as 'public')
   - Do NOT add or remove functions, events, or errors
   - Keep all existing custom errors (do not add new ones)

2. CODE OUTPUT:
   - Return COMPLETE Solidity source code only
   - NO markdown, NO code fences
   - Preserve behavior and semantics
   - Keep formatting clean and compilable

3. APPLY THESE OPTIMIZATIONS WHERE POSSIBLE:
   - Storage packing: reorder struct fields for tight packing
   - Cache array lengths before loops
   - Use calldata for external function parameters
   - Use storage pointers for repeated mapping access
   - Unchecked for loop counters: for (i = 0; i < len; ) { ... unchecked { ++i; } }

4. CUSTOM ERRORS - CORRECT SYNTAX:
   - WRONG: require(condition, CustomError())  <- DOES NOT COMPILE
   - CORRECT: if (!condition) revert CustomError();
   - NEVER pass custom errors to require()

5. UNCHECKED MATH RULES:
   - ONLY use unchecked for: loop counters (i++), simple counters (total++)
   - NEVER use unchecked for: balance arithmetic, token amounts, staked amounts
   - Safe pattern: for (uint256 i = 0; i < len; ) { ... unchecked { ++i; } }

6. If any edit would break ABI compatibility or syntax, SKIP that edit.

Original contract:
${originalCode}

Requested edits:
${JSON.stringify(edits, null, 2)}
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

VERIFICATION CHECKLIST:
1. ABI COMPATIBILITY (CRITICAL):
   - No state variables changed from 'public' to 'immutable' or 'private'
   - No function signatures changed (name, params, visibility, mutability)
   - No functions/events added or removed
   - Auto-generated getters must remain compatible

2. SAFETY CHECKS:
   - No unsafe unchecked arithmetic (only loop counters are safe)
   - No reentrancy risks introduced
   - No authorization logic changed
   - No storage layout changes that break upgrades

3. SEMANTIC PRESERVATION:
   - Behavior must be identical for all valid inputs
   - Error handling must be equivalent (reverts on same conditions)
   - State transitions must be identical

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

Set approved=false if:
- ABI compatibility is broken (e.g., public → immutable)
- Any safety check fails
- Semantic behavior changes
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

  private static modelList(envName: string): string[] {
    const raw = process.env[envName];
    if (!raw) {
      return [];
    }
    const parsed = raw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return parsed;
  }

  private static envInt(envName: string, fallback: number): number {
    const raw = process.env[envName];
    if (!raw) {
      return fallback;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  private static optimizerResponseSchema(): Record<string, unknown> {
    return {
      type: 'object',
      required: ['optimizations', 'edits', 'totalEstimatedSaving'],
      properties: {
        optimizations: {
          type: 'array',
          items: {
            type: 'object',
            required: ['type', 'description', 'estimatedSaving', 'line', 'before', 'after'],
            properties: {
              type: { type: 'string' },
              description: { type: 'string' },
              estimatedSaving: { type: 'string' },
              line: { type: 'number' },
              before: { type: 'string' },
              after: { type: 'string' },
            },
          },
        },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            required: ['action', 'lineStart', 'lineEnd', 'before', 'after', 'rationale'],
            properties: {
              action: { type: 'string', enum: ['replace', 'insert', 'delete'] },
              lineStart: { type: 'number' },
              lineEnd: { type: 'number' },
              before: { type: 'string' },
              after: { type: 'string' },
              rationale: { type: 'string' },
            },
          },
        },
        totalEstimatedSaving: { type: 'string' },
      },
    };
  }

  private static verifierResponseSchema(): Record<string, unknown> {
    return {
      type: 'object',
      required: ['approved', 'summary', 'riskFlags'],
      properties: {
        approved: { type: 'boolean' },
        summary: { type: 'string' },
        riskFlags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    };
  }

  private static logInfo(message: string, jobId?: string): void {
    if (!this.isAiLoggingEnabled()) {
      return;
    }
    const prefix = jobId ? `[AIOptimizer][job:${jobId}]` : '[AIOptimizer]';
    console.log(`${prefix} ${message}`);
  }

  private static logWarn(message: string, jobId?: string): void {
    if (!this.isAiLoggingEnabled()) {
      return;
    }
    const prefix = jobId ? `[AIOptimizer][job:${jobId}]` : '[AIOptimizer]';
    console.warn(`${prefix} ${message}`);
  }

  private static isAiLoggingEnabled(): boolean {
    const raw = process.env.AI_LOGGING_ENABLED;
    if (!raw) {
      return true;
    }
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }

  private static shouldLogRawResponses(): boolean {
    const raw = process.env.AI_LOG_RAW_RESPONSES;
    if (!raw) {
      return false;
    }
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
  }

  private static rawResponseMaxChars(): number {
    const raw = process.env.AI_LOG_RAW_MAX_CHARS;
    if (!raw) {
      return 5000;
    }
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 5000;
  }

  private static logRawResponse(label: string, text: string, jobId?: string): void {
    if (!this.isAiLoggingEnabled() || !this.shouldLogRawResponses()) {
      return;
    }
    const maxChars = this.rawResponseMaxChars();
    const compact = text.replace(/\r\n/g, '\n');
    const truncated = compact.length > maxChars ? `${compact.slice(0, maxChars)}\n...[truncated]` : compact;
    const prefix = jobId ? `[AIOptimizer][job:${jobId}][raw:${label}]` : `[AIOptimizer][raw:${label}]`;
    console.log(`${prefix} ${truncated}`);
  }
}
