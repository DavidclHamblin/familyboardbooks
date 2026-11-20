# Photo and cartoon service

Live at https://familyboardbooks-api.silent-forest-c98a.workers.dev (Cloudflare account: David@familyboardbooks.com).
Cloudflare deploys it automatically from the `worker/` folder whenever `main` changes on GitHub.

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

## Printing (Lulu)

Hardcover books are printed by Lulu through its Print API. One Lulu account serves every brand.

- Secrets: `LULU_CLIENT_KEY` and `LULU_CLIENT_SECRET` (Cloudflare → Workers & Pages → familyboardbooks-api →
  Settings → Variables and Secrets, type Secret).
- `LULU_ENV` in `wrangler.toml`: `sandbox` (Lulu's test system, nothing printed or charged) or `live`.
  Sandbox and live have different keys.
- `PRINT_PRODUCTS` in `wrangler.toml`: one row per book product (brand prefix, Lulu `pod_package_id`, pages).
  A new brand adds rows here.
- Price check: `GET /api/print/quote?product=storybook` gives print cost, postage and VAT to the UK and Spain,
  and the cover size. `&pkg=` and `&pages=` try another Lulu format. It orders nothing; answers are kept a day.
- Sending orders (`src/printing.js`): when a customer approves a paid book whose draft `book` starts with a
  product's `bookPrefix`, the book joins the print queue. Every 10 minutes the cron takes each queued book one step:
  make the two PDFs with Cloudflare's built-in browser (binding `BROWSER`, from the product's `printUrl`), send the
  job to Lulu, then follow Lulu's status until shipped. The delivery address is copied from the paid Shopify order
  and deleted with the draft. Lulu downloads the PDFs from `/api/print/files/<draft>/<secret>/…`.
- At most one book's PDFs are made per run (the free plan allows 10 browser minutes a day).
- Trial run: `GET /api/print/test?part=interior` (or `cover`) makes our example book's PDF at full print size with
  Cloudflare's browser and reports the time and size; the file is at `/api/print/test/interior.pdf`. One run per
  10 minutes; no customer data.
- Screen copies: `GET /api/drafts/<id>/cartoons/<slot>?w=web` returns a 1600px WebP made once with Cloudflare Images
  (binding `IMAGES`), so proof pages don't download print-size pictures. Without the binding it sends the full picture.
- A printed book can only be approved once every story scene is drawn at print size (2K or 4K).
