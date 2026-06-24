# ProToken+ Contract Implementation Specification

## Executive Summary

ProToken+ is a **vault system** for locking ProUSD tokens to earn additional variable yield. Users lock ProUSD into tiers with different durations and earn rewards proportional to their commitment. The system uses a tiered lockup mechanism with cascade behavior and merkle-based reward distribution.

---

## Architecture Overview

| Contract                          | Purpose                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| **ProTokenPlus**                  | Core vault for deposits, positions, lockups, and withdrawals                            |
| **ProTokenPlusOperations**        | Satellite contract that has ProTokenPlus operation logic (done due to size constraints) |
| **ProTokenPlusRewardDistributor** | Merkle-based reward distributions                                                       |

Both contracts are UUPS upgradeable proxies with admin access via `ProTokenSettings`.

---

## Lockup Tiers

### Tier Structure

| Tier | Name        | Duration | Depositable | Notes                    |
| ---- | ----------- | -------- | ----------- | ------------------------ |
| 3    | Annual      | 1 year   | ✅ Yes      | Highest rewards          |
| 2    | Semi-Annual | 6 months | ✅ Yes      | Medium rewards           |
| 1    | Quarterly   | 3 months | ✅ Yes      | Lower rewards            |
| 0    | Floor       | No lock  | ❌ No       | Cascade destination only |

### Cascade Behavior

When a position expires without auto-reup:

- **Tier 3 → Tier 2** (or configured cascade target)
- **Tier 2 → Tier 1**
- **Tier 1 → Tier 0** (Floor)
- **Tier 0** → No further cascade

> **Design Decision**: Cascade target is **snapshotted at deposit time**. This ensures predictable behavior even if admin changes cascade targets later.

### Auto-Reup

Positions with `autoReup = true` automatically re-lock for another full period when they expire. The position is never considered "unlocked" and continues earning at the locked tier rate.

> **Note**: Auto-reup uses the **current tier duration** at materialization time, not the original duration.

---

## User Flows

### Deposit Flow

1. User selects tier (Quarterly, Semi-Annual, or Annual)
2. User deposits ProUSD amount
3. User chooses auto-reup preference
4. Position is created with lock expiry timestamp

### Withdrawal Flow

1. Position must be **unlocked** (expired without auto-reup)
2. User initiates withdrawal → starts **unbonding period** (default 2 weeks)
3. ⚠️ **No rewards earned during unbonding**
4. After unbonding completes → user claims ProUSD

### Relock Flow

Users with unlocked positions can relock into any depositable tier at any time, creating a new locked position.

### Position Merging

- **Locked merge**: Add funds to existing locked position (resets lock timer)
- **Unlocked merge**: Consolidate multiple unlocked positions on same tier

---

## Position States

| State         | Description            | Can Withdraw?               | Earns Rewards?              |
| ------------- | ---------------------- | --------------------------- | --------------------------- |
| **Locked**    | Within lockup period   | ❌ No                       | ✅ Yes (locked tier rate)   |
| **Cascaded**  | Expired, unlocked      | ✅ Yes (triggers unbonding) | ✅ Yes (cascaded tier rate) |
| **Unbonding** | Withdrawal in progress | ⏳ Pending                  | ❌ No                       |

---

## Reward Distribution

### Overview

Rewards are distributed periodically (e.g., quarterly) using a merkle tree approach:

1. **Off-chain indexer** aggregates position events
2. **Weight calculation** based on amount × time × tier multiplier
3. **Merkle tree** generated with user rewards
4. **Admin publishes** merkle root on-chain
5. **Users claim** with merkle proofs

### Weight Calculation

For each position during a reward period:

**Weight = Amount × Time Active × Tier Multiplier**

Key considerations:

- Positions may transition between tiers during a period (at `lockExpiry`)
- Auto-reup positions stay at locked tier rate
- Time is calculated from `activeFromTimestamp` to `activeToTimestamp` (or period end)

### Tier Transitions

If a position's `lockExpiry` falls within the reward period:

- Time before expiry → weighted at `lockedTierId` rate
- Time after expiry → weighted at `unlockedTierId` rate (unless auto-reup)

### Unclaimed Rewards

Past distributions remain claimable indefinitely unless the admin explicitly withdraws the remaining unclaimed funds via `withdrawUnclaimed`. This is intended for recovering funds from old distributions with low activity.

---

## Scalability Design

### On-Chain Mitigations

| Feature                                   | Purpose                                      |
| ----------------------------------------- | -------------------------------------------- |
| `getUserBalanceSummary()`                 | Single RPC call for dashboard totals         |
| `minDeposit` per tier                     | Limits position creation rate, prevents spam |
| `unlockedPositionsToMerge` on all actions | Passive consolidation reduces position count |
| Pagination on position queries            | Handles large position lists                 |

### Realistic Bounds

With meaningful `minDeposit` (e.g., $100-1000 USD):

- **Casual user**: 5-20 positions → trivially handled
- **Power user**: 50-100 positions → single-call viable
- **Whale**: 200-500 positions → manageable with merging

### UI/UX Strategies

- **Overview first**: Show tier totals only, not all positions
- **Lazy loading**: Load position details on-demand per tier
- **Client caching**: Cache positions locally to avoid re-fetching
- **Passive merging**: UI suggests merging unlocked positions during actions

---

## Off-Chain Indexing

### Event-Based State Reconstruction

The indexer maintains position state by processing events:

| Event                 | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `PositionCreated`     | Track new positions                                   |
| `PositionDeactivated` | Track position lifecycle (includes all position data) |
| `PositionAutoReupped` | Track auto-reup materializations                      |
| `AutoReupToggled`     | Track setting changes                                 |

### Checkpointing Strategy

1. Replay events from genesis (or last checkpoint)
2. Build position state map
3. Save checkpoints periodically
4. Listen for new blocks

---

## Security Features

- **UUPS Upgradeable** with version checks
- **Reentrancy Protection** on all state-changing functions
- **Pausable** (global and per-distribution)
- **Double-Hash Merkle Leaves** prevents second preimage attacks
- **SafeERC20** for all token transfers

---

## Key Design Decisions

1. **Lazy Cascade Evaluation**: Position state computed at query time, not stored. Reduces gas costs and storage.

2. **Cascade Target Snapshot**: `unlockedTierId` captured at deposit time for predictable behavior.

3. **Unbonding Period**: Prevents bank runs by requiring 2-week delay for withdrawals.

4. **Separate Reward Contract**: Decouples reward logic from vault, allows independent upgrades.

5. **Merkle Distribution**: Gas-efficient claiming, supports large user bases.

6. **Batch Operations**: Most functions support arrays for gas efficiency.
