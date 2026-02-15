# GweiZero Contracts

Smart contracts package for on-chain proof minting.

## Includes

- `contracts/GasOptimizationRegistry.sol`
- Hardhat config and deployment script
- Basic contract tests

## Setup

```bash
cd src/contracts
npm install
cp .env.example .env
```

## Build

```bash
npm run build
```

## Test

```bash
npm test
```

## Deploy

Local:

```bash
npm run deploy:local
```

BSC Testnet:

```bash
npm run deploy:testnet
```

BSC Mainnet:

```bash
npm run deploy:mainnet
```

After deployment, set backend env:

- `GAS_OPTIMIZATION_REGISTRY_ADDRESS=<deployed-address>`
- `CHAIN_RPC_URL=<rpc-url>`
- `BACKEND_SIGNER_PRIVATE_KEY=<relayer-private-key>`
