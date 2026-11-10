# Photo and cartoon service

A Cloudflare Worker with private R2 storage in the EU. It stores customers' photos, turns them into
cartoons with an AI image model, runs the free two-page preview, unlocks the full book when Shopify
says an order is paid, and deletes everything on schedule.

## Set up (once)

1. Create a free Cloudflare account and turn on two-step sign-in.
2. From this folder:
   ```
   npx wrangler login
   npx wrangler r2 bucket create fbb-photos --jurisdiction eu
   npx wrangler r2 bucket lifecycle add fbb-photos orig-backstop orig/ --expire-days 90 --jurisdiction eu -y
   npx wrangler deploy
   ```
3. Secrets (each command asks for the value; nothing is written to files):
   ```
   npx wrangler secret put GEMINI_API_KEY        # or OPENAI_API_KEY
   npx wrangler secret put ADMIN_TOKEN           # any long random string
   npx wrangler secret put SHOPIFY_WEBHOOK_SECRET
   ```
4. In `wrangler.toml` set `ENGINE` to `gemini` or `openai` (it starts as `mock`, which returns the
   photo unchanged so the whole flow can be tested for free), then deploy again.
5. Shopify: Settings → Notifications → Webhooks → create an **Order payment** webhook (JSON) pointing to
   `https://familyboardbooks-api.<your-subdomain>.workers.dev/api/shopify/orders-paid`.
   Shopify shows the signing secret on that page: that is `SHOPIFY_WEBHOOK_SECRET`.
6. Website: put the Worker address in `assets/js/data.js` → `FBB.config.api`. The free preview and the
   proof page switch on as soon as this is set.

Optional: style reference pictures go in the bucket under `styles/<style>/1.png` (and `2.png`);
they are sent to the model with every photo so all cartoons share one look.

## Rules it enforces

- Free preview: 6 cartoons (two pages) and 10 tries per book before payment (`FREE_SLOTS`, `FREE_GENS`).
- At most 5 new books per minute from one connection.
- Unpaid previews are deleted after 14 days; originals 60 days after payment at the latest
  (immediately when marked printed); cartoons 30 days after delivery unless the customer chose to keep them.
- Mark an order printed or delivered:
  `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"status":"printed"}' https://…/api/admin/drafts/<id>/status`

## Test locally

`npx wrangler dev` (with a `.dev.vars` file setting `ALLOWED_ORIGINS="http://localhost:8765"`), serve `dist/`
on port 8765, and in the browser console run `localStorage.setItem("fbb-api","http://127.0.0.1:8787")`.
