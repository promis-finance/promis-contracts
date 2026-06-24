import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

// ============================================
// Time Manipulation Helpers
// ============================================

/**
 * Increase the blockchain time by a specified number of seconds
 * @param seconds Number of seconds to increase time by
 */
export async function increaseTime(seconds: number): Promise<void> {
    await time.increase(seconds);
}

/**
 * Increase the blockchain time and mine a new block
 * @param seconds Number of seconds to increase time by
 */
export async function increaseTimeAndMine(seconds: number): Promise<void> {
    await time.increase(seconds);
}

/**
 * Set the timestamp of the next block
 * @param timestamp Unix timestamp for the next block
 */
export async function setNextBlockTimestamp(timestamp: number): Promise<void> {
    await time.setNextBlockTimestamp(timestamp);
}

/**
 * Get the current block timestamp
 * @returns Current block timestamp
 */
export async function getCurrentTimestamp(): Promise<number> {
    return await time.latest();
}

/**
 * Get the current block number
 * @returns Current block number
 */
export async function getCurrentBlockNumber(): Promise<number> {
    return await ethers.provider.getBlockNumber();
}

/**
 * Mine a specified number of blocks
 * @param blocks Number of blocks to mine
 */
export async function mineBlocks(blocks: number): Promise<void> {
    for (let i = 0; i < blocks; i++) {
        await ethers.provider.send("evm_mine", []);
    }
}

/**
 * Mine a single block
 */
export async function mineBlock(): Promise<void> {
    await ethers.provider.send("evm_mine", []);
}

/**
 * Get the timestamp of a specific block
 * @param blockNumber Block number to get timestamp for
 * @returns Block timestamp
 */
export async function getBlockTimestamp(blockNumber: number): Promise<number> {
    const block = await ethers.provider.getBlock(blockNumber);
    return block?.timestamp ?? 0;
}

/**
 * Advance time to a specific timestamp
 * @param timestamp Target timestamp
 */
export async function advanceTimeTo(timestamp: number): Promise<void> {
    const currentTimestamp = await getCurrentTimestamp();
    if (timestamp > currentTimestamp) {
        await increaseTime(timestamp - currentTimestamp);
    }
}

/**
 * Take a snapshot of the current blockchain state
 * @returns Snapshot ID
 */
export async function takeSnapshot(): Promise<string> {
    return await ethers.provider.send("evm_snapshot", []);
}

/**
 * Revert to a previous snapshot
 * @param snapshotId Snapshot ID to revert to
 */
export async function revertToSnapshot(snapshotId: string): Promise<void> {
    await ethers.provider.send("evm_revert", [snapshotId]);
}

// ============================================
// Time Constants Helpers
// ============================================

/**
 * Get a future timestamp
 * @param secondsFromNow Seconds from current time
 * @returns Future timestamp
 */
export async function getFutureTimestamp(secondsFromNow: number): Promise<number> {
    const currentTimestamp = await getCurrentTimestamp();
    return currentTimestamp + secondsFromNow;
}

/**
 * Get a past timestamp
 * @param secondsAgo Seconds before current time
 * @returns Past timestamp
 */
export async function getPastTimestamp(secondsAgo: number): Promise<number> {
    const currentTimestamp = await getCurrentTimestamp();
    return currentTimestamp - secondsAgo;
}

/**
 * Check if a timestamp is in the past
 * @param timestamp Timestamp to check
 * @returns True if timestamp is in the past
 */
export async function isTimestampPast(timestamp: number): Promise<boolean> {
    const currentTimestamp = await getCurrentTimestamp();
    return timestamp < currentTimestamp;
}

/**
 * Check if a timestamp is in the future
 * @param timestamp Timestamp to check
 * @returns True if timestamp is in the future
 */
export async function isTimestampFuture(timestamp: number): Promise<boolean> {
    const currentTimestamp = await getCurrentTimestamp();
    return timestamp > currentTimestamp;
}

// ============================================
// Duration Helpers
// ============================================

export const SECONDS_PER_MINUTE = 60;
export const SECONDS_PER_HOUR = 60 * 60;
export const SECONDS_PER_DAY = 24 * 60 * 60;
export const SECONDS_PER_WEEK = 7 * 24 * 60 * 60;
export const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/**
 * Convert minutes to seconds
 */
export function minutesToSeconds(minutes: number): number {
    return minutes * SECONDS_PER_MINUTE;
}

/**
 * Convert hours to seconds
 */
export function hoursToSeconds(hours: number): number {
    return hours * SECONDS_PER_HOUR;
}

/**
 * Convert days to seconds
 */
export function daysToSeconds(days: number): number {
    return days * SECONDS_PER_DAY;
}

/**
 * Convert weeks to seconds
 */
export function weeksToSeconds(weeks: number): number {
    return weeks * SECONDS_PER_WEEK;
}
