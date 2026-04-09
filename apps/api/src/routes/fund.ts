import type { FastifyInstance } from "fastify";
import { requirePayment } from "../middleware/x402.js";

/**
 * Fund Micopay — The Meta-Demo Endpoint
 *
 * Any agent can donate USDC to fund the project using the same
 * x402 infrastructure it's demonstrating. No API key, no signup.
 *
 * This is the "moment demo" — an agent pays, the dashboard updates
 * in real time, the tx is verifiable on Stellar Expert.
 */

// In-memory store for demo — in production, this is the funding_contributions DB table
const contributions: Array<{
  id: string;
  supporter_address: string;
  amount_usdc: string;
  message?: string;
  created_at: string;
  stellar_tx_hash: string;
}> = [];

let totalFundedUsdc = 0;

export async function fundRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/fund
   * x402: minimum $0.10 — fund the Micopay project
   */
  fastify.post(
    "/api/v1/fund",
    {
      preHandler: requirePayment({ amount: "0.10", service: "fund_micopay" }),
    },
    async (request, reply) => {
      const body = request.body as { message?: string } | undefined;
      const message = body?.message?.slice(0, 280);

      const contribution = {
        id: `mcp-supporter-${String(contributions.length + 1).padStart(3, "0")}`,
        supporter_address: request.payerAddress ?? "GUNKOWN",
        amount_usdc: "0.10", // minimum — real amount from payment verification
        message,
        created_at: new Date().toISOString(),
        stellar_tx_hash: `demo_${Date.now()}`, // real hash from payment tx
      };

      contributions.push(contribution);
      totalFundedUsdc += 0.10;

      fastify.log.info(
        `Fund contribution: ${contribution.supporter_address} — $${contribution.amount_usdc} USDC`
      );

      return reply.send({
        thank_you: true,
        supporter_id: contribution.id,
        amount_usdc: contribution.amount_usdc,
        stellar_tx_hash: contribution.stellar_tx_hash,
        total_funded_usdc: totalFundedUsdc.toFixed(2),
        total_supporters: contributions.length,
        message_recorded: !!message,
        stellar_expert_url: `https://stellar.expert/explorer/testnet/tx/${contribution.stellar_tx_hash}`,
      });
    }
  );

  /**
   * GET /api/v1/fund/stats
   * Free — public fund stats for the dashboard widget
   */
  fastify.get("/api/v1/fund/stats", async (_request, reply) => {
    const uniqueAddresses = new Set(contributions.map((c) => c.supporter_address)).size;

    return reply.send({
      total_funded_usdc: totalFundedUsdc.toFixed(2),
      total_supporters: uniqueAddresses,
      total_transactions: contributions.length,
      recent: contributions.slice(-10).reverse().map((c) => ({
        address: `${c.supporter_address.slice(0, 4)}...${c.supporter_address.slice(-4)}`,
        amount_usdc: c.amount_usdc,
        message: c.message,
        timestamp: c.created_at,
        stellar_expert_url: `https://stellar.expert/explorer/testnet/tx/${c.stellar_tx_hash}`,
      })),
    });
  });
}
