/**
 * ============================================================================
 *  Promis deploy — dynamic venues, multi-yAsset, RESUMABLE
 * ============================================================================
 *
 *  CONFIG-DRIVEN TOPOLOGY
 *    cfg.yAssets is an ARRAY. Each entry gets its own YAssetOperationsHandler,
 *    price config, and venue set:
 *      venues.aave:   []  → no Aave handler for this yAsset
 *                     [1+] → one AaveV3YieldHandler per entry
 *      venues.morpho: []  → no Morpho handler
 *                     [1+] → one MorphoYieldHandler per entry (params fetched
 *                            from the Morpho core by marketId and VERIFIED by
 *                            re-hashing — no hand-typed oracle/irm/lltv)
 *    No venues at all → routing is skipped; deposits sit idle on the yOps
 *    handler (fully backed) until a handler is registered later and
 *    distributeUnallocatedYAsset is called.
 *
 *    Legacy single-yAsset configs (cfg.yAsset + cfg.aave + cfg.oracle) are
 *    auto-normalized into the array form, so old testnet configs keep working.
 *
 *  ORACLES (mainnet-proper)
 *    One shared OracleChainlinkPushAdaptor is deployed if ANY yAsset prices
 *    via oracle (staticPriceSource == 0). Each such yAsset maps to its
 *    Chainlink feed on that adaptor (feed decimals from config, staleness
 *    override supported). Static-priced yAssets skip the adaptor entirely.
 *
 *  RESUMABILITY
 *    Every deploy and every wiring tx is a named STEP recorded in
 *    scripts/output/<network>.deploy-state.json immediately after it lands.
 *    Re-running the script skips completed steps (logged with ↺) and picks up
 *    where it died — mid-wiring, mid-venue, anywhere.
 *      FRESH=1 npx hardhat run scripts/deploy.js --network <net>   → ignore state
 *      CRASH_AFTER=<n>  → throw after the n-th EXECUTED step (resume drill)
 *
 *    Env flags (bash form shown above). PowerShell sets them separately and
 *    they PERSIST for the session — clear them before the next run:
 *      $env:FRESH = "1";  $env:CRASH_AFTER = "12"
 *      npx hardhat run scripts/deploy.js --network localhost
 *      $env:FRESH = "";   $env:CRASH_AFTER = ""     # <- important on PowerShell
 *    (The script trims/normalizes these, so a stray "1 " or "" won't misfire.)
 *
 *  ADMIN HANDOVER (fixes a landmine in the old script)
 *    Settings is initialized with the DEPLOYER as admin so all wiring calls
 *    (which are onlyAdmin) can actually execute. At the very end, if
 *    roles.admin != deployer, the script calls proposeAdmin(roles.admin) —
 *    the real admin must then call acceptAdmin() from their own key.
 *    (The old script initialized with the final admin directly; on mainnet
 *    that made every subsequent setter revert NotAdmin.)
 * ============================================================================
 */
let hre = require("hardhat");
let { ethers, upgrades } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");

// ────────────────────────────────────────────────────────────────────────────
//  State (resumability)
// ────────────────────────────────────────────────────────────────────────────
const OUT_DIR = path.join(__dirname, "output");

function statePath(network) {
  return path.join(OUT_DIR, `${network}.deploy-state.json`);
}
function loadState(network) {
  if ((process.env.FRESH || "").trim() === "1") {
    console.log("FRESH=1 → ignoring any previous deploy state\n");
    return { contracts: {}, steps: {} };
  }
  const p = statePath(network);
  if (!fs.existsSync(p)) return { contracts: {}, steps: {} };
  const s = JSON.parse(fs.readFileSync(p, "utf8"));
  console.log(`Resuming from ${p} (${Object.keys(s.contracts).length} contracts, ${Object.keys(s.steps).length} steps done)\n`);
  return s;
}
let STATE;
let NETWORK;
function saveState() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(statePath(NETWORK), JSON.stringify(STATE, null, 2) + "\n");
}

let stepNo = 0;
function log(mark, label, extra = "") {
  console.log(`${mark} [${String(++stepNo).padStart(3)}] ${label}${extra ? " — " + extra : ""}`);
}
let executedSteps = 0;
/** Deterministic failure injection for resume drills. Counts only EXECUTED
 *  steps (skipped ↺ steps don't count), so a resumed run makes progress past
 *  the previous crash point instead of dying at the same number. */
function maybeCrash() {
  executedSteps++;
  const at = Number((process.env.CRASH_AFTER || "").trim() || 0);
  if (at && executedSteps >= at) {
    throw new Error(`CRASH_AFTER=${at}: simulated crash after ${executedSteps} executed steps — re-run the same command (without CRASH_AFTER) to test resume`);
  }
}

/** Deploy a UUPS proxy once; on resume, re-attach. Key must be unique. */
async function deployProxyStep(key, factoryName, args, deployer) {
  if (STATE.contracts[key]) {
    log("↺", key, STATE.contracts[key]);
    return ethers.getContractAt(factoryName, STATE.contracts[key]);
  }
  const F = await ethers.getContractFactory(factoryName, deployer);
  const c = await upgrades.deployProxy(F, args, { kind: "uups" });
  await c.waitForDeployment();
  STATE.contracts[key] = await c.getAddress();
  saveState();
  log("✓", key, STATE.contracts[key]);
  maybeCrash();
  return c;
}
/** Plain (non-proxy) deploy once. */
async function deployPlainStep(key, factoryName, args, deployer) {
  if (STATE.contracts[key]) {
    log("↺", key, STATE.contracts[key]);
    return ethers.getContractAt(factoryName, STATE.contracts[key]);
  }
  const F = await ethers.getContractFactory(factoryName, deployer);
  const c = await F.deploy(...args);
  await c.waitForDeployment();
  STATE.contracts[key] = await c.getAddress();
  saveState();
  log("✓", key, STATE.contracts[key]);
  maybeCrash();
  return c;
}
/** Run a wiring tx once. fn must return the pending tx. */
async function txStep(key, fn) {
  if (STATE.steps[key]) {
    log("↺", key);
    return;
  }
  const tx = await fn();
  const rc = await tx.wait();
  STATE.steps[key] = rc.hash;
  saveState();
  log("✓", key);
  maybeCrash();
}

// ────────────────────────────────────────────────────────────────────────────
//  Config normalization + validation
// ────────────────────────────────────────────────────────────────────────────
function normalizeConfig(cfg) {
  if (cfg.yAssets) return cfg;
  // Legacy single-yAsset shape → array form.
  const legacyAave =
    cfg.aave && (cfg.aave.poolAddress || cfg.useMocks)
      ? [{
          label: "aave",
          poolAddress: cfg.aave.poolAddress,
          aTokenAddress: cfg.aave.aTokenAddress,
          aTokenName: cfg.aave.aTokenName,
          aTokenSymbol: cfg.aave.aTokenSymbol,
          aTokenDecimals: cfg.aave.aTokenDecimals,
          allocationBps: cfg.aave.allocationBps,
          impairmentToleranceBps: cfg.aave.impairmentToleranceBps,
          mockYieldRateBps: cfg.aave.mockYieldRateBps,
          mockPreFund: cfg.aave.mockPreFund,
        }]
      : [];
  cfg.yAssets = [{
    symbol: cfg.yAsset.symbol || "YASSET",
    address: cfg.yAsset.address,
    name: cfg.yAsset.name,
    decimals: cfg.yAsset.decimals,
    unmintFeePer: cfg.yAsset.unmintFeePer,
    unmintEligible: true,
    price: {
      staticPriceSource: cfg.yAsset.staticPriceSource,
      usdCap: cfg.yAsset.usdCap,
      chainlinkFeed: cfg.oracle ? cfg.oracle.feedAddress : null,
      feedDecimals: cfg.oracle ? cfg.oracle.feedDecimals : 8,
      mockAggregatorAnswer: cfg.oracle ? cfg.oracle.mockAggregatorAnswer : 0n,
    },
    venues: { aave: legacyAave, morpho: [] },
  }];
  cfg.oracleAggregationMaxDeviationBps =
    cfg.oracleAggregationMaxDeviationBps ?? (cfg.oracle ? cfg.oracle.aggregationMaxDeviationBps : 0);
  return cfg;
}

function validateConfig(cfg) {
  const seen = new Set();
  for (const ya of cfg.yAssets) {
    if (!ya.symbol) throw new Error("every yAssets[] entry needs a unique symbol (used for state keys)");
    if (seen.has(ya.symbol)) throw new Error(`duplicate yAsset symbol "${ya.symbol}"`);
    seen.add(ya.symbol);
    if (!ya.address && !cfg.useMocks) throw new Error(`${ya.symbol}: address is null and useMocks=false`);
    const p = ya.price;
    if (p.usdCap === 0n || p.usdCap === undefined) throw new Error(`${ya.symbol}: usdCap must be nonzero (protocol requires it)`);
    const usingOracle = p.staticPriceSource === 0n;
    if (usingOracle && !p.chainlinkFeed && !cfg.useMocks) {
      throw new Error(`${ya.symbol}: staticPriceSource=0 (oracle path) but no chainlinkFeed and useMocks=false`);
    }
    if (!usingOracle && !cfg.useMocks) {
      console.warn(`⚠  ${ya.symbol}: STATIC price on a non-mock network — this collapses the min/max clamp to a no-op. Strongly reconsider.`);
    }
    const aave = ya.venues?.aave ?? [];
    const morpho = ya.venues?.morpho ?? [];
    for (const v of aave) {
      if (!v.label) throw new Error(`${ya.symbol}: every aave venue needs a label`);
      if (!v.poolAddress && !cfg.useMocks) throw new Error(`${ya.symbol}/${v.label}: poolAddress null, useMocks=false`);
      if (!cfg.useMocks && (v.impairmentToleranceBps ?? 0) === 0) {
        console.warn(`⚠  ${ya.symbol}/${v.label}: impairmentToleranceBps=0 — live Aave reserves carry dust deficits; the venue will silently refuse all allocation.`);
      }
    }
    for (const v of morpho) {
      if (!v.label) throw new Error(`${ya.symbol}: every morpho venue needs a label`);
      if (!v.coreAddress) throw new Error(`${ya.symbol}/${v.label}: morpho coreAddress required (no mock supported)`);
      if (!v.marketId && !v.marketParams) throw new Error(`${ya.symbol}/${v.label}: provide marketId (preferred) or marketParams`);
    }
    const venues = [...aave, ...morpho];
    if (venues.length > 0) {
      const total = venues.reduce((a, v) => a + BigInt(v.allocationBps), 0n);
      if (total !== 10000n) throw new Error(`${ya.symbol}: venue allocationBps sum to ${total}, must be 10000`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Preflight — catch the cross-OS / cross-shell footguns with clear messages
//  BEFORE any deploy tx, so a misconfigured run fails in 1s, not mid-wiring.
// ────────────────────────────────────────────────────────────────────────────
async function preflight(cfg, deployer) {
  const problems = [];
  const warn = [];

  // 1) Signer actually present (missing PRIVATE_KEY / mnemonic is the #1 cause
  //    of a "works on my machine" failure on a real network).
  if (!deployer || !deployer.address) {
    problems.push("No signer available — set the deployer key for this network in hardhat.config (accounts).");
  }

  // 2) On a non-mock network the RPC must be reachable and the chain must match.
  if (!cfg.useMocks) {
    let net;
    try {
      net = await ethers.provider.getNetwork();
    } catch (e) {
      problems.push(`Cannot reach the RPC for --network ${hre.network.name}. Check the URL / your internet / VPN. (${e.shortMessage || e.message})`);
    }
    if (net && cfg.expectedChainId && Number(net.chainId) !== Number(cfg.expectedChainId)) {
      problems.push(`Chain id mismatch: connected to ${net.chainId} but config expects ${cfg.expectedChainId}. Wrong --network or wrong RPC URL.`);
    }
    // 3) Deployer must be funded (env-independent; catches the empty-key case too).
    if (deployer && net) {
      const bal = await ethers.provider.getBalance(deployer.address);
      if (bal === 0n) {
        problems.push(`Deployer ${deployer.address} has 0 native balance on chain ${net?.chainId} — fund it before deploying.`);
      } else {
        warn.push(`Deployer balance: ${ethers.formatEther(bal)} (chain ${net?.chainId}).`);
      }
    }
  }

  // 4) State-file resumability sanity: if a state file exists but points at a
  //    chain with no code at a recorded address, it is stale (e.g. the fork
  //    node was restarted). Tell the user to FRESH=1 instead of failing weirdly.
  const anyAddr = STATE.contracts && Object.values(STATE.contracts)[0];
  if (anyAddr && !cfg.useMocks) {
    try {
      const code = await ethers.provider.getCode(anyAddr);
      if (code === "0x") {
        problems.push(
          `Resume state ${statePath(NETWORK)} references ${anyAddr}, but that address has NO code on the ` +
          `connected chain — the state file is stale (chain was reset/restarted). ` +
          `Re-run with FRESH=1 (PowerShell: $env:FRESH="1") or delete the state file.`);
      }
    } catch { /* network already reported above */ }
  }

  if (warn.length) warn.forEach(w => console.log("   " + w));
  if (problems.length) {
    console.error("\nPreflight failed:\n" + problems.map(p => "  ✗ " + p).join("\n") + "\n");
    throw new Error("Preflight checks failed — nothing was deployed. Fix the above and re-run.");
  }
  console.log("Preflight OK.\n");
}

// ────────────────────────────────────────────────────────────────────────────
async function main() {
  const cfg = normalizeConfig(loadConfig(hre.network.name));
  validateConfig(cfg);
  NETWORK = cfg._network;
  STATE = loadState(NETWORK);

  const [deployer] = await ethers.getSigners();
  console.log(`===== Promis deploy (network: ${NETWORK}, useMocks: ${cfg.useMocks}) =====`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`yAssets:  ${cfg.yAssets.map(a => a.symbol).join(", ")}\n`);

  await preflight(cfg, deployer);

  const r = cfg.roles;
  const resolveRole = (val, label) => {
    if (val) return val;
    if (!cfg.useMocks) throw new Error(`Role "${label}" is null in a non-mock env — set it in the network config`);
    return deployer.address;
  };
  const ADMIN          = resolveRole(r.admin, "admin");
  const OPERATOR       = resolveRole(r.operator, "operator");
  const PRICE_OPERATOR = resolveRole(r.priceOperator, "priceOperator");
  const AUTHORITY      = resolveRole(r.authority, "authority");
  const STRATEGIST     = resolveRole(r.strategist, "strategist");
  const BRIDGE_ADMIN   = resolveRole(r.bridgeAdmin, "bridgeAdmin");
  const EXTERNAL_BIZ   = r.externalBusiness; // may be null → skipped

  // ══ Core: proUSD ══════════════════════════════════════════════════════════
  console.log("----- proUSD core");
  // Settings admin = DEPLOYER for now (all wiring below is onlyAdmin).
  // Handover to the real ADMIN happens as the LAST step via proposeAdmin.
  const settings = await deployProxyStep(
    "ProTokenSettings", "ProTokenSettings",
    [deployer.address, OPERATOR, PRICE_OPERATOR], deployer);
  const settingsAddr = await settings.getAddress();

  const ops = await deployProxyStep(
    "ProTokenOperations", "ProTokenOperations", [settingsAddr], deployer);
  const opsAddr = await ops.getAddress();

  const proToken = await deployProxyStep(
    "ProToken", "ProToken",
    [cfg.proToken.name, cfg.proToken.symbol, settingsAddr, opsAddr], deployer);
  const proTokenAddr = await proToken.getAddress();

  const unmintHandler = await deployProxyStep(
    "ProTokenUnmintHandler", "ProTokenUnmintHandler",
    [settingsAddr, cfg.unmint.batchDuration], deployer);
  const unmintHandlerAddr = await unmintHandler.getAddress();

  // ══ proUSD+ ═══════════════════════════════════════════════════════════════
  console.log("----- proUSD+");
  const plusOps = await deployPlainStep(
    "ProTokenPlusOperations", "ProTokenPlusOperations", [], deployer);
  const plusOpsAddr = await plusOps.getAddress();

  const proTokenPlus = await deployProxyStep(
    "ProTokenPlus", "ProTokenPlus",
    [settingsAddr, proTokenAddr, cfg.proTokenPlus.tierIds, cfg.proTokenPlus.tiers], deployer);
  const proTokenPlusAddr = await proTokenPlus.getAddress();

  // ══ Per-yAsset: token + yOps handler ═══════════════════════════════════════
  console.log("----- yAssets + operations handlers");
  const ya = {}; // symbol → { addr, yOps, yOpsAddr, venueHandlers: [{label,type,contract,addr,allocationBps,...}] }
  for (const a of cfg.yAssets) {
    let tokenAddr = a.address;
    if (!tokenAddr) {
      const mock = await deployPlainStep(
        `MockYAsset:${a.symbol}`, "MintableERC20",
        [a.name, a.symbol, a.decimals], deployer);
      tokenAddr = await mock.getAddress();
    } else {
      log("·", `yAsset:${a.symbol}`, tokenAddr);
    }
    const yOps = await deployProxyStep(
      `YAssetOperationsHandler:${a.symbol}`, "YAssetOperationsHandler",
      [settingsAddr, tokenAddr], deployer);
    ya[a.symbol] = { cfg: a, addr: tokenAddr, yOps, yOpsAddr: await yOps.getAddress(), venueHandlers: [] };
  }

  // ══ Oracle adaptor (shared) + per-asset feed mappings ══════════════════════
  const oracleAssets = cfg.yAssets.filter(a => a.price.staticPriceSource === 0n);
  let oracleAdaptor = null, oracleAdaptorAddr = null;
  if (oracleAssets.length > 0) {
    console.log("----- Oracle (shared Chainlink push adaptor)");
    oracleAdaptor = await deployProxyStep(
      "OracleChainlinkPushAdaptor", "OracleChainlinkPushAdaptor", [settingsAddr], deployer);
    oracleAdaptorAddr = await oracleAdaptor.getAddress();

    for (const a of oracleAssets) {
      let feedAddr = a.price.chainlinkFeed;
      if (!feedAddr) {
        const mockAgg = await deployPlainStep(
          `MockFeed:${a.symbol}`, "MockChainlinkPushOracle",
          [a.price.mockAggregatorAnswer], deployer);
        feedAddr = await mockAgg.getAddress();
      }
      await txStep(`oracle.map:${a.symbol}`, () =>
        oracleAdaptor.setAssetToPushOracleMappings(
          [ya[a.symbol].addr], [feedAddr], [a.price.feedDecimals]));
      // Mapping resets staleness to 86400; apply override after it.
      if (a.price.stalenessThreshold) {
        await txStep(`oracle.staleness:${a.symbol}`, () =>
          oracleAdaptor.setStalenessThreshold(ya[a.symbol].addr, a.price.stalenessThreshold));
      }
    }
  } else {
    console.log("----- Oracle: SKIPPED (every yAsset uses a static price)");
  }

  // ══ Venues per yAsset ══════════════════════════════════════════════════════
  for (const a of cfg.yAssets) {
    const S = ya[a.symbol];
    const aaveVenues = a.venues?.aave ?? [];
    const morphoVenues = a.venues?.morpho ?? [];
    if (aaveVenues.length + morphoVenues.length === 0) {
      console.log(`----- ${a.symbol} venues: NONE (deposits will sit idle on the yOps handler)`);
      continue;
    }
    console.log(`----- ${a.symbol} venues (${aaveVenues.length} aave, ${morphoVenues.length} morpho)`);

    for (const v of aaveVenues) {
      let poolAddr = v.poolAddress, aTokenAddr = v.aTokenAddress;
      let mockPool = null, mockAToken = null;
      if (!poolAddr) {
        mockPool = await deployPlainStep(`MockAavePool:${a.symbol}:${v.label}`, "MockAaveV3", [], deployer);
        poolAddr = await mockPool.getAddress();
      }
      if (!aTokenAddr) {
        if (cfg.useMocks && mockPool) {
          mockAToken = await deployPlainStep(
            `MockAToken:${a.symbol}:${v.label}`, "MockATokenV3",
            [v.aTokenName || `a${a.symbol}`, v.aTokenSymbol || `a${a.symbol}`, v.aTokenDecimals ?? a.decimals], deployer);
          aTokenAddr = await mockAToken.getAddress();
        } else {
          // Real pool, no explicit aToken → handler falls back to pool.getReserveAToken().
          aTokenAddr = ethers.ZeroAddress;
        }
      }
      const handler = await deployProxyStep(
        `AaveV3YieldHandler:${a.symbol}:${v.label}`, "AaveV3YieldHandler",
        [settingsAddr, S.yOpsAddr, poolAddr, S.addr, aTokenAddr], deployer);
      S.venueHandlers.push({
        type: "aave", label: v.label, contract: handler,
        addr: await handler.getAddress(), allocationBps: v.allocationBps,
        impairmentToleranceBps: v.impairmentToleranceBps ?? 0,
        mockPool, mockAToken, poolAddr, aTokenAddr,
        mockYieldRateBps: v.mockYieldRateBps, mockPreFund: v.mockPreFund,
      });
    }

    for (const v of morphoVenues) {
      // Resolve MarketParams from the core by marketId (preferred) and VERIFY
      // by re-hashing; explicit marketParams are accepted but also verified
      // when a marketId is present.
      const core = new ethers.Contract(
        v.coreAddress,
        ["function idToMarketParams(bytes32) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)"],
        ethers.provider
      );
      let mp;
      if (v.marketId) {
        mp = await core.idToMarketParams(v.marketId);
        const recomputed = ethers.keccak256(
          ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "address", "address", "uint256"],
            [mp.loanToken, mp.collateralToken, mp.oracle, mp.irm, mp.lltv]));
        if (recomputed !== v.marketId)
          throw new Error(`${a.symbol}/${v.label}: marketId round-trip failed (market not found on core?)`);
      } else {
        mp = v.marketParams;
      }
      if (ethers.getAddress(mp.loanToken) !== ethers.getAddress(S.addr))
        throw new Error(`${a.symbol}/${v.label}: market loanToken ${mp.loanToken} != yAsset ${S.addr}`);
      console.log(`    ${v.label}: loan=${mp.loanToken} collat=${mp.collateralToken} lltv=${mp.lltv}`);

      const handler = await deployProxyStep(
        `MorphoYieldHandler:${a.symbol}:${v.label}`, "MorphoYieldHandler",
        [settingsAddr, S.yOpsAddr, v.coreAddress,
         [mp.loanToken, mp.collateralToken, mp.oracle, mp.irm, mp.lltv]], deployer);
      S.venueHandlers.push({
        type: "morpho", label: v.label, contract: handler,
        addr: await handler.getAddress(), allocationBps: v.allocationBps,
      });
    }
  }

  // ══ Settings wiring: core addresses (BEFORE StrategyVault) ═════════════════
  console.log("----- Settings wiring");
  await txStep("settings.setProToken", () => settings.setProToken(proTokenAddr));
  await txStep("settings.setProTokenOperations", () => settings.setProTokenOperations(opsAddr));
  await txStep("settings.setProTokenUnmintHandler", () => settings.setProTokenUnmintHandler(unmintHandlerAddr));
  await txStep("settings.setOperator", () => settings.setOperator(OPERATOR));
  await txStep("settings.setPriceOperator", () => settings.setPriceOperator(PRICE_OPERATOR));
  await txStep("settings.setStrategist", () => settings.setStrategist(STRATEGIST));
  await txStep("settings.setBridgeAdmin", () => settings.setBridgeAdmin(BRIDGE_ADMIN));
  if (EXTERNAL_BIZ) {
    await txStep("settings.setExternalBusiness", () => settings.setExternalBusiness(EXTERNAL_BIZ));
  }
  await txStep("settings.setOracleAggregationSettings", () =>
    settings.setOracleAggregationSettings(cfg.oracleAggregationMaxDeviationBps ?? 0));
  await txStep("settings.setAuthority", () => settings.setAuthority(AUTHORITY, true));

  // ══ StrategyVault (AFTER proToken/ops are known to Settings) ═══════════════
  console.log("----- StrategyVault");
  const strategyVault = await deployProxyStep(
    "StrategyVault", "StrategyVault", [settingsAddr, proTokenPlusAddr], deployer);
  const strategyVaultAddr = await strategyVault.getAddress();
  await txStep("settings.setStrategyVault", () => settings.setStrategyVault(strategyVaultAddr));

  // yieldRecipient: where claimYield() sends banked appreciation. Defaults to
  // the admin multisig if not explicitly configured. MUST run before the admin
  // handover — setYieldRecipient is onlyAdmin and the deployer is admin now.
  // The setter rejects the zero address, so a null resolve would revert; guard it.
  const YIELD_RECIPIENT = cfg.strategyVault?.yieldRecipient || ADMIN;
  if (!YIELD_RECIPIENT || YIELD_RECIPIENT === ethers.ZeroAddress) {
    throw new Error("yieldRecipient unresolved — set cfg.strategyVault.yieldRecipient or roles.admin");
  }
  await txStep("strategyVault.setYieldRecipient", () =>
    strategyVault.setYieldRecipient(YIELD_RECIPIENT));
  console.log(`    yieldRecipient → ${YIELD_RECIPIENT}` +
    (cfg.strategyVault?.yieldRecipient ? " (from config)" : " (defaulted to admin)"));

  // ══ yAsset registration + unmint eligibility ═══════════════════════════════
  console.log("----- yAsset registration");
  for (const a of cfg.yAssets) {
    const S = ya[a.symbol];
    const usingOracle = a.price.staticPriceSource === 0n;
    const yAssetSettings = {
      yOperationsHandler: S.yOpsAddr,
      decimals: a.decimals,
      isEnabled: true,
      isPaused: false,
      unmintFeePer: a.unmintFeePer,
      priceSettings: {
        staticPriceSource: a.price.staticPriceSource,
        usdCap: a.price.usdCap,
        oraclePriceSources: usingOracle
          ? [oracleAdaptorAddr, ...(a.price.extraOracleAdaptors ?? [])]
          : [],
      },
    };
    await txStep(`settings.setYAsset:${a.symbol}`, () => settings.setYAsset(S.addr, yAssetSettings));
  }
  const unmintList = cfg.yAssets.filter(a => a.unmintEligible !== false).map(a => ya[a.symbol].addr);
  await txStep("settings.setUnmintYAssets", () => settings.setUnmintYAssets(unmintList));

  // ══ ProToken price config ══════════════════════════════════════════════════
  console.log("----- ProToken price config");
  await txStep("proToken.setStepSize", () => proToken.setStepSize(cfg.proToken.stepSize));
  await txStep("proToken.setPriceUpdateCooldown", () =>
    proToken.setPriceUpdateCooldown(cfg.proToken.priceUpdateCooldown));
  if (cfg.proToken.launchPrice !== undefined) {
    await txStep("proToken.setUSDPrice", () => proToken.setUSDPrice(cfg.proToken.launchPrice));
  }

  // ══ ProTokenPlus satellite wiring ═════════════════════════════════════════
  await txStep("proTokenPlus.setOperationsHandler", () =>
    proTokenPlus.setOperationsHandler(plusOpsAddr));

  // ══ Yield routing per yAsset ═══════════════════════════════════════════════
  console.log("----- Yield routing");
  for (const a of cfg.yAssets) {
    const S = ya[a.symbol];
    if (S.venueHandlers.length === 0) {
      console.log(`    ${a.symbol}: SKIPPED (no venues; deposits stay idle until a handler is added)`);
      continue;
    }
    const addrs = S.venueHandlers.map(h => h.addr);
    const allocs = S.venueHandlers.map(h => BigInt(h.allocationBps));
    await txStep(`yOps.setYProtocolHandlers:${a.symbol}`, () =>
      S.yOps.setYProtocolHandlers(addrs, allocs, false));
    for (const h of S.venueHandlers) {
      if (h.type === "aave" && h.impairmentToleranceBps > 0) {
        await txStep(`aave.setImpairmentTolerance:${a.symbol}:${h.label}`, () =>
          h.contract.setImpairmentTolerance(h.impairmentToleranceBps));
      }
    }
  }

  // ══ Mock-only Aave plumbing + pre-fund ════════════════════════════════════
  if (cfg.useMocks) {
    for (const a of cfg.yAssets) {
      for (const h of ya[a.symbol].venueHandlers) {
        if (h.type !== "aave" || !h.mockPool) continue;
        console.log(`----- Mock Aave plumbing (${a.symbol}/${h.label})`);
        await txStep(`mock.aToken.setPool:${a.symbol}:${h.label}`, () => h.mockAToken.setPool(h.poolAddr));
        await txStep(`mock.pool.setAToken:${a.symbol}:${h.label}`, () => h.mockPool.setAToken(ya[a.symbol].addr, h.aTokenAddr));
        await txStep(`mock.pool.setYieldRate:${a.symbol}:${h.label}`, () => h.mockPool.setYieldRate(ya[a.symbol].addr, h.mockYieldRateBps ?? 0));
        if ((h.mockPreFund ?? 0n) > 0n) {
          const token = await ethers.getContractAt("MintableERC20", ya[a.symbol].addr);
          await txStep(`mock.prefund.mint:${a.symbol}:${h.label}`, () => token.mint(deployer.address, h.mockPreFund));
          await txStep(`mock.prefund.approve:${a.symbol}:${h.label}`, () => token.approve(h.poolAddr, h.mockPreFund));
          await txStep(`mock.prefund.fund:${a.symbol}:${h.label}`, () => h.mockPool.fundPoolForYield(ya[a.symbol].addr, h.mockPreFund));
        }
      }
    }
  }

  // ══ Admin handover (LAST — after this, deployer loses onlyAdmin) ═══════════
  if (ethers.getAddress(ADMIN) !== ethers.getAddress(deployer.address)) {
    console.log("----- Admin handover");
    await txStep("settings.proposeAdmin", () => settings.proposeAdmin(ADMIN));
    console.log(`    ⚠  ${ADMIN} must now call ProTokenSettings.acceptAdmin() from its own key to complete the transfer.`);
  } else {
    console.log("----- Admin handover: SKIPPED (admin == deployer)");
  }

  // ══ Summary ════════════════════════════════════════════════════════════════
  const deployment = {
    network: NETWORK,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    useMocks: cfg.useMocks,
    pendingAdmin: ethers.getAddress(ADMIN) !== ethers.getAddress(deployer.address) ? ADMIN : null,
    addresses: {
      ProTokenSettings: settingsAddr,
      ProTokenOperations: opsAddr,
      ProToken: proTokenAddr,
      ProTokenUnmintHandler: unmintHandlerAddr,
      ProTokenPlusOperations: plusOpsAddr,
      ProTokenPlus: proTokenPlusAddr,
      StrategyVault: strategyVaultAddr,
      OracleAdaptor: oracleAdaptorAddr, // null if every yAsset is static-priced
    },
    yieldRecipient: YIELD_RECIPIENT,
    yAssets: Object.fromEntries(cfg.yAssets.map(a => [a.symbol, {
      token: ya[a.symbol].addr,
      yOperationsHandler: ya[a.symbol].yOpsAddr,
      venues: ya[a.symbol].venueHandlers.map(h => ({
        label: h.label, type: h.type, handler: h.addr, allocationBps: Number(h.allocationBps),
      })),
    }])),
  };
  console.log("\n===== Deployed addresses =====");
  console.log(JSON.stringify(deployment, null, 2));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${NETWORK}.json`);
  fs.writeFileSync(outFile, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`\nSaved deployment to ${outFile}`);
  console.log(`Deploy state at ${statePath(NETWORK)} (delete it or FRESH=1 for a clean redeploy)`);
  console.log("----- Done");
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    console.error("\nDeploy failed — state was saved after every completed step; re-run the same command to resume.");
    process.exit(1);
  });