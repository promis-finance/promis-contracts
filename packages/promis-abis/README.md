# @highvault/promis-abis

ABI exports for Promis smart contracts, providing TypeScript-typed ABIs for use with viem and wagmi.

## Installation

```bash
npm install @highvault/promis-abis
```

## Usage

### With viem

```typescript
import { proTokenAbi, erc20Abi } from "@highvault/promis-abis";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const client = createPublicClient({
  chain: mainnet,
  transport: http(),
});

const balance = await client.readContract({
  address: "0x...",
  abi: proTokenAbi,
  functionName: "balanceOf",
  args: ["0x..."],
});
```

### With wagmi

```typescript
import { proTokenAbi } from "@highvault/promis-abis";
import { useReadContract } from "wagmi";

function MyComponent() {
  const { data: balance } = useReadContract({
    address: "0x...",
    abi: proTokenAbi,
    functionName: "balanceOf",
    args: ["0x..."],
  });

  return <div>Balance: {balance?.toString()}</div>;
}
```

## Available ABIs

- `proTokenAbi` - ProToken contract
- `proTokenOperationsAbi` - ProTokenOperations contract
- `proTokenSettingsAbi` - ProTokenSettings contract
- `proTokenUnmintHandlerAbi` - ProTokenUnmintHandler contract
- `oracleRedStoneAdaptorAbi` - OracleRedStoneAdaptor contract
- `oracleAlgebraAdaptorAbi` - OracleAlgebraAdaptor contract
- `yAssetOperationsHandlerAbi` - YAssetOperationsHandler contract
- `erc20Abi` - Standard ERC20 contract

## Package Formats

This package provides both CommonJS and ES Module formats:

- **CommonJS**: `dist/index.js` (for Node.js)
- **ES Module**: `dist/index.mjs` (for modern bundlers)
- **TypeScript**: `dist/index.d.ts` (type definitions)

## Publish

Access token in '~/.npmrc' file.
npm run publish

## License

MIT
