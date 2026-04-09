import type { FastifyInstance } from "fastify";
import { requirePayment } from "../middleware/x402.js";
import type { CounterpartyInfo } from "@micopay/types";

// Mock counterparties for demo — replaced with DB queries in production
const MOCK_COUNTERPARTIES: CounterpartyInfo[] = [
  {
    address: "GDEMOSWAP1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    chain: "stellar",
    reputation_score: 95,
    completion_rate: 0.98,
    avg_time_seconds: 45,
    available_amount: "500",
    rate: "1.001",
  },
  {
    address: "GDEMOSWAP2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    chain: "stellar",
    reputation_score: 87,
    completion_rate: 0.94,
    avg_time_seconds: 62,
    available_amount: "200",
    rate: "1.002",
  },
];

export async function swapRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/swaps/search
   * x402: $0.001 — find available swap counterparties
   */
  fastify.get(
    "/api/v1/swaps/search",
    {
      preHandler: requirePayment({ amount: "0.001", service: "swap_search" }),
    },
    async (request, reply) => {
      const { sell_asset, buy_asset, amount } = request.query as {
        sell_asset?: string;
        buy_asset?: string;
        amount?: string;
      };

      const counterparties = MOCK_COUNTERPARTIES.filter((c) => {
        if (amount && parseFloat(c.available_amount) < parseFloat(amount)) return false;
        return true;
      });

      return reply.send({
        counterparties,
        sell_asset: sell_asset ?? "USDC",
        buy_asset: buy_asset ?? "XLM",
        total_results: counterparties.length,
        payer: request.payerAddress,
      });
    }
  );

  /**
   * GET /api/v1/swaps/:id/status
   * x402: $0.0001 — poll swap status
   */
  fastify.get(
    "/api/v1/swaps/:id/status",
    {
      preHandler: requirePayment({ amount: "0.0001", service: "swap_status" }),
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // In production: query DB for swap state
      return reply.send({
        swap_id: id,
        status: "locked",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  );
}
