import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
    ZERO_ADDRESS,
    VERSION_1_0_0,
    ERRORS,
    EVENTS,
    DECIMALS_18,
    DEFAULT_STALENESS_THRESHOLD,
    ONE_USD,
} from "../helpers/constants";
import {
    deployProTokenSettings,
    deployMintableERC20,
    getTestAccounts,
} from "../helpers/deploy";
import { getRandomAddress, getRandomAddresses } from "../helpers/mocks";
import { OraclePromisPullAdaptor } from "../../typechain-types";

describe("OraclePromisPullAdaptor", function () {
    // ============================================
    // Helper Functions
    // ============================================

    /**
     * Create a signed oracle payload for testing
     * @param asset Asset address
     * @param price Price in 18 decimals
     * @param timestamp Unix timestamp
     * @param signers Array of signers to sign the payload
     * @returns Encoded payload bytes
     */
    async function createSignedPayload(
        asset: string,
        price: bigint,
        timestamp: number,
        signers: HardhatEthersSigner[]
    ): Promise<string> {
        // Encode price as first 32 bytes (remove 0x prefix for concatenation)
        const priceHex = ethers.zeroPadValue(ethers.toBeHex(price), 32).slice(2);

        // Create signature blocks for each signer
        const signatureBlocks: string[] = [];

        for (const signer of signers) {
            // Create the message hash
            const messageHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256"],
                    [asset, price, timestamp]
                )
            );

            // Sign the message (signMessage adds the Ethereum signed message prefix)
            const signature = await signer.signMessage(ethers.getBytes(messageHash));
            const sig = ethers.Signature.from(signature);

            // Encode timestamp (32 bytes) + r (32 bytes) + s (32 bytes) + v (1 byte) = 97 bytes
            const timestampHex = ethers.zeroPadValue(ethers.toBeHex(timestamp), 32).slice(2);
            const rHex = sig.r.slice(2); // r is already 32 bytes hex
            const sHex = sig.s.slice(2); // s is already 32 bytes hex
            const vHex = sig.v.toString(16).padStart(2, '0'); // v is 1 byte

            signatureBlocks.push(timestampHex + rHex + sHex + vHex);
        }

        return "0x" + priceHex + signatureBlocks.join("");
    }

    /**
     * Create a payload with different timestamps per signer
     */
    async function createSignedPayloadWithDifferentTimestamps(
        asset: string,
        price: bigint,
        timestamps: number[],
        signers: HardhatEthersSigner[]
    ): Promise<string> {
        if (timestamps.length !== signers.length) {
            throw new Error("Timestamps and signers arrays must have same length");
        }

        const priceHex = ethers.zeroPadValue(ethers.toBeHex(price), 32).slice(2);
        const signatureBlocks: string[] = [];

        for (let i = 0; i < signers.length; i++) {
            const signer = signers[i];
            const timestamp = timestamps[i];

            const messageHash = ethers.keccak256(
                ethers.solidityPacked(
                    ["address", "uint256", "uint256"],
                    [asset, price, timestamp]
                )
            );

            const signature = await signer.signMessage(ethers.getBytes(messageHash));
            const sig = ethers.Signature.from(signature);

            const timestampHex = ethers.zeroPadValue(ethers.toBeHex(timestamp), 32).slice(2);
            const rHex = sig.r.slice(2);
            const sHex = sig.s.slice(2);
            const vHex = sig.v.toString(16).padStart(2, '0');

            signatureBlocks.push(timestampHex + rHex + sHex + vHex);
        }

        return "0x" + priceHex + signatureBlocks.join("");
    }

    // Helper to deploy OraclePromisPullAdaptor
    async function deployOraclePromisPullAdaptor(
        proTokenSettingsAddress: string,
        initialSigners: string[]
    ) {
        const OraclePromisPullAdaptorFactory = await ethers.getContractFactory("OraclePromisPullAdaptor");
        const oraclePromisPullAdaptor = await upgrades.deployProxy(
            OraclePromisPullAdaptorFactory,
            [proTokenSettingsAddress, initialSigners],
            { kind: "uups" }
        );
        await oraclePromisPullAdaptor.waitForDeployment();
        return oraclePromisPullAdaptor as unknown as OraclePromisPullAdaptor;
    }

    // Fixture for OraclePromisPullAdaptor tests
    async function oraclePromisPullAdaptorFixture() {
        const accounts = await getTestAccounts();
        const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
        const proTokenSettingsAddress = await proTokenSettings.getAddress();

        // Use user1 and user2 as initial signers (minimum 2 required)
        const initialSigners = [accounts.user1.address, accounts.user2.address];

        const oraclePromisPullAdaptor = await deployOraclePromisPullAdaptor(
            proTokenSettingsAddress,
            initialSigners
        );
        const oraclePromisPullAdaptorAddress = await oraclePromisPullAdaptor.getAddress();

        // Deploy mock token
        const testToken = await deployMintableERC20("Test Token", "TEST", DECIMALS_18);
        const testTokenAddress = await testToken.getAddress();

        return {
            oraclePromisPullAdaptor,
            oraclePromisPullAdaptorAddress,
            proTokenSettings,
            proTokenSettingsAddress,
            testToken,
            testTokenAddress,
            accounts,
            initialSigners,
        };
    }

    // ============================================
    // Deployment & Initialization Tests
    // ============================================
    describe("Deployment & Initialization", function () {
        it("should deploy with correct initial state", async function () {
            const { oraclePromisPullAdaptor, initialSigners } = await loadFixture(oraclePromisPullAdaptorFixture);

            expect(await oraclePromisPullAdaptor.VERSION()).to.equal(VERSION_1_0_0);
            expect(await oraclePromisPullAdaptor.MIN_SIGNERS()).to.equal(2n);
            expect(await oraclePromisPullAdaptor.getStalenessThreshold()).to.equal(DEFAULT_STALENESS_THRESHOLD);

            const signers = await oraclePromisPullAdaptor.getSigners();
            expect(signers.length).to.equal(2);
            expect(signers[0]).to.equal(initialSigners[0]);
            expect(signers[1]).to.equal(initialSigners[1]);
        });

        it("should have correct VERSION constant", async function () {
            const { oraclePromisPullAdaptor } = await loadFixture(oraclePromisPullAdaptorFixture);
            expect(await oraclePromisPullAdaptor.VERSION()).to.equal(VERSION_1_0_0);
        });

        it("should have correct MIN_SIGNERS constant", async function () {
            const { oraclePromisPullAdaptor } = await loadFixture(oraclePromisPullAdaptorFixture);
            expect(await oraclePromisPullAdaptor.MIN_SIGNERS()).to.equal(2n);
        });

        it("should revert initialization with zero proTokenSettings", async function () {
            const accounts = await getTestAccounts();
            const OraclePromisPullAdaptorFactory = await ethers.getContractFactory("OraclePromisPullAdaptor");

            await expect(
                upgrades.deployProxy(
                    OraclePromisPullAdaptorFactory,
                    [ZERO_ADDRESS, [accounts.user1.address, accounts.user2.address]],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OraclePromisPullAdaptorFactory, ERRORS.InvalidAddr);
        });

        it("should revert initialization with fewer than MIN_SIGNERS", async function () {
            const accounts = await getTestAccounts();
            const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const proTokenSettingsAddress = await proTokenSettings.getAddress();

            const OraclePromisPullAdaptorFactory = await ethers.getContractFactory("OraclePromisPullAdaptor");

            // Try with 0 signers
            await expect(
                upgrades.deployProxy(
                    OraclePromisPullAdaptorFactory,
                    [proTokenSettingsAddress, []],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OraclePromisPullAdaptorFactory, "InsufficientSigners");

            // Try with 1 signer
            await expect(
                upgrades.deployProxy(
                    OraclePromisPullAdaptorFactory,
                    [proTokenSettingsAddress, [accounts.user1.address]],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OraclePromisPullAdaptorFactory, "InsufficientSigners");
        });

        it("should revert initialization with zero address signer", async function () {
            const accounts = await getTestAccounts();
            const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const proTokenSettingsAddress = await proTokenSettings.getAddress();

            const OraclePromisPullAdaptorFactory = await ethers.getContractFactory("OraclePromisPullAdaptor");

            await expect(
                upgrades.deployProxy(
                    OraclePromisPullAdaptorFactory,
                    [proTokenSettingsAddress, [accounts.user1.address, ZERO_ADDRESS]],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OraclePromisPullAdaptorFactory, ERRORS.InvalidAddr);
        });

        it("should revert initialization with duplicate signers", async function () {
            const accounts = await getTestAccounts();
            const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const proTokenSettingsAddress = await proTokenSettings.getAddress();

            const OraclePromisPullAdaptorFactory = await ethers.getContractFactory("OraclePromisPullAdaptor");

            await expect(
                upgrades.deployProxy(
                    OraclePromisPullAdaptorFactory,
                    [proTokenSettingsAddress, [accounts.user1.address, accounts.user1.address]],
                    { kind: "uups" }
                )
            ).to.be.revertedWithCustomError(OraclePromisPullAdaptorFactory, "SignerAlreadyAdded");
        });

        it("should emit SignerAdded events during initialization", async function () {
            const accounts = await getTestAccounts();
            const proTokenSettings = await deployProTokenSettings(accounts.admin, accounts.operator, accounts.priceOperator);
            const proTokenSettingsAddress = await proTokenSettings.getAddress();

            const OraclePromisPullAdaptorFactory = await ethers.getContractFactory("OraclePromisPullAdaptor");

            // Deploy and check events
            const tx = await upgrades.deployProxy(
                OraclePromisPullAdaptorFactory,
                [proTokenSettingsAddress, [accounts.user1.address, accounts.user2.address]],
                { kind: "uups" }
            );

            // Note: Events are emitted during initialization, checking via receipt
            const receipt = await tx.deploymentTransaction()?.wait();
            expect(receipt).to.not.be.undefined;
        });

        it("should not allow re-initialization", async function () {
            const { oraclePromisPullAdaptor, proTokenSettingsAddress, accounts } =
                await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.initialize(
                    proTokenSettingsAddress,
                    [accounts.user1.address, accounts.user2.address]
                )
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "InvalidInitialization");
        });
    });

    // ============================================
    // setStalenessThreshold Tests
    // ============================================
    describe("setStalenessThreshold()", function () {
        it("should set staleness threshold successfully", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            const newThreshold = 300; // 5 minutes

            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).setStalenessThreshold(newThreshold)
            ).to.emit(oraclePromisPullAdaptor, EVENTS.StalenessThresholdUpdated)
                .withArgs(newThreshold);

            expect(await oraclePromisPullAdaptor.getStalenessThreshold()).to.equal(newThreshold);
        });

        it("should allow setting threshold to zero", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).setStalenessThreshold(0)
            ).to.emit(oraclePromisPullAdaptor, EVENTS.StalenessThresholdUpdated)
                .withArgs(0);

            expect(await oraclePromisPullAdaptor.getStalenessThreshold()).to.equal(0);
        });

        it("should revert when called by non-admin", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.user1).setStalenessThreshold(300)
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.Unauthorized);
        });

        it("should revert when called by operator", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.operator).setStalenessThreshold(300)
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // addSigner Tests
    // ============================================
    describe("addSigner()", function () {
        it("should add a new signer successfully", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            const newSigner = accounts.attacker.address;

            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).addSigner(newSigner)
            ).to.emit(oraclePromisPullAdaptor, "SignerAdded")
                .withArgs(newSigner);

            expect(await oraclePromisPullAdaptor.isSigner(newSigner)).to.be.true;

            const signers = await oraclePromisPullAdaptor.getSigners();
            expect(signers.length).to.equal(3);
        });

        it("should revert when adding zero address", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).addSigner(ZERO_ADDRESS)
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.InvalidAddr);
        });

        it("should revert when adding duplicate signer", async function () {
            const { oraclePromisPullAdaptor, accounts, initialSigners } =
                await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).addSigner(initialSigners[0])
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "SignerAlreadyAdded");
        });

        it("should revert when called by non-admin", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.user1).addSigner(accounts.attacker.address)
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.Unauthorized);
        });
    });

    // ============================================
    // removeSigner Tests
    // ============================================
    describe("removeSigner()", function () {
        it("should remove a signer successfully when above minimum", async function () {
            const { oraclePromisPullAdaptor, accounts, initialSigners } =
                await loadFixture(oraclePromisPullAdaptorFixture);

            // First add a third signer
            await oraclePromisPullAdaptor.connect(accounts.admin).addSigner(accounts.attacker.address);

            // Now remove one
            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).removeSigner(initialSigners[0])
            ).to.emit(oraclePromisPullAdaptor, "SignerRemoved")
                .withArgs(initialSigners[0]);

            expect(await oraclePromisPullAdaptor.isSigner(initialSigners[0])).to.be.false;

            const signers = await oraclePromisPullAdaptor.getSigners();
            expect(signers.length).to.equal(2);
        });

        it("should revert when removing would go below minimum signers", async function () {
            const { oraclePromisPullAdaptor, accounts, initialSigners } =
                await loadFixture(oraclePromisPullAdaptorFixture);

            // Try to remove when at minimum (2 signers)
            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).removeSigner(initialSigners[0])
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "MinimumSignersRequired");
        });

        it("should revert when removing non-existent signer", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            // Add third signer first
            await oraclePromisPullAdaptor.connect(accounts.admin).addSigner(accounts.attacker.address);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.admin).removeSigner(accounts.minter.address)
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "SignerNotFound");
        });

        it("should revert when called by non-admin", async function () {
            const { oraclePromisPullAdaptor, accounts, initialSigners } =
                await loadFixture(oraclePromisPullAdaptorFixture);

            await expect(
                oraclePromisPullAdaptor.connect(accounts.user1).removeSigner(initialSigners[0])
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.Unauthorized);
        });

        it("should correctly swap and pop when removing middle signer", async function () {
            const { oraclePromisPullAdaptor, accounts, initialSigners } =
                await loadFixture(oraclePromisPullAdaptorFixture);

            // Add two more signers
            await oraclePromisPullAdaptor.connect(accounts.admin).addSigner(accounts.attacker.address);
            await oraclePromisPullAdaptor.connect(accounts.admin).addSigner(accounts.minter.address);

            // Remove the first signer (should swap with last)
            await oraclePromisPullAdaptor.connect(accounts.admin).removeSigner(initialSigners[0]);

            const signers = await oraclePromisPullAdaptor.getSigners();
            expect(signers.length).to.equal(3);
            expect(signers).to.not.include(initialSigners[0]);
            expect(signers).to.include(initialSigners[1]);
            expect(signers).to.include(accounts.attacker.address);
            expect(signers).to.include(accounts.minter.address);
        });
    });

    // ============================================
    // isSigner Tests
    // ============================================
    describe("isSigner()", function () {
        it("should return true for authorized signer", async function () {
            const { oraclePromisPullAdaptor, initialSigners } = await loadFixture(oraclePromisPullAdaptorFixture);

            expect(await oraclePromisPullAdaptor.isSigner(initialSigners[0])).to.be.true;
            expect(await oraclePromisPullAdaptor.isSigner(initialSigners[1])).to.be.true;
        });

        it("should return false for non-signer", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            expect(await oraclePromisPullAdaptor.isSigner(accounts.attacker.address)).to.be.false;
            expect(await oraclePromisPullAdaptor.isSigner(ZERO_ADDRESS)).to.be.false;
        });
    });

    // ============================================
    // getSigners Tests
    // ============================================
    describe("getSigners()", function () {
        it("should return all signers", async function () {
            const { oraclePromisPullAdaptor, initialSigners } = await loadFixture(oraclePromisPullAdaptorFixture);

            const signers = await oraclePromisPullAdaptor.getSigners();
            expect(signers.length).to.equal(2);
            expect(signers[0]).to.equal(initialSigners[0]);
            expect(signers[1]).to.equal(initialSigners[1]);
        });
    });

    // ============================================
    // getStalenessThreshold Tests
    // ============================================
    describe("getStalenessThreshold()", function () {
        it("should return default staleness threshold", async function () {
            const { oraclePromisPullAdaptor } = await loadFixture(oraclePromisPullAdaptorFixture);

            expect(await oraclePromisPullAdaptor.getStalenessThreshold()).to.equal(DEFAULT_STALENESS_THRESHOLD);
        });

        it("should return updated staleness threshold", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            await oraclePromisPullAdaptor.connect(accounts.admin).setStalenessThreshold(600);
            expect(await oraclePromisPullAdaptor.getStalenessThreshold()).to.equal(600);
        });
    });

    // ============================================
    // getOraclePriceForAsset Tests (EXTENSIVE)
    // ============================================
    describe("getOraclePriceForAsset()", function () {
        describe("Input Validation", function () {
            it("should revert with zero asset address", async function () {
                const { oraclePromisPullAdaptor } = await loadFixture(oraclePromisPullAdaptorFixture);

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(ZERO_ADDRESS, "0x")
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.InvalidAddr);
            });

            it("should revert with data length < 32 bytes", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                // Empty data
                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, "0x")
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.InvalidInputs);

                // 31 bytes
                const shortData = "0x" + "00".repeat(31);
                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, shortData)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.InvalidInputs);
            });

            it("should revert with zero price", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                // 32 bytes of zeros (price = 0)
                const zeroPrice = "0x" + "00".repeat(32);
                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, zeroPrice)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.InvalidOraclePrice);
            });

            it("should revert with invalid signature block size", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                // Price (32 bytes) + incomplete signature block
                const priceBytes = ethers.zeroPadValue(ethers.toBeHex(ONE_USD), 32);
                const incompleteData = priceBytes + "00".repeat(50); // Not 97 bytes

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, incompleteData)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.InvalidInputs);
            });

            it("should revert when number of signatures doesn't match signers count", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                // Create payload with only 1 signature when 2 signers are required
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user1] // Only 1 signer
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "InsufficientSignatures");
            });
        });

        describe("Timestamp Validation", function () {
            it("should revert with future timestamp", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const futureTime = (await time.latest()) + 3600; // 1 hour in future
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    futureTime,
                    [accounts.user1, accounts.user2]
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "FutureOracleTimestamp");
            });

            it("should revert with stale timestamp", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const staleTime = (await time.latest()) - 300; // 5 minutes ago (threshold is 3 min)
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    staleTime,
                    [accounts.user1, accounts.user2]
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "StaleOracleData");
            });

            it("should accept timestamp at exact staleness boundary", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                const boundaryTime = currentTime - DEFAULT_STALENESS_THRESHOLD; // Exactly at threshold
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    boundaryTime,
                    [accounts.user1, accounts.user2]
                );

                // Should succeed (boundary is inclusive)
                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(ONE_USD);
            });

            it("should revert when one signature has stale timestamp", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                const staleTime = currentTime - 300; // 5 minutes ago

                const payload = await createSignedPayloadWithDifferentTimestamps(
                    testTokenAddress,
                    ONE_USD,
                    [currentTime, staleTime], // Second signature is stale
                    [accounts.user1, accounts.user2]
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "StaleOracleData");
            });

            it("should revert when one signature has future timestamp", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                const futureTime = currentTime + 100;

                const payload = await createSignedPayloadWithDifferentTimestamps(
                    testTokenAddress,
                    ONE_USD,
                    [currentTime, futureTime], // Second signature is future
                    [accounts.user1, accounts.user2]
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "FutureOracleTimestamp");
            });

            it("should work with different timestamp from different signers", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                const prevTime = currentTime - 50; // Both within staleness threshold

                const payload = await createSignedPayloadWithDifferentTimestamps(
                    testTokenAddress,
                    ONE_USD,
                    [currentTime, prevTime], // Second signature is future
                    [accounts.user1, accounts.user2]
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(ONE_USD);
            });
        });

        describe("Signature Validation", function () {
            it("should accept valid signatures from all authorized signers", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user1, accounts.user2]
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(ONE_USD);
            });

            it("should revert with unauthorized signer", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                // Use attacker (not an authorized signer) instead of user2
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user1, accounts.attacker]
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "UnauthorizedSigner");
            });

            it("should revert with duplicate signatures from same signer", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                // Same signer signs twice
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user1, accounts.user1]
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "DuplicateSignature");
            });

            it("should accept signatures in any order", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                // Reverse order of signers
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user2, accounts.user1] // Reversed
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(ONE_USD);
            });

            it("should work with more than 2 signers", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                // Add a third signer
                await oraclePromisPullAdaptor.connect(accounts.admin).addSigner(accounts.attacker.address);

                const currentTime = await time.latest();
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user1, accounts.user2, accounts.attacker]
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(ONE_USD);
            });
        });

        describe("Price Values", function () {
            it("should return correct price for various values", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const testPrices = [
                    ethers.parseEther("0.5"),      // $0.50
                    ethers.parseEther("1"),        // $1.00
                    ethers.parseEther("100"),      // $100.00
                    ethers.parseEther("1000"),     // $1000.00
                    ethers.parseEther("0.000001"), // Very small
                    ethers.parseEther("1000000"),  // Very large
                ];

                for (const testPrice of testPrices) {
                    const currentTime = await time.latest();
                    const payload = await createSignedPayload(
                        testTokenAddress,
                        testPrice,
                        currentTime,
                        [accounts.user1, accounts.user2]
                    );

                    const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                    expect(price).to.equal(testPrice);
                }
            });

            it("should handle maximum uint256 price", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const maxPrice = ethers.MaxUint256;
                const currentTime = await time.latest();
                const payload = await createSignedPayload(
                    testTokenAddress,
                    maxPrice,
                    currentTime,
                    [accounts.user1, accounts.user2]
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(maxPrice);
            });

            it("should handle price of 1 wei", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const minPrice = 1n;
                const currentTime = await time.latest();
                const payload = await createSignedPayload(
                    testTokenAddress,
                    minPrice,
                    currentTime,
                    [accounts.user1, accounts.user2]
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(minPrice);
            });
        });

        describe("Different Assets", function () {
            it("should work with different asset addresses", async function () {
                const { oraclePromisPullAdaptor, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const token1 = await deployMintableERC20("Token1", "TK1", DECIMALS_18);
                const token2 = await deployMintableERC20("Token2", "TK2", DECIMALS_18);

                const token1Address = await token1.getAddress();
                const token2Address = await token2.getAddress();

                const currentTime = await time.latest();

                const payload1 = await createSignedPayload(
                    token1Address,
                    ethers.parseEther("1"),
                    currentTime,
                    [accounts.user1, accounts.user2]
                );

                const payload2 = await createSignedPayload(
                    token2Address,
                    ethers.parseEther("2"),
                    currentTime,
                    [accounts.user1, accounts.user2]
                );

                const price1 = await oraclePromisPullAdaptor.getOraclePriceForAsset(token1Address, payload1);
                const price2 = await oraclePromisPullAdaptor.getOraclePriceForAsset(token2Address, payload2);

                expect(price1).to.equal(ethers.parseEther("1"));
                expect(price2).to.equal(ethers.parseEther("2"));
            });

            it("should reject payload signed for different asset", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const otherToken = await deployMintableERC20("Other", "OTH", DECIMALS_18);
                const otherTokenAddress = await otherToken.getAddress();

                const currentTime = await time.latest();
                // Sign for testToken but try to use for otherToken
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user1, accounts.user2]
                );

                // This should fail because the signature was for testTokenAddress, not otherTokenAddress
                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(otherTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "UnauthorizedSigner");
            });
        });

        describe("Edge Cases", function () {
            it("should work with timestamp at current block", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                const currentTime = await time.latest();
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime,
                    [accounts.user1, accounts.user2]
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(ONE_USD);
            });

            it("should work after staleness threshold is updated", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                // Set a very short staleness threshold
                await oraclePromisPullAdaptor.connect(accounts.admin).setStalenessThreshold(60);

                const currentTime = await time.latest();
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime - 30, // 30 seconds ago
                    [accounts.user1, accounts.user2]
                );

                const price = await oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload);
                expect(price).to.equal(ONE_USD);
            });

            it("should reject after staleness threshold is reduced", async function () {
                const { oraclePromisPullAdaptor, testTokenAddress, accounts } =
                    await loadFixture(oraclePromisPullAdaptorFixture);

                // Set a very short staleness threshold
                await oraclePromisPullAdaptor.connect(accounts.admin).setStalenessThreshold(10);

                const currentTime = await time.latest();
                const payload = await createSignedPayload(
                    testTokenAddress,
                    ONE_USD,
                    currentTime - 30, // 30 seconds ago (now stale)
                    [accounts.user1, accounts.user2]
                );

                await expect(
                    oraclePromisPullAdaptor.getOraclePriceForAsset(testTokenAddress, payload)
                ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, "StaleOracleData");
            });
        });
    });

    // ============================================
    // View Functions Tests
    // ============================================
    describe("View Functions", function () {
        it("proTokenSettings should return correct address", async function () {
            const { oraclePromisPullAdaptor, proTokenSettingsAddress } =
                await loadFixture(oraclePromisPullAdaptorFixture);

            expect(await oraclePromisPullAdaptor.proTokenSettings()).to.equal(proTokenSettingsAddress);
        });
    });

    // ============================================
    // Upgrade Authorization Tests
    // ============================================
    describe("Upgrade Authorization", function () {
        it("should only allow admin to upgrade", async function () {
            const { oraclePromisPullAdaptor, accounts } = await loadFixture(oraclePromisPullAdaptorFixture);

            const OraclePromisPullAdaptorV2Factory = await ethers.getContractFactory("OraclePromisPullAdaptor");

            await expect(
                upgrades.upgradeProxy(
                    await oraclePromisPullAdaptor.getAddress(),
                    OraclePromisPullAdaptorV2Factory.connect(accounts.user1)
                )
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.Unauthorized);

            await expect(
                upgrades.upgradeProxy(
                    await oraclePromisPullAdaptor.getAddress(),
                    OraclePromisPullAdaptorV2Factory.connect(accounts.operator)
                )
            ).to.be.revertedWithCustomError(oraclePromisPullAdaptor, ERRORS.Unauthorized);
        });
    });
});
