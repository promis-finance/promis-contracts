/**
 * ============================================================================
 *  Promis post-deploy verification — asserts the WIRING, not the logs
 * ============================================================================
 *  Reads scripts/output/<network>.json (written by deploy.js), attaches to
 *  every contract, and checks the deployed state against the config:
 *  core cross-references, roles, per-yAsset registration, venue routing,
 *  live oracle reads through the adaptor, price config, tiers, vault wiring,
 *  and end-to-end quote sanity via simulateMintProToken.
 *
 *  Read-only by default. SMOKE=1 additionally runs a real mint per yAsset
 *  (impersonated whale + a local authority signer signing the EIP-712 proof) —
 *  fork/localhost only.
 *
 *  Usage:
 *    DEPLOY_CONFIG=ethereumFork npx hardhat run scripts/verify-deploy.js --network localhost
 *    SMOKE=1 DEPLOY_CONFIG=ethereumFork npx hardhat run scripts/verify-deploy.js --network localhost
 *
 *  Exits 1 if any check fails (prints every failure, doesn't stop at the first).
 * ============================================================================
 */
let hre = require("hardhat");
let { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");

const failures = [];
function ok(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); failures.push(msg); }
}
const eq = (a, b) => ethers.getAddress(a) === ethers.getAddress(b);

async function main() {
  const cfg = loadConfig(hre.network.name);
  const outFile = path.join(__dirname, "output", `${cfg._network}.json`);
  if (!fs.existsSync(outFile)) throw new Error(`No deployment file at ${outFile} — run deploy.js first`);
  const dep = JSON.parse(fs.readFileSync(outFile, "utf8"));
  console.log(`===== Verifying ${cfg._network} deployment (${dep.deployedAt}) =====\n`);

  const D = dep.addresses;
  const settings = await ethers.getContractAt("ProTokenSettings", D.ProTokenSettings);
  const ops      = await ethers.getContractAt("ProTokenOperations", D.ProTokenOperations);
  const proToken = await ethers.getContractAt("ProToken", D.ProToken);
  const unmint   = await ethers.getContractAt("ProTokenUnmintHandler", D.ProTokenUnmintHandler);
  const plus     = await ethers.getContractAt("ProTokenPlus", D.ProTokenPlus);
  const vault    = await ethers.getContractAt("StrategyVault", D.StrategyVault);

  // ── Core cross-references ────────────────────────────────────────────────
  console.log("core wiring");
  const info = await settings.getProTokenInfo();
  ok(eq(info.proToken, D.ProToken), "settings.getProTokenInfo().proToken == ProToken");
  ok(eq(info.proTokenOperations, D.ProTokenOperations), "…proTokenOperations == ProTokenOperations");
  ok(eq(info.proTokenUnmintHandler, D.ProTokenUnmintHandler), "…proTokenUnmintHandler == UnmintHandler");
  ok(eq(await settings.getStrategyVault(), D.StrategyVault), "settings.getStrategyVault == StrategyVault");
  ok(eq(await proToken.getMinter(), D.ProTokenOperations), "proToken.getMinter == ProTokenOperations");
  ok(eq(await proToken.getProTokenSettings(), D.ProTokenSettings), "proToken → settings backref");
  ok(eq(await unmint.getProTokenSettings(), D.ProTokenSettings), "unmintHandler → settings backref");
  ok((await unmint.getUnmintBatchDuration()) === BigInt(cfg.unmint.batchDuration),
     `unmint batchDuration == ${cfg.unmint.batchDuration}`);

  // ── Roles ────────────────────────────────────────────────────────────────
  console.log("roles");
  ok(eq(await settings.getOperator(), cfg.roles.operator), "operator");
  ok(eq(await settings.getPriceOperator(), cfg.roles.priceOperator), "priceOperator");
  ok(eq(await settings.getStrategist(), cfg.roles.strategist), "strategist");
  ok(eq(await settings.getBridgeAdmin(), cfg.roles.bridgeAdmin), "bridgeAdmin");
  ok(await settings.isAuthority(cfg.roles.authority), "authority registered");
  if (dep.pendingAdmin) {
    // pendingAdmin has no getter; verifiable fact is that the transfer hasn't
    // completed: current admin is still the deployer until acceptAdmin().
    ok(eq(await settings.getAdmin(), dep.deployer),
       `admin still deployer (handover to ${dep.pendingAdmin} pending acceptAdmin)`);
  } else {
    ok(eq(await settings.getAdmin(), cfg.roles.admin ?? dep.deployer), "admin");
  }

  // ── proUSD price config ──────────────────────────────────────────────────
  console.log("proToken price config");
  const expectedPrice = cfg.proToken.launchPrice ?? ethers.parseUnits("1", 18);
  ok((await proToken.getUSDPrice()) === expectedPrice, `getUSDPrice == ${expectedPrice}`);
  ok((await proToken.getPriceUpdateCooldown()) === BigInt(cfg.proToken.priceUpdateCooldown),
     `priceUpdateCooldown == ${cfg.proToken.priceUpdateCooldown}`);

  // ── proUSD+ ──────────────────────────────────────────────────────────────
  console.log("proUSD+");
  ok(eq(await plus.operationsHandler(), D.ProTokenPlusOperations), "plus.operationsHandler == satellite");
  ok(eq(await plus.proUSD(), D.ProToken), "plus.proUSD == ProToken");
  const tiers = await plus.getTiers([]);
  ok(tiers.length >= cfg.proTokenPlus.tierIds.length, `tiers configured (${tiers.length})`);
  for (let i = 0; i < cfg.proTokenPlus.tierIds.length; i++) {
    const id = cfg.proTokenPlus.tierIds[i];
    const t = tiers.find(x => Number(x.tierId) === id);
    ok(!!t && t.config.name === cfg.proTokenPlus.tiers[i].name
          && t.config.duration === BigInt(cfg.proTokenPlus.tiers[i].duration),
       `tier ${id} "${cfg.proTokenPlus.tiers[i].name}" duration ${cfg.proTokenPlus.tiers[i].duration}`);
  }
  ok(eq(await vault.proTokenPlus(), D.ProTokenPlus), "vault.proTokenPlus == ProTokenPlus");
  ok(eq(await vault.proToken(), D.ProToken), "vault.proToken == ProToken");
  ok(eq(await vault.proTokenOperations(), D.ProTokenOperations), "vault.proTokenOperations == Ops");

  // ── Unmint eligibility ───────────────────────────────────────────────────
  const unmintList = (await settings.getUnmintYAssets()).map(a => ethers.getAddress(a));
  const expectedUnmint = cfg.yAssets.filter(a => a.unmintEligible !== false)
    .map(a => ethers.getAddress(dep.yAssets[a.symbol].token));
  ok(JSON.stringify(unmintList) === JSON.stringify(expectedUnmint),
     `unmintYAssets == [${expectedUnmint.join(", ")}]`);

  // ── Per-yAsset: registration, venues, oracle, quote sanity ──────────────
  for (const a of cfg.yAssets) {
    console.log(`yAsset ${a.symbol}`);
    const depA = dep.yAssets[a.symbol];
    const token = depA.token;
    const yOps = await ethers.getContractAt("YAssetOperationsHandler", depA.yOperationsHandler);
    ok(eq(await yOps.getYAsset(), token), "yOps.getYAsset == token");

    const resp = await settings.getYAssets([token]);
    const S = resp.yAssets[0].settings;
    ok(S.isEnabled && !S.isPaused, "enabled, not paused");
    ok(Number(S.decimals) === a.decimals, `decimals == ${a.decimals}`);
    ok(S.unmintFeePer === a.unmintFeePer, `unmintFeePer == ${a.unmintFeePer}`);
    ok(eq(S.yOperationsHandler, depA.yOperationsHandler), "settings → yOps handler");
    ok(S.priceSettings.usdCap === a.price.usdCap, `usdCap == ${a.price.usdCap}`);
    const usingOracle = a.price.staticPriceSource === 0n;
    ok(S.priceSettings.staticPriceSource === a.price.staticPriceSource,
       usingOracle ? "oracle path (static == 0)" : `static price ${a.price.staticPriceSource}`);
    if (usingOracle) {
      ok(S.priceSettings.oraclePriceSources.length >= 1
           && eq(S.priceSettings.oraclePriceSources[0], D.OracleAdaptor),
         "oraclePriceSources[0] == shared adaptor");
      const adaptor = await ethers.getContractAt("OracleChainlinkPushAdaptor", D.OracleAdaptor);
      // LIVE feed read through the whole adaptor path (zero/staleness/decimals).
      const p = await adaptor.getOraclePriceForAsset(token);
      ok(p > ethers.parseUnits("0.90", 18) && p < ethers.parseUnits("1.10", 18),
         `live feed read: $${ethers.formatUnits(p, 18)} (sane for a stablecoin)`);
    }

    // Venue routing matches the deployment record (order: aave entries then morpho).
    const handlers = await yOps.getYProtocolHandlers();
    ok(handlers.length === depA.venues.length, `${handlers.length} venue handler(s) registered`);
    for (let i = 0; i < depA.venues.length; i++) {
      const v = depA.venues[i];
      ok(eq(handlers[i].handlerContract, v.handler) &&
           handlers[i].allocationPercentage === BigInt(v.allocationBps),
         `venue[${i}] ${v.label}: ${v.allocationBps} bps @ ${v.handler}`);
      const h = await ethers.getContractAt(
        v.type === "aave" ? "AaveV3YieldHandler" : "MorphoYieldHandler", v.handler);
      ok(eq(await h.getYieldAsset(), token), `venue[${i}] getYieldAsset == token`);
      if (v.type === "aave") {
        const venueCfg = a.venues.aave.find(x => x.label === v.label);
        ok((await h.impairmentToleranceBps()) === BigInt(venueCfg.impairmentToleranceBps ?? 0),
           `venue[${i}] impairment tolerance == ${venueCfg.impairmentToleranceBps ?? 0}`);
        ok(await h.acceptsAllocation(), `venue[${i}] acceptsAllocation() (reserve healthy within tolerance)`);
      } else {
        const venueCfg = a.venues.morpho.find(x => x.label === v.label);
        if (venueCfg.marketId) {
          const mp = await h.getMorphoMarketParams();
          const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
            ["address","address","address","address","uint256"],
            [mp.loanToken, mp.collateralToken, mp.oracle, mp.irm, mp.lltv]));
          ok(id === venueCfg.marketId, `venue[${i}] market params hash back to ${venueCfg.marketId.slice(0,10)}…`);
        }
      }
    }

    // End-to-end quote through registry + oracle + clamp + proUSD price.
    const oneK = 1000n * 10n ** BigInt(a.decimals);
    const quote = await ops.simulateMintProToken(token, oneK);
    const lo = ethers.parseUnits("950", 18), hi = ethers.parseUnits("1050", 18);
    ok(quote > lo && quote < hi,
       `simulateMintProToken(1000 ${a.symbol}) = ${ethers.formatUnits(quote, 18)} proUSD (±5%)`);
  }

  // ── SMOKE: real mint per yAsset (fork/localhost only) ────────────────────
  if (process.env.SMOKE === "1") {
    console.log("SMOKE mint drill");
    const whales = cfg.rehearsal?.whales ?? {};
    const signers = await ethers.getSigners();
    let authority = null;
    for (const s of signers) if (await settings.isAuthority(s.address)) { authority = s; break; }
    ok(!!authority, "a local signer is a registered authority (needed to sign proofs)");
    const user = signers[10];
    const chainId = Number((await ethers.provider.getNetwork()).chainId);
    const domain = { name: "ProTokenOperations", version: "1", chainId, verifyingContract: D.ProTokenOperations };
    const MINT_TYPES = { MintProof: [
      { name: "requestId", type: "uint256" }, { name: "user", type: "address" },
      { name: "receiver", type: "address" }, { name: "yAsset", type: "address" },
      { name: "amount", type: "uint256" }, { name: "minAmountOut", type: "uint256" },
      { name: "deadline", type: "uint256" }, { name: "proofKind", type: "uint8" },
    ]};
    for (const a of cfg.yAssets) {
      const whaleAddr = whales[a.symbol];
      if (!authority || !whaleAddr) { console.log(`  · ${a.symbol}: skipped (no whale/authority)`); continue; }
      const token = dep.yAssets[a.symbol].token;
      const erc20 = await ethers.getContractAt("IERC20", token);
      await network.provider.request({ method: "hardhat_impersonateAccount", params: [whaleAddr] });
      await network.provider.request({ method: "hardhat_setBalance", params: [whaleAddr, "0x21E19E0C9BAB2400000"] });
      const whale = await ethers.getSigner(whaleAddr);
      const amount = 10000n * 10n ** BigInt(a.decimals);
      await (await erc20.connect(whale).transfer(user.address, amount)).wait();
      await (await erc20.connect(user).approve(D.ProTokenOperations, amount)).wait();
      const minOut = (await ops.simulateMintProToken(token, amount)) * 99n / 100n;
      const rc = await (await ops.connect(user).createMintRequest(token, amount, minOut, user.address)).wait();
      const ev = rc.logs.map(l => { try { return ops.interface.parseLog(l); } catch { return null; } })
        .find(e => e && e.name === "MintRequestCreated");
      const requestId = ev.args.requestID ?? ev.args[0];
      const deadline = BigInt((await ethers.provider.getBlock("latest")).timestamp + 3600);
      const proof = await authority.signTypedData(domain, MINT_TYPES, {
        requestId, user: user.address, receiver: user.address, yAsset: token,
        amount, minAmountOut: minOut, deadline, proofKind: 0,
      });
      const before = await proToken.balanceOf(user.address);
      await (await ops.connect(user).finalizeMintRequest(requestId, 0, deadline, proof)).wait();
      const minted = (await proToken.balanceOf(user.address)) - before;
      ok(minted >= minOut, `${a.symbol}: minted ${ethers.formatUnits(minted, 18)} proUSD against live venues`);
    }
  }

  // ── Result ────────────────────────────────────────────────────────────────
  console.log(failures.length === 0
    ? "\n===== ALL CHECKS PASSED ====="
    : `\n===== ${failures.length} CHECK(S) FAILED =====`);
  if (failures.length) { failures.forEach(f => console.log("  ✗ " + f)); process.exit(1); }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });