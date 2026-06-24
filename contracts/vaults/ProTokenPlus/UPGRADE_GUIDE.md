The correct upgrade cycle for the `ProTokenPlus` system requires a coordinated update of both the main proxy implementation and the satellite operations contract, due to the strict version coupling and the delegatecall pattern.

### 1. The Upgrade Cycle (v1 -> v2)

Because `ProTokenPlus` enforces that its `VERSION` matches the `operationsHandler` version, you cannot upgrade them independently. You must upgrade them together.

**Step 1: Prepare the Code**

1.  **Update State (Optional):** If you need new variables, add them to `ProTokenPlusState.sol`. **Append only** (add to the end) and reduce the `__gap` array size.
2.  **Update Operations:** Modify `ProTokenPlusOperations.sol`. Increment `VERSION` (e.g., to `2_00_00`).
3.  **Update Implementation:** Modify `ProTokenPlus.sol`. Increment `VERSION` to match the Operations contract (`2_00_00`).

**Step 2: Deployment**

1.  **Deploy Satellite:** Deploy the new `ProTokenPlusOperations` contract.
2.  **Deploy Implementation:** Deploy the new `ProTokenPlus` implementation contract.

**Step 3: Execution (Atomic Upgrade)**
It is highly recommended to perform the upgrade atomically to avoid a state where the v2 Implementation is trying to talk to the v1 Operations contract (which would cause a version mismatch revert or logic errors).

- **Option A: Standard Upgrade (Two Transactions)**

  1.  Call `upgradeTo(newImplementationAddress)` on the proxy.
      - _Note:_ At this exact moment, the proxy is v2 but the operations handler is still v1. Any interaction checking version compatibility will fail until the next step.
  2.  Call `setOperationsHandler(newOperationsAddress)` on the proxy.

- **Option B: Atomic Upgrade (Recommended)**
  Use `upgradeToAndCall` to upgrade and set the handler in one transaction.
  1.  In `ProTokenPlus.sol` (v2), add a re-initializer function:
      ```solidity
      /// @custom:oz-upgrades-unsafe-allow constructor
      function reinitializeV2(address _newOperationsHandler) external reinitializer(2) {
          // Update the handler immediately
          setOperationsHandler(_newOperationsHandler);
      }
      ```
  2.  Execute the upgrade:
      ```solidity
      proxy.upgradeToAndCall(
          newImplementationAddress,
          abi.encodeCall(ProTokenPlus.reinitializeV2, (newOperationsAddress))
      );
      ```

### 2. Best Practices to Prevent Storage Corruption

The "Satellite Pattern" uses `delegatecall`, meaning `ProTokenPlusOperations` executes logic using the storage of `ProTokenPlus`. They **must** agree on where every variable lives.

**Rule 1: The "Append-Only" Rule**
Never delete or reorder variables in `ProTokenPlusState.sol`.

- **Bad:** Changing `uint256 unbondingPeriod` to `uint128`.
- **Bad:** Inserting a new variable `bool isActive` at the top.
- **Good:** Adding `bool isActive` at the very end of the contract.

**Rule 2: Maintain the Gap**
`ProTokenPlusState` has a storage gap: `uint256[49] private __gap;`.
When you add a variable, reduce the gap to keep the storage layout alignment for any future contracts that might inherit from it.

- _Example:_ Adding `uint256 public newVar;`
- _Action:_ Change gap to `uint256[48] private __gap;`

**Rule 3: Identical State Inheritance**
Both contracts must inherit `ProTokenPlusState` in a way that aligns the storage slots starting at 0.

- Your project uses **OpenZeppelin v5**, which uses "Namespaced Storage" for `Initializable`, `UUPS`, `Pausable`, etc. This is excellent because these contracts do _not_ occupy standard storage slots (0, 1, 2...).
- This ensures `ProTokenPlusState` variables start at **Slot 0** in both `ProTokenPlus` and `ProTokenPlusOperations`.
- **Danger:** Do not inherit any _other_ stateful contracts (that don't use namespaced storage) before `ProTokenPlusState` in the `ProTokenPlus` inheritance list.

**Rule 4: No State in Logic Contracts**
Never define state variables directly in `ProTokenPlus.sol` or `ProTokenPlusOperations.sol`.

- Constants (`constant`) and Immutables (`immutable`) are fine (they are part of the bytecode).
- If you accidentally add `uint256 public myVar` to `ProTokenPlus.sol` before `ProTokenPlusState`, it will shift all state variables, corrupting the storage when `ProTokenPlusOperations` tries to access them.

### Summary Checklist for v2

1.  [ ] `ProTokenPlusState.sol`: New variables appended to end, gap reduced.
2.  [ ] `ProTokenPlus.sol`: `VERSION` incremented.
3.  [ ] `ProTokenPlusOperations.sol`: `VERSION` incremented (must match above).
4.  [ ] **Verify:** Both contracts import the exact same `ProTokenPlusState.sol` file.
5.  [ ] **Deploy:** Operations v2 -> Implementation v2.
6.  [ ] **Upgrade:** `upgradeToAndCall` with a reinitializer that sets the new operations handler.
