import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-contract-sizer";
import { HardhatUserConfig } from "hardhat/config";
import type { HardhatNetworkUserConfig } from "hardhat/types";
import "hardhat-abi-exporter";
import "dotenv/config";

const HARDHAT_CHAIN_ID = Number(process.env.HARDHAT_CHAIN_ID ?? "31337");

if (Number.isNaN(HARDHAT_CHAIN_ID)) {
  throw new Error("HARDHAT_CHAIN_ID must be a valid number");
}

const useIntervalMining = process.env.HARDHAT_INTERVAL_MINING === "true";
const intervalMiningMsEnv = process.env.HARDHAT_INTERVAL_MINING_MS;
const intervalMiningMs = intervalMiningMsEnv !== undefined ? Number(intervalMiningMsEnv) : 1000;

if (intervalMiningMsEnv !== undefined && Number.isNaN(intervalMiningMs)) {
  throw new Error("HARDHAT_INTERVAL_MINING_MS must be a valid number when provided");
}

if (useIntervalMining && intervalMiningMs <= 0) {
  throw new Error("HARDHAT_INTERVAL_MINING_MS must be greater than zero");
}

const hardhatNetworkConfig: HardhatNetworkUserConfig = {
  chainId: HARDHAT_CHAIN_ID,
  ...(useIntervalMining
    ? {
      mining: {
        auto: false,
        interval: intervalMiningMs,
      },
    }
    : {}),
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.29",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000
          }
        }
      }
    ],
    // overrides: {
    //   "contracts/vaults/ProTokenPlus/ProTokenPlus.sol": {
    //     version: "0.8.29",
    //     settings: {
    //       optimizer: {
    //         enabled: true,
    //         runs: 5000,
    //       },
    //     },
    //   }
    // }
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    only: [], // Or specify contract names here
  },
  // ABI Exporter - generates raw ABIs
  abiExporter: {
    path: './packages/promis-abis/abi',
    runOnCompile: true,
    clear: true,
    flat: true, // one file per contract
    only: ['OraclePromisPullAdaptor', 'OracleRedStoneAdaptor', 'OracleAlgebraAdaptor', 'OracleChainlinkPushAdaptor', 'ProToken', 'ProTokenOperations', 'ProTokenUnmintHandler', "ProTokenSettings", 'ERC20', 'YAssetOperationsHandler', 'AaveV3YieldHandler', 'ProTokenPlus', 'ProTokenPlusRewardDistributor'],
    format: "json",
  },
  networks: {
    hardhat: hardhatNetworkConfig,
    // Local development
    docker: {
      url: "http://evm-hardhat:8545"
    },
    localhost: {
      url: "http://localhost:8545",
      chainId: 31337
    },
    // Testnets
    bsc_testnet: {
      url: process.env.BSC_TESTNET_RPC || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: process.env.BSC_TESTNET_PRIVATE_KEY ? [process.env.BSC_TESTNET_PRIVATE_KEY] : []
    },
    sepolia: {
      chainId: 11155111,
      url: process.env.SEPOLIA_TESTNET_RPC || "",
      accounts: process.env.SEPOLIA_TESTNET_PRIVATE_KEY ? [process.env.SEPOLIA_TESTNET_PRIVATE_KEY] : []
    },
    katana_testnet: {
      chainId: 737373,
      url: process.env.KATANA_TESTNET_RPC || "",
      accounts: process.env.KATANA_TESTNET_PRIVATE_KEY ? [process.env.KATANA_TESTNET_PRIVATE_KEY] : []
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN,
    customChains: [
      {
        network: "bokuto",
        chainId: 737373,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=737373",
          browserURL: "https://bokuto.katanascan.com",
        },
      },
    ],
  },
};

export default config;
