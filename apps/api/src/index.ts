import "./config.js";
import "./types.js";
import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import { registerRateLimit } from "./plugins/rate-limit.js";
import { healthRoutes } from "./routes/health.js";
import { cashRoutes } from "./routes/cash.js";
import { reputationRoutes } from "./routes/reputation.js";
import { fundRoutes } from "./routes/fund.js";
import { serviceRoutes } from "./routes/services.js";
import { demoRoutes } from "./routes/demo.js";
import { bazaarRoutes } from "./routes/bazaar.js";
import { cetesRoutes } from "./routes/cetes.js";

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const NODE_ENV = process.env.NODE_ENV ?? "development";

const app = Fastify({
  logger:
    NODE_ENV === "development"
      ? {
          level: "info",
          transport: { target: "pino-pretty", options: { colorize: true } },
        }
      : {
          level: process.env.LOG_LEVEL ?? "info",
          formatters: {
            level: (label) => ({ level: label }),
          },
        },
  trustProxy: true,
});

app.register(fastifyCors, {
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-PAYMENT", "X-Forwarded-For"],
  exposedHeaders: ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"],
});

registerRateLimit(app);

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET ?? "micopay-dev-secret-change-in-production",
});

app.setErrorHandler((error, request, reply) => {
  if (error.statusCode === 429) {
    reply.status(429).send({
      status: 429,
      error: "Too Many Requests",
      message: error.message,
      retryAfter: (error as any).headers?.["retry-after"],
    });
    return;
  }

  if (error.validation) {
    reply.status(400).send({
      status: 400,
      error: "ValidationError",
      message: error.message,
    });
    return;
  }

  request.log.error({ err: error }, "Request error");
  reply.status(500).send({
    status: 500,
    error: "InternalServerError",
    message: NODE_ENV === "production" ? "Something went wrong" : error.message,
  });
});

app.get("/health", async () => ({
  status: "ok",
  service: "micopay-protocol-api",
  version: "1.0.0",
  timestamp: new Date().toISOString(),
  payment_method: "x402",
  network: process.env.STELLAR_NETWORK ?? "testnet",
  rateLimit: {
    max: process.env.RATE_LIMIT_MAX ?? "100",
    window: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
  },
}));

app.register(healthRoutes);
app.register(cashRoutes);
app.register(reputationRoutes);
app.register(fundRoutes);
app.register(serviceRoutes);
app.register(demoRoutes);
app.register(bazaarRoutes);
app.register(cetesRoutes);

async function start() {
  try {
    await app.listen({ port: PORT, host: "0.0.0.0" });

    const addr = app.server.address();
    const url = typeof addr === "string" ? addr : `http://localhost:${addr?.port}`;

    console.log(`
╔══════════════════════════════════════════════════════╗
║          MicoPay Protocol API v1.0.0             ║
╠══════════════════════════════════════════════════════╣
║  URL:       ${url.padEnd(40)}║
║  Network:    ${(process.env.STELLAR_NETWORK ?? "TESTNET").padEnd(40)}║
║  Rate Limit: ${(`${process.env.RATE_LIMIT_MAX ?? 100} req/${process.env.RATE_LIMIT_WINDOW ?? "1 min"}`).padEnd(40)}║
║  Payment:    x402 (USDC on Stellar)             ║
╚══════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
