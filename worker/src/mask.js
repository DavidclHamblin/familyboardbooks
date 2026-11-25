// Storybook pages, "mask" method (meta.paint.method === "mask"): our example page is kept exactly, and only a
// box around each family member is repainted and blended back in with soft edges.
//
// 1. Our example page at print size ("master", painted once per scene and kept in R2 for every family).
// 2. Where each character stands on it (boxes found once per scene by an AI that answers in words, kept in R2).
// 3. For each family member: cut their box out of the page, have it repainted with their portrait, and blend it
//    back with a soft edge (Cloudflare Images draws it on; the soft edge is our own PNG with a feathered alpha).
// 4. The same check as the swap method (swap.js); people who fail are repainted again, up to CHECK_ROUNDS times.

import decodeJpeg from "./vendor/jpeg-decoder.cjs";
import { STORIES } from "./stories.js";
import { checkPrompt, judge } from "./swap.js";

const CHECK_ROUNDS = 3, RATIOS = { "1:1": 1, "2:3": 2 / 3, "3:2": 3 / 2, "3:4": 3 / 4, "4:3": 4 / 3, "4:5": 4 / 5, "5:4": 5 / 4, "9:16": 9 / 16, "16:9": 16 / 9 };
const MASTER = "Repaint IMAGE 1 exactly as it is, at full quality: the same composition, characters, faces, setting, colours and painting style, and the same empty area for the words. Change nothing. No text or letters.";

function wearing(r) { return r.costume.replace(/,?\s*holding .*$/i, ""); }

export function boxPrompt(storyKey, cast) {
  const s = STORIES[storyKey];
  return "IMAGE 1 is a page of a children's picture book. Find each of these characters: " +
    cast.map(role => "\"" + role + "\" = " + s.roles[role].name + " (wearing " + wearing(s.roles[role]) + ")").join("; ") +
    ". For each, give one box around their WHOLE body, including hair, hat, hands and anything they hold. " +
    "Reply with JSON only: {\"<key>\": [ymin, xmin, ymax, xmax]} with whole numbers from 0 to 1000, relative to the picture's height (y) and width (x).";
}

export function cropPrompt(storyKey, role) {
  const s = STORIES[storyKey], r = s.roles[role];
  return "IMAGE 1 is a close-up cut from a page of our children's picture book. It shows " + r.name + " (wearing " + wearing(r) + "). " +
    "IMAGE 2 is a portrait of a real family member. Repaint IMAGE 1 so that " + r.name + " becomes the person in IMAGE 2: take from IMAGE 2 the face shape and features, " +
    "eyes, eyebrows, nose, mouth and smile, skin tone, the hair's exact colour, length, texture and style, their age, and any glasses, beard or freckles. " +
    "Keep their pose, position, size, expression and clothes exactly as in IMAGE 1, and paint them in IMAGE 1's own style (" + s.style + "), not IMAGE 2's finish. " +
    "Keep everything else in IMAGE 1 exactly as it is: the background, the edges of the picture and any other character who is partly in view must not change at all. " +
    "Ignore IMAGE 2's background, pose and anything they are holding. No text or letters.";
}

// A box (0-1000 from the AI) as a pixel rectangle around the character, padded and shaped to an aspect ratio
// the painter can draw, inside the page.
export function rectFor(box, W, H) {
  let [y0, x0, y1, x1] = box.map(Number);
  if (![y0, x0, y1, x1].every(Number.isFinite) || y1 <= y0 || x1 <= x0) throw new Error("bad box");
  let x = x0 / 1000 * W, y = y0 / 1000 * H, w = (x1 - x0) / 1000 * W, h = (y1 - y0) / 1000 * H;
  const px = w * 0.12, py = h * 0.08;
  x -= px; y -= py * 1.5; w += px * 2; h += py * 2.5;  // a little more room above, for hair and hats
  const want = w / h;
  const [ratio, r] = Object.entries(RATIOS).sort((a, b) => Math.abs(Math.log(a[1] / want)) - Math.abs(Math.log(b[1] / want)))[0];
  if (r > want) { const nw = h * r; x -= (nw - w) / 2; w = nw; } else { const nh = w / r; y -= (nh - h) / 2; h = nh; }
  if (w > W) { w = W; } if (h > H) { h = H; }
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
  return { left: Math.round(x), top: Math.round(y), width: Math.round(w), height: Math.round(h), ratio };
}

const stream = bytes => new Blob([bytes]).stream();
async function out(t, fmt, quality) { return new Uint8Array(await (await t.output({ format: fmt || "image/jpeg", quality: quality || 95 })).response().arrayBuffer()); }

// ---------- a small PNG writer (RGBA, no filtering), for the soft-edged patch ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const o = new Uint8Array(12 + data.length), dv = new DataView(o.buffer);
  dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) o[4 + i] = type.charCodeAt(i);
  o.set(data, 8); dv.setUint32(8 + data.length, crc32(o.subarray(4, 8 + data.length)));
  return o;
}
export async function encodePng(rgba, w, h) {
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const z = new Uint8Array(await new Response(stream(raw).pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", z), chunk("IEND", new Uint8Array(0))];
  const o = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0;
  for (const p of parts) { o.set(p, i); i += p.length; }
  return o;
}
// Soft edge: full strength in the middle, fading to nothing over the outer `f` pixels (smoothstep).
// Sides that touch the page's own edge stay full strength, so the page edge doesn't fade.
export function feather(rgba, w, h, f, keep) {
  const k = keep || {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.min(k.left ? f : x, k.right ? f : w - 1 - x, k.top ? f : y, k.bottom ? f : h - 1 - y);
    const t = Math.max(0, Math.min(1, d / f)), a = t * t * (3 - 2 * t);
    rgba[(y * w + x) * 4 + 3] = Math.round(255 * a);
  }
  return rgba;
}

// Our example page at print size, painted once per scene and kept.
async function master(env, deps, key, n) {
  const k = "style/fst/" + key + "/s" + n + ".master.jpg";
  const o = await env.BUCKET.get(k);
  if (o) return new Uint8Array(await o.arrayBuffer());
  const example = await deps.storybookArt(env, key, "s" + n);
  if (!example) throw new Error("our example page s" + n + " is missing");
  const drawn = await deps.drawStory(env, [example], MASTER, "16:9", env.PRINT_IMAGE_SIZE || "4K");
  if (!/^[24]K$/.test(drawn.size || "") || drawn.engine === "openai") throw new Error("our example page came back too small");
  const jpg = await out(env.IMAGES.input(stream(drawn.bytes)), "image/jpeg", 95);
  await env.BUCKET.put(k, jpg, { httpMetadata: { contentType: "image/jpeg" } });
  return jpg;
}
// Where each character is on our example page, found once per scene and kept.
async function boxes(env, deps, key, n, cast, page) {
  const k = "style/fst/" + key + "/s" + n + ".boxes.json";
  const o = await env.BUCKET.get(k);
  const have = o ? await o.json() : {};
  if (cast.every(r => Array.isArray(have[r]))) return have;
  const found = await deps.checkPicture(env, [{ bytes: page, type: "image/jpeg" }], boxPrompt(key, cast));
  for (const r of cast) if (!Array.isArray(found[r]) || found[r].length !== 4) throw new Error("couldn't find " + r + " on our example page");
  await env.BUCKET.put(k, JSON.stringify(found), { httpMetadata: { contentType: "application/json" } });
  return found;
}

// Repaint one character's box on `page` (JPEG bytes) and blend it back. Returns the new page (JPEG bytes).
async function repaintBox(env, deps, key, role, page, rect, W, H, portrait) {
  const crop = await out(env.IMAGES.input(stream(page)).transform({ trim: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } }), "image/jpeg", 95);
  const drawn = await deps.drawStory(env, [{ bytes: crop, type: "image/jpeg" }, portrait], cropPrompt(key, role), rect.ratio, "2K");
  const fitted = await out(env.IMAGES.input(stream(drawn.bytes)).transform({ width: rect.width, height: rect.height, fit: "cover" }), "image/jpeg", 95);
  const img = decodeJpeg(fitted, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  if (img.width !== rect.width || img.height !== rect.height) throw new Error("repainted box came back " + img.width + "x" + img.height);
  const f = Math.max(12, Math.round(Math.min(rect.width, rect.height) * 0.08));
  feather(img.data, img.width, img.height, f, { left: rect.left === 0, top: rect.top === 0, right: rect.left + rect.width >= W, bottom: rect.top + rect.height >= H });
  const patch = await encodePng(img.data, img.width, img.height);
  const next = await out(env.IMAGES.input(stream(page)).draw(env.IMAGES.input(stream(patch)), { left: rect.left, top: rect.top }), "image/jpeg", 95);
  return { page: next, engine: drawn.engine, skipped: drawn.skipped || [] };
}

// Paint scene n of a family's book. deps: drawStory, storybookArt, loadImage, checkPicture, touch.
export async function paintMask(env, id, key, story, n, deps, note) {
  if (!env.IMAGES) throw new Error("the mask method needs Cloudflare Images (binding IMAGES)");
  const sc = story.scenes[n], touch = deps.touch || (async () => {});
  const cast = sc.cast.slice().sort((a, b) => (a === "hero") - (b === "hero"));
  const portraits = {};
  for (const role of cast) {
    const p = await deps.loadImage(env, "toon/" + id + "/c-" + role + ".png");
    if (!p) throw new Error("character " + role + " missing");
    portraits[role] = p;
  }
  let page = await master(env, deps, key, n); await touch();
  const { width: W, height: H } = await env.IMAGES.info(stream(page));
  const engines = new Set(["gemini"]), skipped = [];
  let check = { ok: true, rounds: 0, notes: "no family on this page" };
  if (cast.length) {
    const found = await boxes(env, deps, key, n, cast, page);
    const rects = Object.fromEntries(cast.map(r => [r, rectFor(found[r], W, H)]));
    const example = await deps.storybookArt(env, key, "s" + n);
    let todo = cast.slice(), rounds = 0;
    for (;;) {
      rounds++;
      for (const role of todo) {
        const r = await repaintBox(env, deps, key, role, page, rects[role], W, H, portraits[role]);
        page = r.page; engines.add(r.engine); skipped.push(...r.skipped); await touch();
      }
      try {
        check = judge(await deps.checkPicture(env, [{ bytes: page, type: "image/jpeg" }, example].concat(cast.map(r => portraits[r])), checkPrompt(key, cast)), cast);
      } catch (e) { check = { ok: null, notes: "check failed: " + String(e.message || e).slice(0, 120) }; break; }
      if (check.ok || rounds >= CHECK_ROUNDS) break;
      // Everyone the check didn't like is repainted again (a size problem can only come from the box: all of them).
      todo = check.fails.length ? cast.filter(r => check.fails.includes(r)) : cast.slice();
    }
    check = Object.assign(check, { rounds, boxes: Object.fromEntries(cast.map(r => [r, rects[r]])) });
  }
  if (note) {
    const drawn = await deps.drawStory(env, [{ bytes: page, type: "image/jpeg" }], "IMAGE 1 is a finished page of a children's picture book. Make this one change the family asked for, if it fits a children's picture book: “" + note +
      "”. Keep everything else exactly as it is. No text or letters.", "16:9", env.PRINT_IMAGE_SIZE || "4K");
    return { out: Object.assign(drawn, { skipped }), check: Object.assign(check, { engines: [...engines].join(","), at: Date.now() }) };
  }
  return { out: { bytes: page, type: "image/jpeg", engine: "gemini", size: env.PRINT_IMAGE_SIZE || "4K", skipped }, check: Object.assign(check, { engines: [...engines].join(","), at: Date.now() }) };
}
