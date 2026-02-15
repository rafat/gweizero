import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";

dotenv.config();

const privateKey = process.env.DEPLOYER_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_URL || "",
      chainId: 97,
      accounts: privateKey ? [privateKey] : []
    },
    bscMainnet: {
      url: process.env.BSC_MAINNET_RPC_URL || "",
      chainId: 56,
      accounts: privateKey ? [privateKey] : []
    }
  }
};

export default config;
