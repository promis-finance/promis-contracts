# Getting the proUSD Price

proUSD is a yield-bearing token whose USD value **accrues over time** rather than
floating with a market/AMM price. The price is a single on-chain state variable —
`usdPrice` — stored in the `ProToken` contract (`contracts/core/ProToken.sol`) and
read via `getUSDPrice()`.

## TL;DR

```solidity
uint256 price = IProToken(proTokenAddress).getUSDPrice(); // 18 decimals, USD per 1 proUSD
```

- **Where:** `ProToken.getUSDPrice()` — `contracts/core/ProToken.sol:193`
- **Interface:** `IProToken.getUSDPrice()` — `contracts/core/interfaces/IProToken.sol:66`
- **Format:** `uint256`, 18 decimals (e.g. `1_050000000000000000` = **$1.05**)
- **Reverts** with `USDPriceDisabled()` if the price has been set to `0` (admin killswitch)

## How the price works

Unlike an AMM-derived or oracle-derived price, proUSD's USD price is a
**monotonically non-decreasing, protocol-managed value**:

| Rule | Detail |
|---|---|
| Default | `1e18` (**$1.00**) at initialization |
| Minimum | `1e18` — price can never be set below $1, except `0` which disables it |
| Direction | Can only **increase** via the price operator path (reflects accrued yield) |
| Admin override | The admin can set the price to any valid value (or `0` to disable) via `setUSDPrice` |
| Step size | Optional per-update cap (`stepSize`) limiting how much the price can jump in a single `updateUSDPrice` call |
| Cooldown | Optional minimum interval (`priceUpdateCooldown`, default `23 hours`) between price-operator updates |

Two roles can move the price, both resolved via `ProTokenSettings`:

- **Price operator** (`updateUSDPrice`) — routine yield accrual updates. Must be
  strictly increasing, respect `stepSize`, and respect the cooldown.
- **Admin** (`setUSDPrice`) — unconstrained (aside from the `>= 1e18` or `== 0` rule),
  used for corrections or to disable pricing entirely.

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

### 3. Watching for updates

Both price-changing paths emit events you can subscribe to instead of polling:

```solidity
event USDPriceSet(uint256 prevPrice, uint256 price);       // admin override
event USDPriceUpdated(uint256 prevPrice, uint256 price);   // price operator accrual
```

Related view helpers on `ProToken`:

- `getPriceUpdateCooldown()` — current cooldown between operator updates (seconds)
- `getLastPriceUpdateAt()` — timestamp of the last operator update

## Where the price is used internally

`ProTokenOperations` reads `getUSDPrice()` directly from the `ProToken` contract to
convert between yAsset amounts and proUSD amounts during mint/unmint
(`_getUsdRepresentationProToken` in `contracts/core/ProTokenOperations.sol:812`).
This is the same value you get from calling `getUSDPrice()` yourself — there is no
separate oracle or AMM price feed for proUSD itself (yAsset backing prices, by
contrast, do come from configured oracles/static sources — see
`_getUsdRepresentationYAsset`).

## Gotchas

- **18-decimal fixed point** — always divide by `1e18` (or use `formatUnits(x, 18)`)
  before displaying to a user.
- **Can revert** — `getUSDPrice()` reverts with `USDPriceDisabled()` if the admin has
  set the price to `0`; handle this case rather than assuming a value is always
  returned.
- **Not a market price** — proUSD has no AMM pool or price oracle of its own; the
  value is protocol-declared and only moves via `setUSDPrice`/`updateUSDPrice`.
