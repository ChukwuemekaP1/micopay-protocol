import { Keypair, SorobanRpc, xdr, nativeToScVal, scValToNative } from "@stellar/stellar-sdk";
import type { SwapStatus } from "@micopay/types";
import {
  buildContractTx,
  signAndSubmit,
  waitForConfirmation,
  type Network,
} from "./stellar.js";

export interface LockParams {
  initiator: string;
  counterparty: string;
  token: string;
  amount: bigint;
  secretHash: string; // hex string
  timeoutLedgers: number;
}

export interface SwapState {
  initiator: string;
  counterparty: string;
  token: string;
  amount: bigint;
  secretHash: string;
  timeoutLedger: number;
  status: SwapStatus;
}

/**
 * AtomicSwapClient — TypeScript wrapper for the AtomicSwapHTLC Soroban contract.
 *
 * Handles building, signing, and submitting contract calls.
 * Does NOT make any LLM calls — purely deterministic.
 */
export class AtomicSwapClient {
  private server: SorobanRpc.Server;
  private network: Network;
  private contractId: string;

  constructor(contractId: string, network: Network = "testnet") {
    this.contractId = contractId;
    this.network = network;
    this.server = new SorobanRpc.Server(
      process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org",
      { allowHttp: false }
    );
  }

  /**
   * Lock funds in the atomic swap contract.
   * Returns the swap_id (hex string).
   */
  async lock(params: LockParams, keypair: Keypair): Promise<string> {
    const args = [
      nativeToScVal(params.initiator, { type: "address" }),
      nativeToScVal(params.counterparty, { type: "address" }),
      nativeToScVal(params.token, { type: "address" }),
      nativeToScVal(params.amount, { type: "i128" }),
      xdr.ScVal.scvBytes(Buffer.from(params.secretHash, "hex")),
      nativeToScVal(params.timeoutLedgers, { type: "u32" }),
    ];

    const tx = await buildContractTx(
      this.server,
      this.network,
      keypair,
      this.contractId,
      "lock",
      args
    );

    const hash = await signAndSubmit(this.server, tx, keypair);
    const result = await waitForConfirmation(this.server, hash);

    // Extract swap_id from the return value
    const returnVal = result.returnValue;
    if (!returnVal) throw new Error("No return value from lock()");

    const swapIdBytes = scValToNative(returnVal) as Buffer;
    return swapIdBytes.toString("hex");
  }

  /**
   * Release funds by revealing the secret preimage.
   */
  async release(swapId: string, secret: string, keypair: Keypair): Promise<string> {
    const args = [
      xdr.ScVal.scvBytes(Buffer.from(swapId, "hex")),
      xdr.ScVal.scvBytes(Buffer.from(secret, "hex")),
    ];

    const tx = await buildContractTx(
      this.server,
      this.network,
      keypair,
      this.contractId,
      "release",
      args
    );

    const hash = await signAndSubmit(this.server, tx, keypair);
    await waitForConfirmation(this.server, hash);
    return hash;
  }

  /**
   * Refund initiator after timeout. Anyone can call this.
   */
  async refund(swapId: string, keypair: Keypair): Promise<string> {
    const args = [xdr.ScVal.scvBytes(Buffer.from(swapId, "hex"))];

    const tx = await buildContractTx(
      this.server,
      this.network,
      keypair,
      this.contractId,
      "refund",
      args
    );

    const hash = await signAndSubmit(this.server, tx, keypair);
    await waitForConfirmation(this.server, hash);
    return hash;
  }

  /**
   * Get current swap status (view call — no fee, no signing).
   */
  async getStatus(swapId: string): Promise<SwapStatus> {
    const args = [xdr.ScVal.scvBytes(Buffer.from(swapId, "hex"))];

    const account = await this.server.getAccount(
      Keypair.random().publicKey() // dummy for simulation
    );

    const result = await this.server.simulateTransaction(
      await buildContractTx(
        this.server,
        this.network,
        Keypair.random(),
        this.contractId,
        "get_status",
        args
      )
    );

    if (SorobanRpc.Api.isSimulationError(result)) {
      throw new Error(`Simulation failed: ${result.error}`);
    }

    const returnVal = (result as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (!returnVal) throw new Error("No return value from get_status()");

    const raw = scValToNative(returnVal) as string;
    return raw.toLowerCase() as SwapStatus;
  }
}
