import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const owner = process.env.CONTRACT_OWNER || deployer.address;

  console.log(`Deploying GasOptimizationRegistry with deployer: ${deployer.address}`);
  console.log(`Initial owner: ${owner}`);

  const factory = await ethers.getContractFactory("GasOptimizationRegistry");
  const contract = await factory.deploy(owner);
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log(`GasOptimizationRegistry deployed at: ${deployedAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
