/**
 * ============================================================================
 *  Promis deploy config — ETHEREUM MAINNET-FORK REHEARSAL
 * ============================================================================
 *  The REAL ethereum.js config, unchanged, except:
 *    - roles → deterministic local hardhat accounts (the mainnet file has
 *      nulls, which correctly throw when useMocks=false)
 *    - rehearsal.whales → funded mainnet holders to impersonate for SMOKE=1
 *
 *  admin is account[1] (NOT the deployer, account[0]) ON PURPOSE: it forces
 *  the proposeAdmin handover path to run during the rehearsal.
 *
 *  Fork an Ethereum node, then point the scripts at it:
 *    npx hardhat node --fork https://gateway.tenderly.co/public/mainnet --fork-block-number <N>
 *    npx hardhat run scripts/deploy.js       --network localhost
 *    npx hardhat run scripts/verify.js --network localhost   # add SMOKE=1 for a live mint
 *    npx hardhat run scripts/checklist.js --network localhost
 * 
 * ============================================================================
 */
const base = require("../mainnet/ethereum.js");

// Hardhat default-mnemonic accounts (deployer is [0]).
const A = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // 0 — deployer
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // 1
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // 2
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // 3
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", // 4
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", // 5
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9", // 6
];

module.exports = {
  ...base,
  network: "ethereumFork",
  expectedChainId: 31337,
  roles: {
    admin: A[1],            // ≠ deployer → exercises the proposeAdmin handover
    operator: A[2],
    priceOperator: A[3],
    authority: A[4],        // a local signer → SMOKE=1 can sign real EIP-712 proofs
    strategist: A[5],
    bridgeAdmin: A[6],
    externalBusiness: null,
  },

  rehearsal: {
    whales: {
      USDC: "0x01b8697695EAb322A339c4bf75740Db75dc9375E",
      USDT: "0xF977814e90dA44bFA03b6295A0616a897441aceC", // Binance 8
    },
  },
};