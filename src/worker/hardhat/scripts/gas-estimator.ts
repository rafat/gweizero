import { ethers } from 'hardhat';
import fs from 'fs/promises';
import path from 'path';

type Artifact = {
  abi: any[];
  bytecode: string;
  contractName: string;
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

  const functionGasEstimates: Record<string, string> = {};
  for (const fragment of artifact.abi) {
    if (
      fragment.type === 'function' &&
      (fragment.stateMutability === 'nonpayable' || fragment.stateMutability === 'payable')
    ) {
      const funcName = fragment.name;
      try {
        const fn = contract.getFunction(funcName);
        const estimate = await fn.estimateGas(...generateDefaultInputs(fragment.inputs || []));
        functionGasEstimates[funcName] = estimate.toString();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        functionGasEstimates[funcName] = `Error: ${message}`;
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

function generateDefaultInputs(inputs: any[]): any[] {
  const defaultValues: Record<string, any> = {
    uint256: 1,
    uint: 1,
    address: '0x0000000000000000000000000000000000000001',
    string: '',
    bytes: '0x',
    bool: false,
  };

  return inputs.map((input) => defaultValues[input.type] ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
