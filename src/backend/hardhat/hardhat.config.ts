import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      // Configuration for the local in-memory network
    },
  },
  paths: {
    sources: "./contracts",
    tests: "../test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
