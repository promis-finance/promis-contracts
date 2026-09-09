// config/index.js
const path = require("path");
const fs = require("fs");

const NETWORK_TO_FILE = {
  // Mainnet
  ethereum:           "mainnet/ethereum.js",
  katana:             "mainnet/katana.js",

  // Testnet
  ethereumTestnet:    "testnet/ethereumTestnet.js",
  bscTestnet:         "testnet/bscTestnet.js",
  hardhat:            "testnet/hardhat.js",

  // Fork
  ethereumFork:       "fork/ethereum.fork.js",
  katanaFork:         "fork/katana.fork.js",
};

function loadConfig(networkName) {
  const key = process.env.DEPLOY_CONFIG || networkName;
  const rel = NETWORK_TO_FILE[key];
  if (!rel) {
    throw new Error(
      `No config mapping for network "${key}". ` +
      `Known: ${Object.keys(NETWORK_TO_FILE).join(", ")}`
    );
  }
  const file = path.join(__dirname, rel);
  if (!fs.existsSync(file)) {
    throw new Error(`Config file missing: ${file}`);
  }
  const cfg = require(file);
  cfg._network = key;
  return cfg;
}

module.exports = { loadConfig };