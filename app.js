import express from "express";
import cors from "cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { declareDiscoveryExtension, bazaarResourceServerExtension } from "@x402/extensions/bazaar";
import { readFileSync } from "fs";

// Payout wallet: the vAPI owner wallet. Every paid call settles here.
const PAY_TO = process.env.PAY_TO || "0x99f679a59102a4a442409c41c1c0dcf62465b0ed";
const PRICE = process.env.PRICE || "$0.001";
const PORT = process.env.PORT || 3000;

// PayAI public facilitator: x402 v2 `exact` on Base mainnet (eip155:8453),
// no signup/API key; ~1,000 free credits, ~1.79 credits per Base settlement.
// x402.org/facilitator is testnets-only for v2, so it cannot settle Base mainnet.
const FACILITATOR_URL = process.env.FACILITATOR_URL || "https://facilitator.payai.network";

const app = express();
app.use(express.json());
// Expose the x402 payment headers so browser callers can read them.
app.use(
  cors({
    exposedHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"],
  })
);

app.get("/health", (_req, res) => res.json({ ok: true, service: "vapi-price-api" }));

// OpenAPI document for vAPI Call discovery (unpaid, public).
app.get("/openapi.json", (_req, res) => {
  res.json(JSON.parse(readFileSync(new URL("./openapi.json", import.meta.url), "utf8")));
});

const facilitatorClient = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
const resourceServer = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453", new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

// Paid route: $0.001 USDC on Base per call (x402 v2).
app.use(
  paymentMiddleware(
    {
      "GET /price": {
        accepts: [
          {
            scheme: "exact",
            price: PRICE,
            network: "eip155:8453",
            payTo: PAY_TO,
            maxTimeoutSeconds: 60,
          },
        ],
        description: "Live USD price for a BSC token contract address (DexScreener).",
        mimeType: "application/json",
        serviceName: "Token Price API",
        tags: ["price", "bsc", "dexscreener"],
        extensions: declareDiscoveryExtension({
          input: { token: "0x55d398326f99059fF775485246999027B3197955" },
          inputSchema: {
            type: "object",
            properties: {
              token: {
                type: "string",
                description: "BSC token contract address, e.g. 0x55d398326f99059fF775485246999027B3197955 (USDT)",
              },
            },
            required: ["token"],
          },
          output: {
            example: {
              token: "0x55d398326f99059fF775485246999027B3197955",
              symbol: "USDT",
              name: "Tether USD",
              priceUsd: "1.0",
              pairAddress: "0x16b9a82891338f9ba80e2d6970fdda79d1eb0e36",
              dex: "pancakeswap",
            },
            schema: {
              type: "object",
              properties: {
                token: { type: "string" },
                symbol: { type: "string" },
                name: { type: "string" },
                priceUsd: { type: "string" },
                pairAddress: { type: "string" },
                dex: { type: "string" },
              },
            },
          },
        }),
      },
    },
    resourceServer
  )
);

const ADDR = /^0x[0-9a-fA-F]{40}$/;

app.get("/price", async (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!ADDR.test(token)) {
    return res.status(400).json({ error: "token must be a 0x BSC contract address, e.g. ?token=0x55d398326f99059fF775485246999027B3197955" });
  }
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return res.status(502).json({ error: "price source unavailable", status: r.status });
    const j = await r.json();
    const pairs = (j.pairs || []).filter((p) => p.chainId === "bsc" && p.priceUsd);
    const best = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0] || (j.pairs || [])[0];
    if (!best) return res.status(404).json({ error: "no BSC pair found for this token" });
    return res.json({
      token,
      symbol: best.baseToken?.symbol || null,
      name: best.baseToken?.name || null,
      priceUsd: best.priceUsd,
      pairAddress: best.pairAddress,
      dex: best.dexId,
    });
  } catch (e) {
    return res.status(502).json({ error: "price source error", detail: String(e).slice(0, 120) });
  }
});

export default app;
