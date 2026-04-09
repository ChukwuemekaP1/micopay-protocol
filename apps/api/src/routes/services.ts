import type { FastifyInstance } from "fastify";
import type { ServiceCatalog } from "@micopay/types";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function serviceRoutes(fastify: FastifyInstance): Promise<void> {
  const BASE_URL = process.env.API_BASE_URL ?? "https://api.micopay.xyz";

  /**
   * GET /api/v1/services
   * Free — agent service discovery
   */
  fastify.get("/api/v1/services", async (_request, reply) => {
    const catalog: ServiceCatalog = {
      protocol: "micopay",
      version: "1.0.0",
      payment_method: "x402",
      payment_asset: "USDC",
      payment_network: "stellar",
      services: [
        {
          name: "swap_search",
          endpoint: "GET /api/v1/swaps/search",
          method: "GET",
          price_usdc: "0.001",
          description: "Search for available swap counterparties",
          example_request: { sell_asset: "USDC", buy_asset: "XLM", amount: "100" },
        },
        {
          name: "swap_plan",
          endpoint: "POST /api/v1/swaps/plan",
          method: "POST",
          price_usdc: "0.01",
          description: "AI-powered swap planning — Claude analyzes intent and produces executable plan",
          example_request: { intent: "I want to swap 100 USDC for XLM", user_address: "G..." },
        },
        {
          name: "swap_execute",
          endpoint: "POST /api/v1/swaps/execute",
          method: "POST",
          price_usdc: "0.05",
          description: "Execute an atomic swap plan on testnet",
          example_request: { plan_id: "plan_xxx", user_address: "G..." },
        },
        {
          name: "swap_status",
          endpoint: "GET /api/v1/swaps/:id/status",
          method: "GET",
          price_usdc: "0.0001",
          description: "Poll status of an in-progress swap",
        },
        {
          name: "reputation",
          endpoint: "GET /api/v1/reputation/:address",
          method: "GET",
          price_usdc: "0.0005",
          description: "Query on-chain reputation score for a Stellar address",
          example_request: { address: "GABC..." },
        },
        {
          name: "fund_micopay",
          endpoint: "POST /api/v1/fund",
          method: "POST",
          price_usdc: "0.10",
          description: "Fund the Micopay project using x402. Meta-demo: proves the infrastructure works.",
          example_request: { message: "Great project!" },
        },
      ],
      skill_url: `${BASE_URL}/skill.md`,
    };

    return reply.send(catalog);
  });

  /**
   * GET /skill.md
   * Free — OpenClaw SKILL.md for agent discovery
   */
  fastify.get("/skill.md", async (_request, reply) => {
    try {
      const skillPath = join(__dirname, "../../../../skill/SKILL.md");
      const content = readFileSync(skillPath, "utf-8");
      reply.type("text/markdown").send(content);
    } catch {
      reply.status(404).send("SKILL.md not found");
    }
  });
}
