import { expect } from "chai";
import { ethers } from "hardhat";

describe("GasOptimizerAdvanced", function () {
  it("Should deploy and initialize correctly", async function () {
    const [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy contract
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Check owner
    expect(await contract.owner()).to.equal(owner.address);
    expect(await contract.version()).to.equal(2);
    expect(await contract.paused()).to.be.false;
  });

  it("Should create account successfully", async function () {
    const [owner, user1] = await ethers.getSigners();
    
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Create account
    await expect(contract.connect(user1).createAccount(ethers.ZeroAddress))
      .to.emit(contract, "AccountCreated")
      .withArgs(user1.address, await ethers.provider.getBlock("latest").then(b => b!.timestamp));
    
    // Check account data
    const account = await contract.accounts(user1.address);
    expect(account.isActive).to.be.true;
    expect(account.tier).to.equal(1);
  });

  it("Should batch stake successfully", async function () {
    const [owner, user1] = await ethers.getSigners();
    
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Create account first
    await contract.connect(user1).createAccount(ethers.ZeroAddress);
    
    // Batch stake
    const amounts = [100, 200, 300];
    await expect(contract.connect(user1).batchStake(amounts))
      .to.emit(contract, "StakeDeposited");
    
    // Check balance
    const account = await contract.accounts(user1.address);
    expect(account.balance).to.equal(600);
  });

  it("Should handle batch withdraw", async function () {
    const [owner, user1] = await ethers.getSigners();
    
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Create account and stake
    await contract.connect(user1).createAccount(ethers.ZeroAddress);
    await contract.connect(user1).batchStake([500]);
    
    // Withdraw
    await expect(contract.connect(user1).batchWithdraw([100, 200]))
      .to.emit(contract, "StakeWithdrawn");
    
    // Check balance
    const account = await contract.accounts(user1.address);
    expect(account.balance).to.equal(200);
  });

  it("Should create reward pool and claim rewards", async function () {
    const [owner, user1] = await ethers.getSigners();
    
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Create account and stake
    await contract.connect(user1).createAccount(ethers.ZeroAddress);
    await contract.connect(user1).batchStake([1000]);
    
    // Create reward pool
    const now = await ethers.provider.getBlock("latest").then(b => b!.timestamp);
    await contract.createRewardPool(0, 10000, now, now + 86400);
    
    // Claim rewards
    await expect(contract.connect(user1).claimRewards([0]))
      .to.emit(contract, "RewardClaimed");
  });

  it("Should handle batch transfer", async function () {
    const [owner, user1, user2] = await ethers.getSigners();
    
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Create accounts and stake
    await contract.connect(user1).createAccount(ethers.ZeroAddress);
    await contract.connect(user2).createAccount(ethers.ZeroAddress);
    await contract.connect(user1).batchStake([1000]);
    
    // Transfer
    await expect(contract.connect(user1).batchTransfer([user2.address], [500]))
      .to.emit(contract, "Transfer");
    
    // Check balances
    const account1 = await contract.accounts(user1.address);
    const account2 = await contract.accounts(user2.address);
    expect(account1.balance).to.equal(500);
    expect(account2.balance).to.equal(500);
  });

  it("Should get all users", async function () {
    const [owner, user1, user2, user3] = await ethers.getSigners();
    
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Create accounts
    await contract.connect(user1).createAccount(ethers.ZeroAddress);
    await contract.connect(user2).createAccount(ethers.ZeroAddress);
    await contract.connect(user3).createAccount(ethers.ZeroAddress);
    
    // Get all users
    const users = await contract.getAllUsers();
    expect(users.length).to.equal(3);
  });

  it("Should get platform stats", async function () {
    const [owner, user1] = await ethers.getSigners();
    
    const GasOptimizerAdvanced = await ethers.getContractFactory("GasOptimizerAdvanced");
    const contract = await GasOptimizerAdvanced.deploy(ethers.ZeroAddress);
    await contract.waitForDeployment();
    
    // Create account and stake
    await contract.connect(user1).createAccount(ethers.ZeroAddress);
    await contract.connect(user1).batchStake([100, 200]);
    
    // Get stats
    const stats = await contract.getPlatformStats();
    expect(stats.totalUsersCount).to.equal(1);
    expect(stats.totalTxCount).to.equal(2);
  });
});
