// Emails our own service sends to customers (Shopify sends the order emails itself): reminders before a
// customer's files are deleted, and problem reports to us. Sent through Zoho ZeptoMail's EU API.
//
// Secret, set by David: MAIL_API_KEY (ZeptoMail "Send Mail" token). Each brand's sending address must be on a
// domain verified in ZeptoMail. Without the key nothing is sent, and the clean-up never deletes a customer's
// files without having sent its reminders.
//
// BRANDS (wrangler.toml) gives each SKU prefix its name, website and hello@ address, so a customer hears
// from the brand they ordered from.

export function mailReady(env) { return !!env.MAIL_API_KEY; }

export function brands(env) {
  try { return JSON.parse(env.BRANDS || "{}"); } catch { return {}; }
}
export function brandFor(env, code) {
  const all = brands(env);
  return all[code] || all.default || { name: "Our Family Presents", site: "https://www.ourfamilypresents.com", email: "hello@familyboardbooks.com" };
}

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// A plain, friendly email in the brand's name. `paras` are HTML strings (escape any customer text first).
export function letter(brand, paras, button) {
  const btn = button ? `<p style="margin:24px 0"><a href="${esc(button.url)}" style="background:#EE4B2B;color:#fff;padding:12px 20px;border-radius:22px;text-decoration:none;font-weight:700">${esc(button.label)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#FDFCFA;font-family:Arial,Helvetica,sans-serif;color:#1E1A33">
<div style="max-width:560px;margin:0 auto;padding:28px 20px;font-size:16px;line-height:1.5">
<p style="font-size:20px;font-weight:800;margin:0 0 20px">${esc(brand.name)}</p>
${paras.map(p => `<p style="margin:0 0 14px">${p}</p>`).join("\n")}${btn}
<p style="margin:24px 0 0;color:#6b6780;font-size:13px">${esc(brand.name)} is part of Our Family Presents. Questions? Reply to this email or write to <a href="mailto:${esc(brand.email)}">${esc(brand.email)}</a>.</p>
</div></body></html>`;
}

// attachments: [{ name, mime_type, content (base64) }]
export async function sendMail(env, { brand, to, subject, html, replyTo, attachments }) {
  if (!mailReady(env)) throw new Error("Email is not set up");
  const body = {
    from: { address: brand.email, name: brand.name },
    to: [{ email_address: { address: to } }],
    reply_to: [{ address: replyTo || brand.email }],
    subject, htmlbody: html
  };
  if (attachments && attachments.length) body.attachments = attachments;
  const res = await fetch(env.MAIL_API_URL || "https://api.zeptomail.eu/v1.1/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Zoho-enczapikey " + env.MAIL_API_KEY.trim() },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error("Email " + res.status + ": " + (await res.text()).slice(0, 300));
  return true;
}
