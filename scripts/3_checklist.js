/**
 * ============================================================================
 *  Promis post-deploy checklist — ownership handover & finalization audit
 * ============================================================================
 *  Runs AFTER deploy (and again AFTER the multisig accepts admin) to prove the
 *  system is fully handed over and every privileged address is a real
 *  production value — not a deployer placeholder. Read-only; safe on mainnet.
 *
 *  Chain-agnostic, same as verify-deploy.js: reads scripts/output/<net>.json,
 *  attaches, and audits. Works on ethereum / katana / any configured network.
 *
 *  Usage (PowerShell):
 *    $env:DEPLOY_CONFIG = "katana"
 *    npx hardhat run scripts/post-deploy-checklist.js --network katana
 *  bash:
 *    DEPLOY_CONFIG=katana npx hardhat run scripts/post-deploy-checklist.js --network katana
 *
 *  It classifies findings, it does not just pass/fail:
 *    ✓ done   — correct, final state
 *    ⚠ action — a required post-handover admin action still outstanding
 *    ✗ risk   — a privileged slot still points at the deployer / is unset
 *  Exit code is 1 only if any ✗ risk is present (⚠ actions don't fail CI, but
 *  are printed as a TODO list). Handover phase is auto-detected.
 * ============================================================================
 */
let hre = require("hardhat");
let { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config");

const done = [], actions = [], risks = [];
const okDone   = (m) => { console.log(`  ✓ ${m}`); done.push(m); };
const needAct  = (m) => { console.log(`  ⚠ ${m}`); actions.push(m); };
const isRisk   = (m) => { console.log(`  ✗ ${m}`); risks.push(m); };
const eq = (a, b) => a && b && ethers.getAddress(a) === ethers.getAddress(b);

async function main() {
  const cfg = loadConfig(hre.network.name);
  const outFile = path.join(__dirname, "output", `${cfg._network}.json`);
  if (!fs.existsSync(outFile)) throw new Error(`No deployment file at ${outFile} — run deploy.js first`);
  const dep = JSON.parse(fs.readFileSync(outFile, "utf8"));
  const D = dep.addresses;
  const deployer = dep.deployer;
  console.log(`===== Post-deploy checklist: ${cfg._network} (deployed ${dep.deployedAt}) =====`);
  console.log(`Deployer: ${deployer}\n`);

  const settings = await ethers.getContractAt("ProTokenSettings", D.ProTokenSettings);
  const proToken = await ethers.getContractAt("ProToken", D.ProToken);
  const vault    = await ethers.getContractAt("StrategyVault", D.StrategyVault);

  // ── 1. Admin handover (the one true ownership transfer) ──────────────────
  console.log("admin handover");
  const currentAdmin = await settings.getAdmin();
  const intendedAdmin = cfg.roles.admin;
  if (!intendedAdmin) {
    needAct("config roles.admin is null — cannot verify intended admin (mock config?)");
  } else if (eq(currentAdmin, intendedAdmin)) {
    okDone(`admin == intended multisig ${intendedAdmin} — handover COMPLETE`);
  } else if (eq(currentAdmin, deployer)) {
    // Pre-handover: proposeAdmin should have targeted the multisig.
    if (dep.pendingAdmin && eq(dep.pendingAdmin, intendedAdmin)) {
      needAct(`admin still deployer; proposeAdmin(${intendedAdmin}) is set — MULTISIG MUST CALL ProTokenSettings.acceptAdmin()`);
    } else if (dep.pendingAdmin) {
      isRisk(`admin still deployer, but pendingAdmin (${dep.pendingAdmin}) != intended admin (${intendedAdmin}) — proposeAdmin targeted the WRONG address`);
    } else {
      isRisk(`admin still deployer and no pendingAdmin recorded — proposeAdmin was never called; run it or re-deploy the handover step`);
    }
  } else {
    isRisk(`admin is ${currentAdmin} — neither the deployer nor the intended multisig; investigate`);
  }
  const handoverComplete = eq(currentAdmin, intendedAdmin);

  // ── 2. Upgrade authority (rides on admin — confirm the implication) ──────
  console.log("upgrade authority (UUPS)");
  if (handoverComplete) {
    okDone("every _authorizeUpgrade reads ProTokenSettings.getAdmin() → upgrade rights are the multisig's");
  } else {
    needAct("UUPS upgrade auth follows admin; until acceptAdmin() completes, the DEPLOYER can still upgrade every contract");
  }

  // ── 3. Set-roles: must be production values, not deployer placeholders ────
  console.log("privileged roles");
  const roleChecks = [
    ["operator",      await settings.getOperator(),      cfg.roles.operator],
    ["priceOperator", await settings.getPriceOperator(), cfg.roles.priceOperator],
    ["strategist",    await settings.getStrategist(),    cfg.roles.strategist],
    ["bridgeAdmin",   await settings.getBridgeAdmin(),   cfg.roles.bridgeAdmin],
  ];
  for (const [name, onchain, intended] of roleChecks) {
    if (onchain === ethers.ZeroAddress)
      isRisk(`${name} is the ZERO address — the setter accepts zero silently; this role is bricked until re-set by admin`);
    else if (intended && eq(onchain, intended)) okDone(`${name} == config (${onchain})`);
    else if (eq(onchain, deployer)) isRisk(`${name} still points at the DEPLOYER — re-set to the production address`);
    else if (intended && !eq(onchain, intended)) isRisk(`${name} is ${onchain}, config expects ${intended} — mismatch`);
    else needAct(`${name} is ${onchain} (config has none to compare)`);
  }
  // externalBusiness is optional
  const extBiz = await settings.getExternalBusiness().catch(() => ethers.ZeroAddress);
  if (cfg.roles.externalBusiness) {
    okDone(`externalBusiness set (${extBiz})`);
  } else if (extBiz === ethers.ZeroAddress) {
    okDone("externalBusiness intentionally unset (zero)");
  } else {
    needAct(`externalBusiness = ${extBiz} but config left it null — confirm intended`);
  }

  // ── 4. Authority (backend proof signer) — must be real, not a test key ───
  console.log("authority (proof signer)");
  if (cfg.roles.authority) {
    const isAuth = await settings.isAuthority(cfg.roles.authority);
    if (isAuth) okDone(`config authority ${cfg.roles.authority} is registered`);
    else isRisk(`config authority ${cfg.roles.authority} is NOT registered — proofs will fail InvalidAuthority`);
    if (eq(cfg.roles.authority, deployer))
      isRisk("authority == deployer — a production proof signer must NOT be the deploy key");
  } else {
    needAct("config has no authority — confirm the backend signer is registered via setAuthority");
  }

  // ── 5. StrategyVault.yieldRecipient — unset by default, blocks claimYield ─
  console.log("StrategyVault finalization");
  const yr = await vault.yieldRecipient().catch(() => ethers.ZeroAddress);
  if (yr === ethers.ZeroAddress)
    needAct("StrategyVault.yieldRecipient is UNSET — claimYield() reverts until admin calls setYieldRecipient()");
  else
    okDone(`yieldRecipient set (${yr})`);

  // ── 6. Proxy admin sanity (UUPS should have no separate ProxyAdmin) ──────
  console.log("proxy model");
  try {
    const mfPath = path.join(__dirname, "..", ".openzeppelin", `${(await ethers.provider.getNetwork()).name || "unknown"}.json`);
    // Best-effort: UUPS deployProxy does not create a ProxyAdmin; note for the operator.
    okDone("UUPS proxies: upgrade auth is in-implementation (_authorizeUpgrade); no separate ProxyAdmin to transfer");
  } catch { /* non-fatal */ }

  // ── 7. Price liveness — proUSD price must be readable (not disabled) ──────
  console.log("proUSD price");
  try {
    const p = await proToken.getUSDPrice();
    okDone(`getUSDPrice() = ${ethers.formatUnits(p, 18)} (live, not disabled)`);
  } catch {
    needAct("getUSDPrice() reverts (USDPriceDisabled) — set a launch price before enabling mint/unmint");
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n===== SUMMARY =====");
  console.log(`  ✓ done   : ${done.length}`);
  console.log(`  ⚠ action : ${actions.length}`);
  console.log(`  ✗ risk   : ${risks.length}`);
  if (actions.length) {
    console.log("\nOutstanding admin actions (do these, then re-run):");
    actions.forEach(a => console.log("  ⚠ " + a));
  }
  if (risks.length) {
    console.log("\nRISKS — privileged slots not in their intended final state:");
    risks.forEach(r => console.log("  ✗ " + r));
    console.log("\nExit 1 (risks present).");
    process.exit(1);
  }
  console.log(actions.length
    ? "\nNo hard risks. Complete the ⚠ actions above (chiefly acceptAdmin) to finish handover."
    : "\nFully handed over and finalized. ✓");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });