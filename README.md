# Promis - Contracts

## Project Overview

TODO

## High Level Architecture Diagram

TODO

## Local Testing

### Start local test node

```
npx hardhat node
```

### Run tests

```
npx hardhat test
```

## Folder Structure

- `contracts/`: Solidity source code for the protocol.

  - `core/`: Core wrapped-token modules responsible for state, settings, mint/burn/transfer operations and reserves.
    - `ProToken*.sol`: Main entry contracts for token logic (`ProToken`, `ProTokenSettings`, `ProTokenOperations`, `ProTokenReserve`).
    - `interfaces/`: External/public interfaces for the core modules.
    - `state/`: Storage-layout contracts used to separate data from logic.
    - `types/`: Shared structs/enums used by core modules.
    - `proxies/`: Lightweight proxy contracts for core modules.
  - `oracles/`: Oracle adaptor layer for pricing.
    - Adaptors: `OracleRedStoneAdaptor`, `OracleRedStonePushAdaptor`, `OracleAlgebraAdaptor`.
    - `interfaces/`, `state/`, `types/`, `proxies/`: Same pattern as core to expose APIs, persist state, share types, and provide proxy pros.
  - `yields/`: Yield handling and accounting.
    - Handlers/logic: `AaveV3YieldHandler`, `YieldAssetOperationsHandler`, `YieldCollector`.
    - `interfaces/`, `state/`, `types/`, `proxies/`: Same modular split for clarity and upgradability.
  - `test/`: Solidity mocks and helpers used by the TS tests (e.g., mock pools, tokens, reentrancy testers, revert helpers).

- `test/`: Hardhat tests organized by domain.
  - `unit/core/`: Unit tests for core wrapped-token contracts and market/reserve/settings/operations.
  - `unit/oracles/`: Unit tests for oracle adaptors and proxies.
  - `unit/yields/`: Unit tests for yield handlers, collectors, and operations.
