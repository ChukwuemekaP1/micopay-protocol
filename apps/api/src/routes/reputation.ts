import type { FastifyInstance } from "fastify";
import { requirePayment } from "../middleware/x402.js";

export async function reputationRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /api/v1/reputation/:address
   * x402: $0.0005 — on-chain reputation score
   */
  fastify.get(
    "/api/v1/reputation/:address",
    {
      preHandler: requirePayment({ amount: "0.0005", service: "reputation_query" }),
    },
    async (request, reply) => {
      const { address } = request.params as { address: string };

      // In production: query ReputationRegistry contract on-chain
      const mockScore = Math.floor(Math.random() * 40) + 60; // 60-100
      const tier =
        mockScore >= 95
          ? "Maestro"
          : mockScore >= 85
          ? "Hongo"
          : mockScore >= 70
          ? "Micelio"
          : "Espora";

      return reply.send({
        address,
        score: mockScore,
        tier,
        completed_trades: Math.floor(Math.random() * 100),
        completion_rate: (0.85 + Math.random() * 0.15).toFixed(2),
        avg_time_seconds: Math.floor(Math.random() * 60) + 30,
        member_since: "2025-01-01",
        nft_soulbound: tier !== "Espora",
      });
    }
  );
}
