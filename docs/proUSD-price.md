# Getting the proUSD Price

proUSD is a yield-bearing token whose USD value **accrues over time** rather than
floating with a market/AMM price. The price is a **linearly-interpolated on-chain
ramp** — not a single state variable — stored in the `ProToken` contract
(`contracts/core/ProToken.sol`) and read via `getUSDPrice()`.

## TL;DR

```solidity
uint256 price = IProToken(proTokenAddress).getUSDPrice(); // 18 decimals, USD per 1 proUSD
```

- **Where:** `ProToken.getUSDPrice()` — `contracts/core/ProToken.sol:329`
- **Interface:** `IProToken.getUSDPrice()` — `contracts/core/interfaces/IProToken.sol:120`
- **Format:** `uint256`, 18 decimals (e.g. `1_050000000000000000` = **$1.05**)
- **Reverts** with `USDPriceDisabled()` if the price has been set to `0` (admin killswitch)
- The value returned changes **every block** while a ramp is in progress — it is not
  a static number you can cache indefinitely between reads.

## How the price works

Under the hood, `ProToken` stores a single active **segment**: `(inPrice, futurePrice,
startTime, period)`. `getUSDPrice()` linearly interpolates between `inPrice` (at
`startTime`) and `futurePrice` (at `startTime + period`):

- Before `startTime` → returns `inPrice`
- After `startTime + period` → returns `futurePrice`
- In between → `inPrice + (futurePrice - inPrice) * (block.timestamp - startTime) / period`

This replaces the old instant-jump model: instead of the price snapping to a new
value the moment an update lands, it ramps to it smoothly over `period` seconds, so
a mint right before an update and a redeem right after don't see an instantly-stale
price on one side of the trade.

| Rule | Detail |
|---|---|
| Default | Flat segment at `1e18` (**$1.00**) at initialization (`inPrice == futurePrice`, `period == 0`) |
| Minimum | `1e18` — price can never ramp to below $1, except `0` which disables it |
| Direction | `futurePrice` can only **increase** via the price operator path (reflects accrued yield); `inPrice` is never a caller input — it's auto-set to the *previous* segment's `futurePrice` |
| Admin override | The admin can set the price to any valid value (or `0` to disable) via `setUSDPrice` — applied as a flat, zero-length segment, effective immediately (no ramp) |
| Step size | Optional per-update cap (`stepSize`) limiting how much `futurePrice` can jump in a single `updateUSDPrice` call |
| Cooldown | Optional minimum interval (`priceUpdateCooldown`, default `23 hours`) between price-operator updates |
| Ramp period | `period` must fall within `[MIN_RAMP_PERIOD, MAX_RAMP_PERIOD]` = `[1 minute, 7 days]` |
| Start time | `startTime` must be `>= block.timestamp` (no backdating) and `<= block.timestamp + maxStartTimeAhead` (default `20 minutes`, admin-tunable via `setMaxStartTimeAhead`) |
| No overlap | A new segment can't be opened while the current one is still ramping — `updateUSDPrice` reverts `SegmentInProgress` until `block.timestamp >= startTime + period` |

Two roles can move the price, both resolved via `ProTokenSettings`:

- **Price operator** (`updateUSDPrice(price, startTime, period)`) — routine yield
  accrual updates. Opens a new ramp segment to `price` over `period` seconds
  starting at `startTime`. Must be strictly increasing vs. the current
  `futurePrice`, respect `stepSize`, respect the cooldown, and land within the
  `startTime`/period-overlap bounds above.
- **Admin** (`setUSDPrice(price)`) — unconstrained (aside from the `>= 1e18` or
  `== 0` rule), applied instantly as a flat segment. Used for corrections,
  markdowns, or to disable pricing entirely; also resets the price-operator
  cooldown clock.

### Multichain determinism

`updateUSDPrice` is designed to be called with **identical calldata** —
`(price, startTime, period)` — on every chain the token is deployed to. Since
`inPrice` is never a parameter (it's derived on-chain from the previous segment's
`futurePrice`, which was itself written by an earlier identical cross-chain call),
every chain that has applied the same sequence of updates computes the exact same
ramp curve, regardless of each chain's own confirmation timing. `startTime` still
needs a same-instant meaning everywhere, hence the bound above: the oracle picks it
as "now + buffer," wide enough to cover the slowest chain's confirmation lag; a
chain that misses even that buffer simply reverts and gets resubmitted, rather than
silently landing on a different curve.

## Reading the price

### 1. Directly from the contract (recommended)

The `ProToken` contract *is* proUSD (the ERC-20 itself), so you only need its address.

**Solidity**
```solidity
import "./interfaces/IProToken.sol";

uint256 priceUsd18 = IProToken(PRO_TOKEN_ADDRESS).getUSDPrice();
```

**cast (Foundry)**
```bash
cast call <PRO_TOKEN_ADDRESS> "getUSDPrice()(uint256)" --rpc-url <RPC_URL>
```

**viem (TypeScript)** — using the published ABI package
```ts
import { createPublicClient, http, formatUnits } from "viem";
import { ProToken } from "@highvault/promis-abis";

const client = createPublicClient({ transport: http(RPC_URL) });

const price = await client.readContract({
  address: PRO_TOKEN_ADDRESS,
  abi: ProToken,
  functionName: "getUSDPrice",
});

console.log(`1 proUSD = $${formatUnits(price, 18)}`);
```

**ethers v6 (TypeScript)**
```ts
import { Contract, formatUnits } from "ethers";
import { ProToken } from "@highvault/promis-abis";

const proToken = new Contract(PRO_TOKEN_ADDRESS, ProToken, provider);
const price = await proToken.getUSDPrice();

console.log(`1 proUSD = $${formatUnits(price, 18)}`);
```

### 2. Resolving the proUSD address first

If you only have the `ProTokenSettings` contract address, fetch the proUSD
(`ProToken`) address from it, then call `getUSDPrice()` as above:

```solidity
address proToken = IProTokenSettings(SETTINGS_ADDRESS).getProTokenInfo().proToken;
uint256 priceUsd18 = IProToken(proToken).getUSDPrice();
```

`getProTokenInfo()` — `contracts/core/interfaces/IProTokenSettings.sol:229` — also
returns `proTokenOperations` and `proTokenUnmintHandler`, useful if you need the
mint/unmint entry point in the same call.

### 3. Inspecting the raw ramp segment

To see the full curve rather than just the current interpolated point — e.g. to
show a countdown to the target price, or to read `futurePrice` without waiting for
the ramp to finish — call `getUSDPriceSegment()`. Unlike `getUSDPrice()`, this does
**not** revert when the price is disabled; it returns the zeroed segment instead.

```solidity
(uint256 inPrice, uint256 futurePrice, uint64 startTime, uint64 period) =
    IProToken(PRO_TOKEN_ADDRESS).getUSDPriceSegment();
```

### 4. Watching for updates

Both price-changing paths emit events you can subscribe to instead of polling:

```solidity
event USDPriceSet(uint256 prevPrice, uint256 price);       // admin override (instant)
event USDPriceUpdated(uint256 prevPrice, uint256 price);   // price operator (opens a ramp to `price`)
```

`prevPrice`/`price` are still single `uint256` values in both events — for
`USDPriceUpdated`, `prevPrice` is the *previous* segment's settled `futurePrice`
(== the new segment's `inPrice`) and `price` is the new segment's `futurePrice`
(the ramp's target, not its current interpolated value).

Related view helpers on `ProToken`:

- `getUSDPriceSegment()` — the raw `(inPrice, futurePrice, startTime, period)` tuple
- `getPriceUpdateCooldown()` — current cooldown between operator updates (seconds)
- `getMaxStartTimeAhead()` — current bound on how far `startTime` may be scheduled ahead
- `getLastPriceUpdateAt()` — timestamp of the last operator update

## Where the price is used internally

`ProTokenOperations` reads `getUSDPrice()` directly from the `ProToken` contract to
convert between yAsset amounts and proUSD amounts during mint/unmint
(`_getUsdRepresentationProToken` in `contracts/core/ProTokenOperations.sol:830`).
This is the same value you get from calling `getUSDPrice()` yourself — there is no
separate oracle or AMM price feed for proUSD itself (yAsset backing prices, by
contrast, do come from configured oracles/static sources — see
`_getUsdRepresentationYAsset`).

## Gotchas

- **18-decimal fixed point** — always divide by `1e18` (or use `formatUnits(x, 18)`)
  before displaying to a user.
- **Can revert** — `getUSDPrice()` reverts with `USDPriceDisabled()` if the admin has
  set the price to `0`; handle this case rather than assuming a value is always
  returned. `getUSDPriceSegment()` does not revert in this state.
- **Changes every block during a ramp** — don't treat `getUSDPrice()` as a value
  that only changes on `USDPriceUpdated`/`USDPriceSet`; it moves continuously
  between those events while a ramp is active. If you need the ramp's endpoint
  rather than its live value, read `futurePrice` from `getUSDPriceSegment()`.
- **Not a market price** — proUSD has no AMM pool or price oracle of its own; the
  value is protocol-declared and only moves via `setUSDPrice`/`updateUSDPrice`.
