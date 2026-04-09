import type { FastifyInstance } from "fastify";
import { requirePayment } from "../middleware/x402.js";

/**
 * Agent endpoints — planning and execution.
 * The actual Claude integration lives in apps/agent/
 * These endpoints are HTTP facades that trigger the agent logic.
 */
export async function agentRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /api/v1/swaps/plan
   * x402: $0.01 — Claude parses intent and produces a SwapPlan
   */
  fastify.post(
    "/api/v1/swaps/plan",
    {
      preHandler: requirePayment({ amount: "0.01", service: "swap_plan" }),
    },
    async (request, reply) => {
      const body = request.body as { intent: string; user_address: string };

      if (!body?.intent) {
        return reply.status(400).send({ error: "intent is required" });
      }

      // Lazy-import the agent to avoid loading Anthropic SDK unless needed
      try {
        // Dynamic import — agent module built separately
        const agentModule = await import("../../../agent/src/intent-parser.js" as string).catch(() => null);
        if (!agentModule) throw new Error("Agent module not available");
        const { planSwap } = agentModule;
        const plan = await planSwap(body.intent, body.user_address);
        return reply.send({ plan, payer: request.payerAddress });
      } catch (err) {
        // Fallback: return a mock plan for demo resilience
        fastify.log.warn(`Agent unavailable, returning mock plan: ${err}`);
        return reply.send({
          plan: {
            id: `plan_${Date.now()}`,
            steps: [
              { order: 1, action: "lock", chain: "stellar", contract: "atomic_swap", params: {} },
              { order: 2, action: "monitor", chain: "stellar", contract: "atomic_swap", params: {}, depends_on: 1 },
              { order: 3, action: "release", chain: "stellar", contract: "atomic_swap", params: {}, depends_on: 2 },
            ],
            counterparty: { address: "GDEMO...", chain: "stellar", reputation_score: 95 },
            amounts: {
              sell_asset: "USDC",
              sell_amount: "10.00",
              buy_asset: "XLM",
              buy_amount: "100.00",
              exchange_rate: "10.00",
            },
            timeouts: { initiator_ledgers: 200, counterparty_ledgers: 100 },
            fees: { gas_chain_a: "0.001", gas_chain_b: "0.001", service_fee: "0.01", total_usd: "0.012" },
            risk_level: "low",
            estimated_time_seconds: 60,
          },
          note: "mock_plan_agent_unavailable",
          payer: request.payerAddress,
        });
      }
    }
  );

  /**
   * POST /api/v1/swaps/execute
   * x402: $0.05 — execute a previously created SwapPlan
   */
  fastify.post(
    "/api/v1/swaps/execute",
    {
      preHandler: requirePayment({ amount: "0.05", service: "swap_execute" }),
    },
    async (request, reply) => {
      const body = request.body as { plan_id: string; user_address: string };

      if (!body?.plan_id) {
        return reply.status(400).send({ error: "plan_id is required" });
      }

      // In production: load plan from DB, trigger SwapExecutor
      const swapId = `swap_${Date.now()}`;

      return reply.status(202).send({
        swap_id: swapId,
        plan_id: body.plan_id,
        status: "executing",
        message: "Swap initiated. Poll /api/v1/swaps/:id/status for updates.",
        payer: request.payerAddress,
      });
    }
  );
}
