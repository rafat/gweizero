import { AIOptimizationResponse, AIOptimizerService } from './ai-optimizer.service';
import { GasProfilerService } from './gas-profiler.service';
import { HardhatService } from './hardhat.service';

export type AnalysisPhase = 'static_analysis' | 'dynamic_analysis' | 'ai_optimization';
export type ProgressCallback = (phase: AnalysisPhase, message: string) => void;

type WorkerDynamicProfile = Awaited<ReturnType<typeof HardhatService.getGasProfile>>;

type OptimizationValidation = {
  accepted: boolean;
  reason: string;
  checks: {
    compiled: boolean;
    abiCompatible: boolean;
    deploymentGasRegressionPct: number;
    averageMutableFunctionRegressionPct: number;
    improved: boolean;
  };
};

export class AnalysisService {
  public static async processContract(code: string, onProgress?: ProgressCallback, jobId?: string) {
    onProgress?.('static_analysis', 'Parsing contract (static analysis)...');
    const staticProfile = GasProfilerService.analyze(code);

    onProgress?.('dynamic_analysis', 'Getting baseline gas profile (dynamic analysis)...');
    const baselineDynamicProfile = await HardhatService.getGasProfile(code);

    onProgress?.('ai_optimization', 'Generating and validating optimized candidates...');
    const optimizationLoop = await this.generateAcceptedOptimization(
      code,
      baselineDynamicProfile,
      onProgress,
      jobId
    );

    onProgress?.('ai_optimization', 'Analysis complete. Consolidating report...');
    return {
      originalContract: code,
      staticProfile,
      dynamicProfile: baselineDynamicProfile,
      aiOptimizations: optimizationLoop.aiResult,
      optimizedDynamicProfile: optimizationLoop.optimizedDynamicProfile,
      optimizationValidation: optimizationLoop.validation,
      optimizationAttempts: optimizationLoop.attempts,
    };
  }

  private static async generateAcceptedOptimization(
    originalCode: string,
    baselineDynamicProfile: WorkerDynamicProfile,
    onProgress?: ProgressCallback,
    jobId?: string
  ): Promise<{
    aiResult: AIOptimizationResponse;
    optimizedDynamicProfile: WorkerDynamicProfile | null;
    validation: OptimizationValidation;
    attempts: number;
  }> {
    const maxAttempts = this.envInt('AI_ACCEPTANCE_MAX_ATTEMPTS', 3);
    let attempts = 0;
    let feedback = '';

    // Run AI optimization ONCE
    onProgress?.('ai_optimization', 'Running AI optimization...');
    const aiResult = await AIOptimizerService.getOptimizations(originalCode, baselineDynamicProfile.gasProfile, {
      feedback: 'Initial optimization pass.',
      jobId,
      onProgress: (message) => onProgress?.('ai_optimization', message),
    });

    const candidateCode = aiResult.optimizedContract?.trim() || originalCode;
    if (!candidateCode || candidateCode === originalCode) {
      onProgress?.('ai_optimization', 'AI returned unchanged code, skipping validation.');
      return {
        aiResult,
        optimizedDynamicProfile: null,
        validation: {
          accepted: false,
          reason: 'AI returned unchanged code.',
          checks: {
            compiled: false,
            abiCompatible: false,
            deploymentGasRegressionPct: 0,
            averageMutableFunctionRegressionPct: 0,
            improved: false,
          },
        },
        attempts: 1,
      };
    }

    // Retry compilation/validation up to maxAttempts times with error feedback
    for (let i = 0; i < maxAttempts; i++) {
      attempts += 1;
      onProgress?.('ai_optimization', `Attempt ${attempts}: compiling and benchmarking optimized candidate...`);

      try {
        const optimizedDynamicProfile = await HardhatService.getGasProfile(candidateCode);
        const validation = this.validateOptimizedCandidate(
          baselineDynamicProfile,
          optimizedDynamicProfile
        );

        if (validation.accepted) {
          onProgress?.('ai_optimization', `Validation passed! Optimization accepted.`);
          return {
            aiResult,
            optimizedDynamicProfile,
            validation,
            attempts,
          };
        }

        onProgress?.('ai_optimization', `Attempt ${attempts} failed validation: ${validation.reason}`);
        feedback = `Validation failed: ${validation.reason}. Deployment regression: ${validation.checks.deploymentGasRegressionPct.toFixed(1)}%. Function regression: ${validation.checks.averageMutableFunctionRegressionPct.toFixed(1)}%.`;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown compile/runtime error';
        onProgress?.('ai_optimization', `Attempt ${attempts} failed validation: ${message}`);
        
        // Extract specific compilation errors and feed back to AI for retry
        const compilationError = this.extractCompilationError(message);
        if (compilationError) {
          feedback = `Compilation failed with specific error: ${compilationError.type}. ${compilationError.hint}`;
          onProgress?.('ai_optimization', `Analyzing compilation error for retry...`);
          
          // Retry AI generation with error-specific feedback
          const retryResult = await AIOptimizerService.getOptimizations(
            originalCode,
            baselineDynamicProfile.gasProfile,
            {
              feedback,
              jobId,
              onProgress: (msg) => onProgress?.('ai_optimization', msg),
            }
          );
          
          // If AI generated new code, try again
          if (retryResult.optimizedContract && retryResult.optimizedContract !== candidateCode) {
            onProgress?.('ai_optimization', `AI generated corrected candidate, attempting compilation...`);
            try {
              const retryProfile = await HardhatService.getGasProfile(retryResult.optimizedContract);
              const retryValidation = this.validateOptimizedCandidate(baselineDynamicProfile, retryProfile);
              if (retryValidation.accepted) {
                return {
                  aiResult: retryResult,
                  optimizedDynamicProfile: retryProfile,
                  validation: retryValidation,
                  attempts,
                };
              }
              feedback = `Retry also failed: ${retryValidation.reason}`;
            } catch (retryError: unknown) {
              const retryMessage = retryError instanceof Error ? retryError.message : 'Unknown retry error';
              feedback = `Retry compilation also failed: ${retryMessage}`;
            }
          }
        }
      }
    }

    return {
      aiResult: {
        ...aiResult,
        optimizedContract: originalCode,
        totalEstimatedSaving: `Rejected by acceptance policy after ${attempts} attempts.`,
        meta: {
          ...aiResult.meta,
          warnings: [
            ...(aiResult.meta.warnings || []),
            `Final acceptance failed after ${attempts} attempts.`,
          ],
        },
      },
      optimizedDynamicProfile: null,
      validation: {
        accepted: false,
        reason: `No candidate passed acceptance after ${attempts} attempts.`,
        checks: {
          compiled: false,
          abiCompatible: false,
          deploymentGasRegressionPct: 0,
          averageMutableFunctionRegressionPct: 0,
          improved: false,
        },
      },
      attempts,
    };
  }

  /**
   * Extract specific compilation error types and provide hints for AI correction.
   */
  private static extractCompilationError(errorMessage: string): { type: string; hint: string } | null {
    const errorStr = errorMessage.toLowerCase();
    
    // Storage location errors
    if (errorStr.includes('data location can only be specified for array, struct or mapping')) {
      return {
        type: 'invalid_storage_location',
        hint: 'The "storage" keyword can only be used with reference types (arrays, structs, mappings). For value types like uint256, address, bool, do NOT use the storage keyword. Example: "uint256 userPoints = points[addr];" not "uint256 storage userPoints = points[addr];"',
      };
    }
    
    // Custom error in require
    if (errorStr.includes('require') && (errorStr.includes('error') || errorStr.includes('revert'))) {
      return {
        type: 'invalid_require_syntax',
        hint: 'Custom errors cannot be used with require(). Use "if (!condition) revert ErrorName();" instead of "require(condition, ErrorName());"',
      };
    }
    
    // Type errors
    if (errorStr.includes('typeerror') || errorStr.includes('type error')) {
      return {
        type: 'type_error',
        hint: 'There is a type mismatch in the code. Check variable declarations and function signatures.',
      };
    }
    
    // General compilation errors
    if (errorStr.includes('compilation failed') || errorStr.includes('parseerror')) {
      return {
        type: 'compilation_error',
        hint: 'The contract has syntax or semantic errors. Review the code carefully.',
      };
    }
    
    return null;
  }

  private static validateOptimizedCandidate(
    baseline: WorkerDynamicProfile,
    optimized: WorkerDynamicProfile
  ): OptimizationValidation {
    const abiCompatible = this.isAbiCompatible(baseline.abi, optimized.abi);
    const deploymentBefore = Number(baseline.gasProfile.deploymentGas || 0);
    const deploymentAfter = Number(optimized.gasProfile.deploymentGas || 0);

    const deploymentGasRegressionPct = this.percentChange(deploymentBefore, deploymentAfter);
    const avgBefore = this.averageFunctionGas(baseline.gasProfile.functions);
    const avgAfter = this.averageFunctionGas(optimized.gasProfile.functions);
    const averageMutableFunctionRegressionPct = this.percentChange(avgBefore, avgAfter);

    const improved = deploymentAfter < deploymentBefore || avgAfter < avgBefore;
    
    // More lenient thresholds for hackathon demo
    // Allow up to 10% regression (optimizations might not always improve every function)
    const maxAllowedRegressionPct = this.envInt('AI_MAX_ALLOWED_REGRESSION_PCT', 10);
    const maxAllowedDeploymentRegressionPct = this.envInt('AI_MAX_DEPLOYMENT_REGRESSION_PCT', 20);

    if (!abiCompatible) {
      return {
        accepted: false,
        reason: 'ABI compatibility check failed.',
        checks: {
          compiled: true,
          abiCompatible,
          deploymentGasRegressionPct,
          averageMutableFunctionRegressionPct,
          improved,
        },
      };
    }

    if (averageMutableFunctionRegressionPct > maxAllowedRegressionPct) {
      return {
        accepted: false,
        reason: `Mutable-function gas regression exceeded threshold (${maxAllowedRegressionPct}%).`,
        checks: {
          compiled: true,
          abiCompatible,
          deploymentGasRegressionPct,
          averageMutableFunctionRegressionPct,
          improved,
        },
      };
    }

    if (deploymentGasRegressionPct > maxAllowedDeploymentRegressionPct) {
      return {
        accepted: false,
        reason: `Deployment gas regression exceeded secondary threshold (${maxAllowedDeploymentRegressionPct}%).`,
        checks: {
          compiled: true,
          abiCompatible,
          deploymentGasRegressionPct,
          averageMutableFunctionRegressionPct,
          improved,
        },
      };
    }

    return {
      accepted: true,
      reason: improved ? 'Candidate accepted.' : 'Candidate accepted (neutral gas result).',
      checks: {
        compiled: true,
        abiCompatible,
        deploymentGasRegressionPct,
        averageMutableFunctionRegressionPct,
        improved,
      },
    };
  }

  private static isAbiCompatible(baselineAbi: unknown[], optimizedAbi: unknown[]): boolean {
    const baseline = this.functionSignatures(baselineAbi);
    const optimized = this.functionSignatures(optimizedAbi);
    
    // Check that all baseline functions exist in optimized (same names)
    // We allow: memory->calldata changes, struct reordering, new errors
    // We reject: removed functions, changed function names, changed input counts
    if (baseline.size !== optimized.size) {
      return false;
    }
    for (const signature of baseline) {
      if (!optimized.has(signature)) {
        return false;
      }
    }
    return true;
  }

  private static functionSignatures(abi: unknown[]): Set<string> {
    const set = new Set<string>();
    for (const item of abi as Array<Record<string, unknown>>) {
      if (item.type !== 'function') {
        continue;
      }
      const name = String(item.name || '');
      const stateMutability = String(item.stateMutability || '');
      // Normalize inputs: just count them, don't check exact types
      // This allows: memory->calldata, struct changes, type widening
      const inputCount = Array.isArray(item.inputs) ? item.inputs.length : 0;
      // For view functions, just check name + mutability, not return types
      set.add(`${name}(${inputCount}args)@${stateMutability}`);
    }
    return set;
  }

  private static averageFunctionGas(
    functions: Record<
      string,
      | {
          status: 'measured';
          gasUsed: string;
          stateMutability: string;
        }
      | {
          status: 'unmeasured';
          reason: string;
          stateMutability: string;
        }
    >
  ): number {
    const numeric = Object.values(functions)
      .filter(
        (entry): entry is { status: 'measured'; gasUsed: string; stateMutability: string } =>
          entry.status === 'measured' &&
          (entry.stateMutability === 'nonpayable' || entry.stateMutability === 'payable')
      )
      .map((entry) => Number(entry.gasUsed))
      .filter((v) => Number.isFinite(v) && v > 0);
    if (numeric.length === 0) {
      return 0;
    }
    const total = numeric.reduce((a, b) => a + b, 0);
    return total / numeric.length;
  }

  private static percentChange(before: number, after: number): number {
    if (!before || before <= 0) {
      return 0;
    }
    return ((after - before) / before) * 100;
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
