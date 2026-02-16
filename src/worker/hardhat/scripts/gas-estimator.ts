import { ethers } from 'hardhat';
import fs from 'fs/promises';
import path from 'path';

type Artifact = {
  abi: any[];
  bytecode: string;
  contractName: string;
};

type GasFunctionEntry =
  | {
      status: 'measured';
      gasUsed: string;
      stateMutability: string;
    }
  | {
      status: 'unmeasured';
      reason: string;
      stateMutability: string;
    };

async function main() {
  const sourceFile = process.env.SOURCE_FILE;
  if (!sourceFile) {
    throw new Error('Missing SOURCE_FILE environment variable.');
  }

  const artifactDir = path.join(__dirname, '..', 'artifacts', 'contracts', sourceFile);
  const artifactFileName = await findArtifactFile(artifactDir);
  if (!artifactFileName) {
    throw new Error(`No artifact found for ${sourceFile}`);
  }

  const artifactPath = path.join(artifactDir, artifactFileName);
  const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8')) as Artifact;

  const Contract = await ethers.getContractFactory(artifact.contractName, {
    abi: artifact.abi,
    bytecode: artifact.bytecode,
  });

  const contract = await Contract.deploy();
  await contract.waitForDeployment();

  const deployTx = contract.deploymentTransaction();
  const deployGas = deployTx ? (await deployTx.wait())?.gasUsed.toString() || '0' : '0';

  const functionGasEstimates: Record<string, GasFunctionEntry> = {};
  for (const fragment of artifact.abi) {
    if (fragment.type === 'function') {
      const funcName = functionDisplayName(fragment);
      const stateMutability = fragment.stateMutability || 'nonpayable';
      try {
        const args = generateDeterministicInputs(fragment.inputs || []);
        const fn = contract.getFunction(funcName);
        const estimate = await fn.estimateGas(...args);
        functionGasEstimates[funcName] = {
          status: 'measured',
          gasUsed: estimate.toString(),
          stateMutability,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        functionGasEstimates[funcName] = {
          status: 'unmeasured',
          reason: sanitizeReason(message),
          stateMutability,
        };
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        deploymentGas: deployGas,
        functions: functionGasEstimates,
      },
      null,
      2
    )
  );
}

async function findArtifactFile(artifactDir: string): Promise<string | undefined> {
  const files = await fs.readdir(artifactDir);
  return files.find((file) => file.endsWith('.json') && !file.endsWith('.dbg.json'));
}

function functionDisplayName(fragment: any): string {
  const inputTypes = (fragment.inputs || []).map((input: any) => input.type).join(',');
  return `${fragment.name}(${inputTypes})`;
}

function sanitizeReason(message: string): string {
  const collapsed = message.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 220) {
    return collapsed;
  }
  return `${collapsed.slice(0, 217)}...`;
}

function generateDeterministicInputs(inputs: any[]): any[] {
  return inputs.map((input, index) => generateValueByInput(input, index, 0));
}

function generateValueByInput(input: any, index: number, depth: number): any {
  if (depth > 4) {
    throw new Error(`Unsupported nested type depth for ${input.type}`);
  }
  return generateValue(input.type, input.components || [], index, depth);
}

function generateValue(type: string, components: any[], index: number, depth: number): any {
  const dynamicArrayMatch = type.match(/^(.*)\[\]$/);
  if (dynamicArrayMatch) {
    const base = dynamicArrayMatch[1];
    return [
      generateValue(base, components, index, depth + 1),
      generateValue(base, components, index + 1, depth + 1),
    ];
  }

  const fixedArrayMatch = type.match(/^(.*)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    const base = fixedArrayMatch[1];
    const length = parseInt(fixedArrayMatch[2], 10);
    return Array.from({ length }, (_, i) => generateValue(base, components, index + i, depth + 1));
  }

  if (type === 'tuple') {
    return components.map((component: any, i: number) => generateValueByInput(component, index + i, depth + 1));
  }

  if (type.startsWith('uint') || type === 'uint') {
    return BigInt(index + 1);
  }

  if (type.startsWith('int') || type === 'int') {
    return BigInt(index + 1);
  }

  if (type === 'address') {
    const hex = (index + 1).toString(16).padStart(40, '0');
    return `0x${hex}`;
  }

  if (type === 'bool') {
    return index % 2 === 0;
  }

  if (type === 'string') {
    return `gweizero_${index}`;
  }

  if (type === 'bytes') {
    return '0x1234';
  }

  const fixedBytesMatch = type.match(/^bytes(\d+)$/);
  if (fixedBytesMatch) {
    const size = parseInt(fixedBytesMatch[1], 10);
    return `0x${'11'.repeat(size)}`;
  }

  throw new Error(`Unsupported ABI type: ${type}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
