# `@sidetree/ledger-zksync` Implementation Plan

This document outlines the steps to implement the `@sidetree/ledger-zksync` package, which will provide a zkSync ledger interface for the Sidetree protocol. The implementation will be based on the existing `@sidetree/ledger-ethereum` package.

## Prerequisites

-   `node`: >= 14.20.0
-   `ethers`: ~5.7.0
-   `zksync-web3`: `^0.17.1`

## Detailed Path

### 1. Setup Project Structure

-   **Goal:** Replicate the directory structure of `packages/ledger-ethereum` inside `packages/ledger-zksync`.
-   **Actions:**
    -   Create `src/`, `contracts/`, `migrations/`, and `test/` directories.
    -   Copy configuration files like `.gitignore`, `tsconfig.json`, `jest.config.js`, and `tsdx.config.js` from `packages/ledger-ethereum` and adapt them for the zkSync package.

### 2. Update Dependencies

-   **Goal:** Replace Ethereum-specific dependencies with zkSync-compatible ones.
-   **Actions:**
    -   Modify `packages/ledger-zksync/package.json`.
    -   Remove `web3`, `web3-eth`, and `web3-eth-contract`.
    -   Add `zksync-web3` and its peer dependency `ethers@5`.
    -   Update dev dependencies like `@truffle/hdwallet-provider` if a zkSync-specific provider is needed.

### 3. Implement `ZkSyncLedger.ts`

-   **Goal:** Create the main ledger class that interacts with the zkSync network.
-   **Path:** `packages/ledger-zksync/src/ZkSyncLedger.ts`
-   **Actions:**
    -   Create a `ZkSyncLedger` class that implements the `IBlockchain` interface from `@sidetree/common`.
    -   Initialize `zksync-web3` providers (`Provider` for L2 and `ethers.Provider` for L1).
    -   Adapt the constructor and `initialize` method from `EthereumLedger.ts`.

### 4. Adapt `write` Method

-   **Goal:** Modify the transaction writing logic to use `zksync-web3`.
-   **Path:** `packages/ledger-zksync/src/ZkSyncLedger.ts`
-   **Actions:**
    -   Replace `web3.eth.Contract` calls with `zksync-web3.Contract`.
    -   Use the `zksync-web3` `Wallet` to sign and send transactions.
    -   The `anchorHash` method call on the smart contract will likely remain similar, but the transaction submission process will use the zkSync SDK.

### 5. Adapt `read` Method

-   **Goal:** Fetch and process transactions from the zkSync ledger.
-   **Path:** `packages/ledger-zksync/src/ZkSyncLedger.ts`
-   **Actions:**
    -   Use the `zksync-web3.Provider` to query for past events (`getPastEvents` or similar).
    -   Adapt `eventLogToSidetreeTransaction` in `utils.ts` to parse zkSync transaction logs.
    -   Update `getBlock` and `getBlockchainTime` in `utils.ts` to use `zksync-web3.Provider` methods.

### 6. Adapt Smart Contract

-   **Goal:** Ensure the `SimpleSidetreeAnchor.sol` contract is compatible with zkSync.
-   **Path:** `packages/ledger-zksync/contracts/SimpleSidetreeAnchor.sol`
-   **Actions:**
    -   Copy the contract from `packages/ledger-ethereum/contracts/`.
    -   Review for any zkSync-specific incompatibilities (e.g., opcodes, gas calculations). zkSync aims for EVM compatibility, so changes might be minimal.
    -   Compile the contract using `zksolc` or a compatible compiler if necessary.

### 7. Implement Deployment Script

-   **Goal:** Create a script to deploy the anchor contract to a zkSync network.
-   **Path:** `packages/ledger-zksync/migrations/1_deploy_contract.js` (or similar)
-   **Actions:**
    -   Use a zkSync-compatible deployment tool or adapt the Truffle configuration. `zksync-hardhat` or a custom script with `zksync-web3` might be necessary.
    -   Update `truffle-config.js` or create a new deployment configuration file for zkSync networks (e.g., testnet, mainnet).

### 8. Update Tests

-   **Goal:** Ensure the implementation is correct by running tests against a local zkSync node.
-   **Path:** `packages/ledger-zksync/src/__tests__/`
-   **Actions:**
    -   Set up a local zkSync development node (e.g., using `zksync-cli`).
    -   Adapt the Jest configuration (`jest.config.js`) and test files to connect to the local zkSync node.
    -   Modify tests to account for any differences in transaction timing or confirmation on zkSync.