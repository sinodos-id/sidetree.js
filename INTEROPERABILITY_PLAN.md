# Plan for Sidetree Interoperability

This document outlines the plan to adapt the `sidetree.js` repository to work with an existing Sidetree-compatible network that uses the `did:quarkid` method.

## Background

An analysis has confirmed that the existing network's on-chain data anchoring and off-chain IPFS data structures are fully compatible with this `sidetree.js` implementation. The primary difference is the DID method name (`did:quarkid`).

## Objective

To configure and run a Sidetree node from this repository that can successfully interact with the existing `did:quarkid` network.

## The Plan

The core of this repository is highly modular, so we don't need to change any of the existing code in `@sidetree/core`. Instead, we will create a new package that configures the Sidetree node to use your specific contract and DID method.

Here are the steps:

1.  **Create a New DID Method Package**:
    *   A new package, `did-method-quarkid`, will be created in the `packages/` directory.
    *   This package will be a lightweight configuration layer that tells the Sidetree core how to interact with your network.
    *   It will be modeled after the existing `did-method-element` package to ensure it integrates smoothly with the existing build and dependency management systems.

2.  **Configure the `did:quarkid` Method**:
    *   Inside the new package, a configuration file (e.g., `quarkid-config.json`) will be created.
    *   This file will contain the network-specific details:
        *   The smart contract address: `0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7`
        *   The Ethereum RPC URL.
        *   The IPFS API endpoint.
    *   The configuration will also specify the DID method name as `quarkid`, which will result in DIDs like `did:quarkid:123...`.

3.  **Integrate and Build**:
    *   The new package will be added to the Lerna configuration to ensure it is properly linked and built with the rest of the project.
    *   We will then run the build process to compile the new package and make it available to the rest of the system.

4.  **Test the New Configuration**:
    *   A simple integration test will be added to the `did-method-quarkid` package.
    *   This test will initialize a Sidetree node using the new configuration and perform a basic operation (like creating a DID) to verify that the node can successfully connect to your contract and IPFS node.

5.  **Run the Sidetree Node**:
    *   Once the tests pass, you will be able to run the Sidetree node from the `packages/did-method-quarkid` directory.
    *   The node will be fully configured to work with your existing network, allowing you to create, resolve, and manage `did:quarkid` DIDs using this repository's more modern and maintainable codebase.

This approach ensures that we don't modify the core Sidetree logic, making future updates easier. It also encapsulates all your network-specific configurations in a single, dedicated package.