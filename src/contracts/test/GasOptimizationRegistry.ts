import { expect } from "chai";
import { ethers } from "hardhat";

describe("GasOptimizationRegistry", function () {
  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("GasOptimizationRegistry");
    const registry = await factory.deploy(owner.address);
    await registry.waitForDeployment();
    return { registry, owner, user };
  }

  it("mints proof and stores data", async function () {
    const { registry, user } = await deployFixture();

    const tx = await registry
      .connect(user)
      .mintProof(
        ethers.keccak256(ethers.toUtf8Bytes("original")),
        ethers.keccak256(ethers.toUtf8Bytes("optimized")),
        ethers.ZeroAddress,
        "MyContract",
        100000,
        80000,
        2000
      );

    await expect(tx).to.emit(registry, "OptimizationProofMinted");
    expect(await registry.getTotalProofs()).to.equal(1n);

    const proof = await registry.getProof(0);
    expect(proof.contractName).to.equal("MyContract");
    expect(proof.originalGas).to.equal(100000);
    expect(proof.optimizedGas).to.equal(80000);
    expect(proof.savingsPercent).to.equal(2000);
    expect(proof.optimizer).to.equal(user.address);
  });

  it("reverts for invalid savings percent", async function () {
    const { registry, user } = await deployFixture();

    await expect(
      registry
        .connect(user)
        .mintProof(
          ethers.keccak256(ethers.toUtf8Bytes("original")),
          ethers.keccak256(ethers.toUtf8Bytes("optimized")),
          ethers.ZeroAddress,
          "BadContract",
          100000,
          100000,
          10001
        )
    ).to.be.revertedWith("Invalid savings percent");
  });
});
