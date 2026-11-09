# Token Price API — x402 paid API for vAPI Call

Live USD price for any BSC token contract address. Paid per call: **$0.001 USDC on Base**.
Payout goes to the vAPI owner wallet `0x99f679a59102a4a442409c41c1c0dcf62465b0ed`.

## Endpoints

- `GET /health` — free, `{ok:true}`
- `GET /openapi.json` — free, OpenAPI 3 document (what vAPI Call discovers)
- `GET /price?token=0x...` — **paid $0.001**. Without payment it returns `402` with the
  x402 challenge; with a valid `X-PAYMENT` header it returns
  `{token, symbol, name, priceUsd, pairAddress, dex}` from DexScreener.

Example (unpaid → 402):

```bash
curl "https://YOUR-APP.railway.app/price?token=0x55d398326f99059fF775485246999027B3197955"
# → 402, accepts: exact / base / 1000 (= $0.001 USDC) / payTo 0x99f6…b0ed
```

## Deploy (Vercel — recommended, free)

1. Push this folder to a GitHub repo.
2. Vercel → Add New → Project → Import the repo. Framework: **Other**. No build
   command needed (the `api/index.js` serverless entry handles everything).
3. Deploy. Vercel gives you a public URL, e.g. `https://vapi-price-api.vercel.app`.
4. Replace `PLACEHOLDER.railway.app` in `openapi.json` with that URL and redeploy.
5. In vAPI Call → My APIs → Add your API, paste:
   `https://YOUR-APP.vercel.app/openapi.json`
   then Check endpoint → verify the live x402 challenge → confirm the payout
   wallet (0x99f6…b0ed) → Save.

Note: Vercel Hobby functions time out after 10s — the price lookup + x402
verify/settle normally finish in 1–3s, so it fits.

## Deploy (Railway, alternative)

1. Push this folder to a GitHub repo.
2. Railway → New Project → Deploy from GitHub repo.
3. Railway gives you a public URL, e.g. `https://vapi-price-api.up.railway.app`.
4. Replace `PLACEHOLDER.railway.app` in `openapi.json` with that URL and redeploy.
5. Same vAPI steps as above, with the Railway URL.

## Local test

```bash
npm install
npm start
curl http://localhost:3000/health
curl "http://localhost:3000/price?token=0x55d398326f99059fF775485246999027B3197955"
# expect 402 with the x402 challenge
```

Env vars: `PAY_TO` (default owner wallet), `PRICE` (default `$0.001`), `PORT` (default 3000).

## Status

- 402 challenge verified locally 2026-11-10: correct network (base), amount (1000 = $0.001
  USDC), asset (USDC on Base), payTo (owner wallet).
- Paid end-to-end call NOT yet tested — needs a payer wallet funded with Base USDC.
  Test after deploy with: `vapi pay '<url>/price?token=...' --method GET --network eip155:8453 --expected-pay-to 0x99f679a59102a4a442409c41c1c0dcf62465b0ed --max 0.001`
