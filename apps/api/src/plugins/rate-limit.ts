import fastifyRateLimit from "@fastify/rate-limit";

export async function registerRateLimit(app: any) {
  await app.register(fastifyRateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX ?? "100", 10),
    timeWindow: process.env.RATE_LIMIT_WINDOW ?? "1 minute",
    redis: process.env.REDIS_URL
      ? { connectionString: process.env.REDIS_URL }
      : undefined,
    keyGenerator: (request: any) => {
      return (
        request.headers["x-forwarded-for"]?.split(",")[0] ||
        request.headers["x-real-ip"] ||
        request.ip
      );
    },
    errorResponseBuilder: (_request: any, context: any) => {
      return {
        status: 429,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
        retryAfter: Math.ceil(context.ttl / 1000),
        limit: context.max,
        remaining: 0,
      };
    },
    onExceeding: (request: any, key: string) => {
      request.log.warn({ key }, "Rate limit approaching");
    },
    onExceeded: (request: any, key: string) => {
      request.log.warn({ key }, "Rate limit exceeded");
    },
  });

  app.addHook("onRequest", async (request: any) => {
    request.startTime = Date.now();
  });

  app.addHook("onResponse", async (request: any, reply: any) => {
    const duration = Date.now() - (request.startTime || Date.now());
    const rateLimitRemaining = reply.getHeader("ratelimit-remaining");

    request.log.info({
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
      rateLimitRemaining,
    });
  });
}
