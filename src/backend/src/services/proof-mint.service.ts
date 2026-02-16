import { Contract, JsonRpcProvider, Wallet, ZeroAddress, ethers } from 'ethers';
import { AnalysisJobRecord } from './analysis-job.service';

const GAS_OPTIMIZATION_REGISTRY_ABI = [
  'function mintProof(bytes32 _originalHash, bytes32 _optimizedHash, address _contractAddress, string _contractName, uint32 _originalGas, uint32 _optimizedGas, uint16 _savingsPercent) external returns (uint256)',
  'event OptimizationProofMinted(uint256 indexed tokenId, address indexed optimizer, string contractName, uint16 savingsPercent)',
];

export type ProofPayload = {
  originalHash: string;
  optimizedHash: string;
  contractAddress: string;
  contractName: string;
  originalGas: number;
  optimizedGas: number;
  savingsPercentBps: number;
};

export class ProofMintService {
  public static buildProofPayload(job: AnalysisJobRecord, contractAddress?: string, contractName?: string): ProofPayload {
    if (!job.result) {
      throw new Error('Analysis result is missing.');
    }
    if (job.status !== 'completed') {
      throw new Error('Analysis job must be completed before proof generation.');
    }
    if (!job.result.optimizationValidation?.accepted) {
      throw new Error('Optimization did not pass final acceptance validation.');
    }
    if (!job.result.optimizedDynamicProfile) {
      throw new Error('Missing optimized gas profile for accepted optimization.');
    }

    const originalCode = job.code;
    const optimizedCode = job.result.aiOptimizations.optimizedContract || job.code;
    const originalGas = this.coerceGas(job.result.dynamicProfile.gasProfile);
    const optimizedGas = this.coerceGas(job.result.optimizedDynamicProfile.gasProfile);

    const savingsPercentBps =
      originalGas > 0 ? Math.max(0, Math.min(10000, Math.round(((originalGas - optimizedGas) / originalGas) * 10000))) : 0;

    return {
      originalHash: ethers.keccak256(ethers.toUtf8Bytes(originalCode)),
      optimizedHash: ethers.keccak256(ethers.toUtf8Bytes(optimizedCode)),
      contractAddress: contractAddress || ZeroAddress,
      contractName: contractName || job.result.staticProfile.contractName || 'UnknownContract',
      originalGas,
      optimizedGas,
      savingsPercentBps,
    };
  }

  public static async mintProof(payload: ProofPayload): Promise<{
    txHash: string;
    tokenId?: string;
    registryAddress: string;
    chainId: number;
  }> {
    const rpcUrl = process.env.CHAIN_RPC_URL;
    const privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;
    const registryAddress = process.env.GAS_OPTIMIZATION_REGISTRY_ADDRESS;

    if (!rpcUrl) {
      throw new Error('CHAIN_RPC_URL is required to mint proofs.');
    }
    if (!privateKey) {
      throw new Error('BACKEND_SIGNER_PRIVATE_KEY is required to mint proofs.');
    }
    if (!registryAddress) {
      throw new Error('GAS_OPTIMIZATION_REGISTRY_ADDRESS is required to mint proofs.');
    }

    const provider = new JsonRpcProvider(rpcUrl);
    const signer = new Wallet(privateKey, provider);
    const contract = new Contract(registryAddress, GAS_OPTIMIZATION_REGISTRY_ABI, signer);

    const tx = await contract.mintProof(
      payload.originalHash,
      payload.optimizedHash,
      payload.contractAddress,
      payload.contractName,
      payload.originalGas,
      payload.optimizedGas,
      payload.savingsPercentBps
    );
    const receipt = await tx.wait();

    let tokenId: string | undefined;
    for (const log of receipt?.logs || []) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed?.name === 'OptimizationProofMinted') {
          tokenId = parsed.args?.tokenId?.toString();
          break;
        }
      } catch {
        // Ignore unrelated logs
      }
    }

    const network = await provider.getNetwork();
    return {
      txHash: tx.hash,
      tokenId,
      registryAddress,
      chainId: Number(network.chainId),
    };
  }

  private static coerceGas(gasProfile: {
    deploymentGas: string;
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
    >;
  }): number {
    const numericFns = Object.values(gasProfile.functions || {})
      .filter(
        (entry): entry is { status: 'measured'; gasUsed: string; stateMutability: string } =>
          entry.status === 'measured' &&
          (entry.stateMutability === 'nonpayable' || entry.stateMutability === 'payable')
      )
      .map((entry) => Number(entry.gasUsed))
      .filter((x) => Number.isFinite(x) && x > 0);

    if (numericFns.length > 0) {
      const avg = numericFns.reduce((a, b) => a + b, 0) / numericFns.length;
      return this.toUint32(avg);
    }

    const deployment = Number(gasProfile.deploymentGas || 0);
    return this.toUint32(deployment);
  }

  private static toUint32(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 0;
    }
    return Math.min(0xffffffff, Math.round(value));
  }
}
