import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// ---------------------------------------------------------------------------
// EIP-712 proof helpers for ProTokenOperations
//
// Domain: ("ProTokenOperations", "1")
// Types:
//   MintProof   - used by finalizeMintRequest
//   UnmintProof - used by finalizeUnmintRequest
//
// Both have identical field shape:
//   uint256 requestId, address user, address receiver,
//   address yAsset, uint256 amount, uint256 minAmountOut, uint8 proofKind
// ---------------------------------------------------------------------------

export enum ProofKind {
    PROOF_OF_APPROVE = 0,
    PROOF_OF_RETURN = 1,
}

export interface ProofData {
    requestId: bigint;
    user: string;
    receiver: string;
    yAsset: string;
    amount: bigint;
    minAmountOut: bigint;
    deadline: bigint;
    proofKind: ProofKind;
}

const PROOF_TYPES = {
    MintProof: [
        { name: "requestId",    type: "uint256" },
        { name: "user",         type: "address" },
        { name: "receiver",     type: "address" },
        { name: "yAsset",       type: "address" },
        { name: "amount",       type: "uint256" },
        { name: "minAmountOut", type: "uint256" },
        { name: "deadline",     type: "uint256" },
        { name: "proofKind",    type: "uint8"   },
    ],
};

const UNMINT_PROOF_TYPES = {
    UnmintProof: [
        { name: "requestId",    type: "uint256" },
        { name: "user",         type: "address" },
        { name: "receiver",     type: "address" },
        { name: "yAsset",       type: "address" },
        { name: "amount",       type: "uint256" },
        { name: "minAmountOut", type: "uint256" },
        { name: "deadline",     type: "uint256" },
        { name: "proofKind",    type: "uint8"   },
    ],
};

async function buildDomain(verifyingContract: string) {
    const chainId = (await ethers.provider.getNetwork()).chainId;
    return {
        name: "ProTokenOperations",
        version: "1",
        chainId,
        verifyingContract,
    };
}

export async function signMintProof(
    signer: HardhatEthersSigner,
    verifyingContract: string,
    data: ProofData,
): Promise<string> {
    const domain = await buildDomain(verifyingContract);
    return await signer.signTypedData(domain, PROOF_TYPES, data);
}

export async function signUnmintProof(
    signer: HardhatEthersSigner,
    verifyingContract: string,
    data: ProofData,
): Promise<string> {
    const domain = await buildDomain(verifyingContract);
    return await signer.signTypedData(domain, UNMINT_PROOF_TYPES, data);
}
