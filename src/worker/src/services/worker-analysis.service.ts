import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { parse, visit } from '@solidity-parser/parser';

const HARDHAT_PROJECT_PATH = path.join(__dirname, '../../hardhat');
const HARDHAT_CONTRACTS_PATH = path.join(HARDHAT_PROJECT_PATH, 'contracts');
const GAS_SCRIPT_PATH = path.join('scripts', 'gas-estimator.ts');

type SolidityFunction = {
  name: string;
  visibility: string;
  stateMutability: string | null;
};

export type WorkerGasProfile = {
  deploymentGas: string;
  functions: Record<string, string>;
};

export type WorkerGasProfileResult = {
  gasProfile: WorkerGasProfile;
  abi: unknown[];
  bytecode: string;
  contractName: string;
};

export class WorkerAnalysisService {
  public static async getGasProfile(
    code: string,
    jobId: string,
    signal?: AbortSignal
  ): Promise<WorkerGasProfileResult> {
    this.throwIfAborted(signal);

    const parsed = this.getContractMetadata(code);
    const fileBase = `TempContract_${jobId.replace(/-/g, '_')}`;
    const sourceFile = `${fileBase}.sol`;
    const sourcePath = path.join(HARDHAT_CONTRACTS_PATH, sourceFile);
    const artifactFolder = path.join(HARDHAT_PROJECT_PATH, 'artifacts', 'contracts', sourceFile);

    await fs.writeFile(sourcePath, code);

    try {
      this.throwIfAborted(signal);

      await this.execHardhat(
        ['hardhat', 'compile'],
        {
          cwd: HARDHAT_PROJECT_PATH,
          env: process.env,
        },
        signal
      );

      const { stdout, stderr } = await this.execHardhat(
        ['hardhat', 'run', GAS_SCRIPT_PATH],
        {
          cwd: HARDHAT_PROJECT_PATH,
          env: {
            ...process.env,
            SOURCE_FILE: sourceFile,
          },
        },
        signal
      );

      if (stderr) {
        console.error(`Gas estimator script warning: ${stderr}`);
      }

      const jsonOutputMatch = stdout.match(/\{[\s\S]*\}/);
      if (!jsonOutputMatch) {
        throw new Error('Failed to parse gas estimator output.');
      }
      const gasProfile = JSON.parse(jsonOutputMatch[0]) as WorkerGasProfile;

      const artifactPath = path.join(artifactFolder, `${parsed.contractName}.json`);
      const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8')) as {
        abi: unknown[];
        bytecode: string;
        contractName: string;
      };

      return {
        gasProfile,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        contractName: artifact.contractName,
      };
    } finally {
      await Promise.allSettled([fs.unlink(sourcePath), fs.rm(artifactFolder, { recursive: true, force: true })]);
    }
  }

  private static execHardhat(
    args: string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
    },
    signal?: AbortSignal
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('npx', args, {
        cwd: options.cwd,
        env: options.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let settled = false;

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      const onAbort = () => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 1500);
        const abortError = new Error('Command aborted.');
        abortError.name = 'AbortError';
        reject(abortError);
      };

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        reject(error);
      });

      child.on('close', (code) => {
        if (settled) {
          return;
        }
        settled = true;
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(`Command failed with code ${code}: npx ${args.join(' ')}\n${stderr}`));
      });
    });
  }

  private static throwIfAborted(signal?: AbortSignal): void {
    if (!signal?.aborted) {
      return;
    }
    const error = new Error('Operation aborted.');
    error.name = 'AbortError';
    throw error;
  }

  private static getContractMetadata(code: string): { contractName: string; functions: SolidityFunction[] } {
    const ast = parse(code, { tolerant: true });
    let contractName = '';
    const functions: SolidityFunction[] = [];

    visit(ast, {
      ContractDefinition: (node) => {
        if (!contractName) {
          contractName = node.name;
        }
      },
      FunctionDefinition: (node) => {
        functions.push({
          name: node.name || '<constructor>',
          visibility: node.visibility,
          stateMutability: node.stateMutability || null,
        });
      },
    });

    if (!contractName) {
      throw new Error('No contract definition found in source code.');
    }

    return { contractName, functions };
  }
}
