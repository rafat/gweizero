// hardhat/scripts/gas-estimator.ts
import { ethers } from "hardhat";
import fs from "fs/promises";
import path from "path";

async function main() {
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/TempContract.sol/TempContract.json"
  );
  const artifact = JSON.parse(await fs.readFile(artifactPath, "utf8"));

  const Contract = await ethers.getContractFactory(
    artifact.contractName,
    {
      abi: artifact.abi,
      bytecode: artifact.bytecode,
    }
  );

  console.log("Deploying contract...");
  const contract = await Contract.deploy();
  await contract.waitForDeployment();
  const deploymentTransaction = contract.deploymentTransaction();
  const deployGas = deploymentTransaction ? (await deploymentTransaction.wait())?.gasUsed.toString() : '0';


  console.log(`Contract deployed. Deployment gas: ${deployGas}`);

  const functionGasEstimates: Record<string, string> = {};

  for (const fragment of artifact.abi) {
    if (fragment.type === "function" && (fragment.stateMutability === "nonpayable" || fragment.stateMutability === "payable")) {
        const funcName = fragment.name;
        // This is a simplified estimation. For functions with arguments,
        // we'd need a more sophisticated way to generate mock data.
        try {
            const func = contract.getFunction(funcName);
            const tx = await func.estimateGas(...generateDefaultInputs(fragment.inputs));
            functionGasEstimates[funcName] = tx.toString();
        } catch (e: any) {
            functionGasEstimates[funcName] = `Error: ${e.message}`;
        }
    }
  }

  const output = {
    deploymentGas: deployGas,
    functions: functionGasEstimates,
  };

  console.log(JSON.stringify(output, null, 2));
}

function generateDefaultInputs(inputs: any[]): any[] {
    const defaultValues: any = {
        'uint256': 1,
        'uint': 1,
        'address': "0x0000000000000000000000000000000000000001", // Placeholder address
        'string': "",
        'bytes': "0x",
        'bool': false
        // Add more types as needed
    };
    return inputs.map(input => {
        // For tuples (structs), we'd need to recursively generate inputs.
        // This is a simplified version.
        return defaultValues[input.type] || 0;
    });
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
