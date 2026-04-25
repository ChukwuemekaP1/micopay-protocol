# micopay/backend

Fastify API for the MicoPay retail app. Handles auth, trade lifecycle, Soroban escrow calls, and DeFi integrations (CETES, Blend). Falls back to an in-memory store when PostgreSQL is unavailable, which makes local dev work without any infrastructure.

## What it is

- **Auth**: simplified SEP-10 challenge/response, issues JWTs
- **Trades**: HTLC-based P2P trades backed by a Soroban escrow contract; secrets encrypted at rest with AES-256-GCM
- **Stellar relay**: submits signed XDR transactions to Soroban RPC
- **DeFi**: CETES tokenizados (Etherfuse) and Blend Protocol pool endpoints — simulated on testnet, real on mainnet

## Quick start

```bash
cd micopay/backend
cp .env.example .env
# edit .env — minimum required: JWT_SECRET, SECRET_ENCRYPTION_KEY
npm install
npm run dev        # pino-pretty output, in-memory DB if no Postgres
```

Health check: `curl http://localhost:3000/health`

For PostgreSQL: set `DATABASE_URL` and run the migrations in `micopay/sql/`.

## Env vars

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | optional | `3000` | Server port |
| `DATABASE_URL` | optional | `postgresql://localhost:5432/micopay_dev` | PostgreSQL connection string; falls back to in-memory if unreachable |
| `JWT_SECRET` | **required** | `dev_jwt_secret` | JWT signing secret — change in production |
| `JWT_EXPIRY` | optional | `24h` | JWT token lifetime |
| `SECRET_ENCRYPTION_KEY` | **required** | — | 64-char hex string (32 bytes) for AES-256-GCM encryption of HTLC secrets |
| `PLATFORM_SECRET_KEY` | **required** (prod) | — | Stellar secret key of the platform account that signs escrow transactions |
| `ESCROW_CONTRACT_ID` | **required** (prod) | — | Soroban contract ID of the deployed escrow |
| `MXNE_CONTRACT_ID` | optional | — | MXNe token contract ID |
| `MXNE_ISSUER_ADDRESS` | optional | — | MXNe issuer Stellar address |
| `STELLAR_RPC_URL` | optional | `https://soroban-testnet.stellar.org` | Soroban RPC endpoint |
| `STELLAR_NETWORK` | optional | `TESTNET` | `TESTNET` or `MAINNET` |
| `CETES_ISSUER` | optional | Etherfuse testnet fallback | CETES token issuer address |
| `BLEND_POOL_ID` | optional | hardcoded testnet pool | Blend Protocol pool ID |
| `MOCK_STELLAR` | optional | `false` | Set `true` to skip on-chain calls and return fake hashes |
| `NODE_ENV` | optional | — | `development` → pino-pretty logs; anything else → JSON |

## Route map

### No auth required

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Server status + config check (no secrets exposed) |
| `GET` | `/account/balance` | XLM balance of the platform account via Horizon |
| `POST` | `/auth/challenge` | Issues a 5-minute challenge for a Stellar address to sign |
| `POST` | `/auth/token` | Verifies signed challenge, returns JWT |
| `POST` | `/users/register` | Creates user + wallet record, returns JWT immediately |

### JWT required

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/users/me` | Authenticated user profile |
| `POST` | `/trades` | Buyer creates trade; generates HTLC secret, stores encrypted |
| `GET` | `/trades/active` | Active trades for the caller (pending/locked/revealing) |
| `GET` | `/trades/history` | Last 20 trades (all statuses) |
| `GET` | `/trades/:id` | Trade detail — participants only |
| `POST` | `/trades/:id/lock` | Seller calls `lock()` on Soroban escrow |
| `POST` | `/trades/:id/reveal` | Seller confirms cash received; enables secret access |
| `GET` | `/trades/:id/secret` | Seller retrieves HTLC secret for QR display (state: `revealing` only) |
| `POST` | `/trades/:id/complete` | Buyer calls `release()` on Soroban with the secret |
| `POST` | `/trades/:id/cancel` | Either party cancels (only in `pending`) |
| `POST` | `/stellar/submit` | Relay a signed XDR tx to Stellar RPC — rate limited 10/min/IP |

### No auth — demo only

These routes have no `authMiddleware`. In production, add JWT protection before exposing them.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/defi/cetes/rate` | APY + XLM/USDC rate from Horizon paths |
| `POST` | `/defi/cetes/buy` | Buy CETES (simulated on testnet, real `pathPaymentStrictReceive` on mainnet) |
| `POST` | `/defi/cetes/sell` | Sell CETES (simulated on testnet; returns 501 on mainnet) |
| `GET` | `/defi/blend/pools` | Blend pool stats (mock data on testnet) |
| `POST` | `/defi/blend/supply` | Supply to Blend pool (simulated) |
| `POST` | `/defi/blend/borrow` | Borrow against collateral (simulated) |

## Services overview

- **`trade.service`** — full trade lifecycle: create → lock → reveal → secret → complete/cancel; validates participants, calculates 0.8% platform fee, enforces state machine
- **`stellar.service`** — calls `lock()` and `release()` on the Soroban escrow contract; polls Horizon for confirmation; `verifyLockOnChain` is a no-op mock when `MOCK_STELLAR=true`
- **`secret.service`** — generates 32-byte HTLC preimage, SHA-256 hash for the contract, AES-256-GCM encrypt/decrypt for DB storage

## Demo vs production flows

### MOCK_STELLAR=true (default for local dev)

- `lock` and `release` return `mock_<timestamp>` hashes — no RPC calls
- Signature verification in `/auth/token` is skipped
- In-memory store is used if `DATABASE_URL` is not set or unreachable
- `/defi/cetes/buy` and `/defi/cetes/sell` always return simulated responses

### STELLAR_NETWORK=TESTNET (default)

- Soroban RPC points to `soroban-testnet.stellar.org`
- CETES issuer is a testnet placeholder; USDC acts as proxy in rate queries
- Blend pool data is mocked

### Production (MAINNET + MOCK_STELLAR=false)

- `PLATFORM_SECRET_KEY` and `ESCROW_CONTRACT_ID` must be set
- `lock()` and `release()` submit real Soroban transactions; confirmation is polled via Horizon with 30s timeout
- `/defi/cetes/buy` executes a real `pathPaymentStrictReceive` transaction
- Signature verification in `/auth/token` uses `Keypair.verify()`
- Logger outputs JSON with `service: micopay-backend` field

## Logging categories

Logs use [pino](https://github.com/pinojs/pino) via Fastify's built-in logger. Every log line includes `reqId` (Fastify's per-request trace ID) and a `category` field for filtering.

| Category | Where | What it covers |
|---|---|---|
| `auth` | `routes/auth.ts`, `routes/users.ts` | Challenge issued, token issued, user registered, profile fetched |
| `trade.lifecycle` | `services/trade.service.ts` | Create, lock, reveal, secret access, complete, cancel |
| `stellar.tx` | `services/stellar.service.ts`, `routes/stellar.ts`, `routes/defi.ts` | Soroban lock/release simulation, send errors, confirmation, submit relay |
| `stellar.balance` | `index.ts` | Platform account balance fetch errors |
| `http` | `index.ts` | Server startup, rate-limit plugin status |

**Dev** (`NODE_ENV=development`): pino-pretty with colorized output.  
**Prod**: JSON, one object per line, includes `service: micopay-backend`.

Filter by category in prod:
```bash
# all trade events for a specific request
cat app.log | jq 'select(.category == "trade.lifecycle")'

# all Stellar errors
cat app.log | jq 'select(.category == "stellar.tx" and .level == 50)'
```

## Contributing

See [docs/DRIPS_TEAM_GUIDE.md](../../docs/DRIPS_TEAM_GUIDE.md) for contribution rules, issue design standards, and review policy.

In-scope paths for current Waves: `micopay/backend`, `micopay/frontend`.
