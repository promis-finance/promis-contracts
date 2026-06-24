import { expect } from "chai";
import { ContractTransactionResponse, ContractTransactionReceipt, EventLog, Log } from "ethers";
import { ethers } from "hardhat";

// ============================================
// Custom Error Assertion Helpers
// ============================================

/**
 * Expect a transaction to revert with a specific custom error
 * @param promise The promise that should revert
 * @param errorName The name of the custom error
 * @param args Optional arguments to check in the error
 */
export async function expectRevertWithCustomError(
    promise: Promise<unknown>,
    errorName: string,
    args?: unknown[]
): Promise<void> {
    if (args && args.length > 0) {
        await expect(promise).to.be.revertedWithCustomError(
            { interface: { getError: () => ({ name: errorName }) } } as never,
            errorName
        ).withArgs(...args);
    } else {
        await expect(promise).to.be.revertedWithCustomError(
            { interface: { getError: () => ({ name: errorName }) } } as never,
            errorName
        );
    }
}

/**
 * Expect a transaction to revert with a specific error message
 * @param promise The promise that should revert
 * @param message The expected error message
 */
export async function expectRevertWithMessage(
    promise: Promise<unknown>,
    message: string
): Promise<void> {
    await expect(promise).to.be.revertedWith(message);
}

/**
 * Expect a transaction to revert (any reason)
 * @param promise The promise that should revert
 */
export async function expectRevert(promise: Promise<unknown>): Promise<void> {
    await expect(promise).to.be.reverted;
}

/**
 * Expect a transaction to not revert
 * @param promise The promise that should not revert
 */
export async function expectNotRevert(promise: Promise<unknown>): Promise<void> {
    await expect(promise).to.not.be.reverted;
}

// ============================================
// Event Assertion Helpers
// ============================================

/**
 * Expect an event to be emitted with specific arguments
 * @param promise The transaction promise
 * @param contract The contract instance
 * @param eventName The name of the event
 * @param args The expected event arguments
 */
export async function expectEvent(
    promise: Promise<ContractTransactionResponse>,
    contract: { interface: { getEvent: (name: string) => unknown } },
    eventName: string,
    args?: unknown[]
): Promise<void> {
    if (args && args.length > 0) {
        await expect(promise).to.emit(contract, eventName).withArgs(...args);
    } else {
        await expect(promise).to.emit(contract, eventName);
    }
}

/**
 * Expect an event to NOT be emitted
 * @param promise The transaction promise
 * @param contract The contract instance
 * @param eventName The name of the event
 */
export async function expectNoEvent(
    promise: Promise<ContractTransactionResponse>,
    contract: { interface: { getEvent: (name: string) => unknown } },
    eventName: string
): Promise<void> {
    await expect(promise).to.not.emit(contract, eventName);
}

/**
 * Get events from a transaction receipt
 * @param receipt The transaction receipt
 * @param eventName The name of the event to filter
 * @returns Array of matching events
 */
export function getEventsFromReceipt(
    receipt: ContractTransactionReceipt,
    eventName: string
): EventLog[] {
    return receipt.logs.filter(
        (log): log is EventLog =>
            log instanceof EventLog && log.eventName === eventName
    );
}

/**
 * Get a single event from a transaction receipt
 * @param receipt The transaction receipt
 * @param eventName The name of the event
 * @returns The event or undefined
 */
export function getEventFromReceipt(
    receipt: ContractTransactionReceipt,
    eventName: string
): EventLog | undefined {
    const events = getEventsFromReceipt(receipt, eventName);
    return events.length > 0 ? events[0] : undefined;
}

// ============================================
// Balance Assertion Helpers
// ============================================

/**
 * Expect a balance change for an address
 * @param promise The transaction promise
 * @param token The token contract
 * @param address The address to check
 * @param expectedChange The expected balance change (can be negative)
 */
export async function expectBalanceChange(
    promise: Promise<ContractTransactionResponse>,
    token: { balanceOf: (address: string) => Promise<bigint> },
    address: string,
    expectedChange: bigint
): Promise<void> {
    await expect(promise).to.changeTokenBalance(token, address, expectedChange);
}

/**
 * Expect multiple balance changes
 * @param promise The transaction promise
 * @param token The token contract
 * @param addresses Array of addresses
 * @param expectedChanges Array of expected changes
 */
export async function expectBalanceChanges(
    promise: Promise<ContractTransactionResponse>,
    token: { balanceOf: (address: string) => Promise<bigint> },
    addresses: string[],
    expectedChanges: bigint[]
): Promise<void> {
    await expect(promise).to.changeTokenBalances(token, addresses, expectedChanges);
}

/**
 * Expect ETH balance change
 * @param promise The transaction promise
 * @param address The address to check
 * @param expectedChange The expected ETH balance change
 */
export async function expectEthBalanceChange(
    promise: Promise<ContractTransactionResponse>,
    address: string,
    expectedChange: bigint
): Promise<void> {
    await expect(promise).to.changeEtherBalance(address, expectedChange);
}

// ============================================
// Value Assertion Helpers
// ============================================

/**
 * Expect a value to be approximately equal (within tolerance)
 * @param actual The actual value
 * @param expected The expected value
 * @param tolerance The tolerance (default 0.01% = 1 basis point)
 */
export function expectApproxEqual(
    actual: bigint,
    expected: bigint,
    toleranceBps: bigint = 1n // 0.01%
): void {
    const tolerance = (expected * toleranceBps) / 10000n;
    const diff = actual > expected ? actual - expected : expected - actual;
    expect(diff).to.be.lte(tolerance);
}

/**
 * Expect a value to be within a range
 * @param value The value to check
 * @param min Minimum value (inclusive)
 * @param max Maximum value (inclusive)
 */
export function expectInRange(value: bigint, min: bigint, max: bigint): void {
    expect(value).to.be.gte(min);
    expect(value).to.be.lte(max);
}

/**
 * Expect a value to be greater than zero
 * @param value The value to check
 */
export function expectPositive(value: bigint): void {
    expect(value).to.be.gt(0n);
}

/**
 * Expect a value to be zero
 * @param value The value to check
 */
export function expectZero(value: bigint): void {
    expect(value).to.equal(0n);
}

/**
 * Expect an address to not be zero address
 * @param address The address to check
 */
export function expectValidAddress(address: string): void {
    expect(address).to.not.equal(ethers.ZeroAddress);
}

/**
 * Expect an address to be zero address
 * @param address The address to check
 */
export function expectZeroAddress(address: string): void {
    expect(address).to.equal(ethers.ZeroAddress);
}

// ============================================
// Array Assertion Helpers
// ============================================

/**
 * Expect arrays to be equal
 * @param actual The actual array
 * @param expected The expected array
 */
export function expectArrayEqual<T>(actual: T[], expected: T[]): void {
    expect(actual.length).to.equal(expected.length);
    for (let i = 0; i < actual.length; i++) {
        expect(actual[i]).to.equal(expected[i]);
    }
}

/**
 * Expect array to contain a value
 * @param array The array to check
 * @param value The value to find
 */
export function expectArrayContains<T>(array: T[], value: T): void {
    expect(array).to.include(value);
}

/**
 * Expect array to not contain a value
 * @param array The array to check
 * @param value The value that should not be present
 */
export function expectArrayNotContains<T>(array: T[], value: T): void {
    expect(array).to.not.include(value);
}

/**
 * Expect array to be empty
 * @param array The array to check
 */
export function expectArrayEmpty<T>(array: T[]): void {
    expect(array.length).to.equal(0);
}

/**
 * Expect array to have specific length
 * @param array The array to check
 * @param length Expected length
 */
export function expectArrayLength<T>(array: T[], length: number): void {
    expect(array.length).to.equal(length);
}

// ============================================
// Struct Assertion Helpers
// ============================================

/**
 * Expect struct fields to match expected values
 * @param actual The actual struct
 * @param expected Object with expected field values
 */
export function expectStructMatch(
    actual: Record<string, unknown>,
    expected: Record<string, unknown>
): void {
    for (const [key, value] of Object.entries(expected)) {
        expect(actual[key]).to.equal(value, `Field ${key} mismatch`);
    }
}

// ============================================
// State Change Assertion Helpers
// ============================================

/**
 * Expect a state variable to change
 * @param getter Function to get the state value
 * @param action Function that changes the state
 * @param expectedBefore Expected value before
 * @param expectedAfter Expected value after
 */
export async function expectStateChange<T>(
    getter: () => Promise<T>,
    action: () => Promise<unknown>,
    expectedBefore: T,
    expectedAfter: T
): Promise<void> {
    const before = await getter();
    expect(before).to.equal(expectedBefore);

    await action();

    const after = await getter();
    expect(after).to.equal(expectedAfter);
}

/**
 * Expect a state variable to not change
 * @param getter Function to get the state value
 * @param action Function that should not change the state
 */
export async function expectNoStateChange<T>(
    getter: () => Promise<T>,
    action: () => Promise<unknown>
): Promise<void> {
    const before = await getter();
    await action();
    const after = await getter();
    expect(after).to.equal(before);
}
