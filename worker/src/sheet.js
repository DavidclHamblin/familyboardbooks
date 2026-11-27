// Character sheets (test copies only for now: meta.paint.sheet, with the "mask" method).
//
// For each family member, one picture of them in every pose and expression this story needs, painted in one go so the
// face and hair stay the same across the figures. When a page is painted, the figure in the matching pose is the
// reference for that person, instead of their single standing portrait: a painter copies a face far better from a
// figure that already stands, turns and feels the way the page needs. (Not pasted on: the page is still repainted.)
//
// 1. Poses: which poses the story needs for this part, and which page uses which pose. Worked out once per story and
//    part by the checking AI from the scene descriptions, kept in R2 (style/fst/<story>/poses-<role>.v1.json, no family data).
// 2. The sheet: painted once per book from the person's drawn portrait (toon/<id>/sheet-<role>.png, a JPEG),
//    in an even grid so each figure can be cut out by position.

import { STORIES } from "./stories.js";

const RATIOS = { "1:1": 1, "2:3": 2 / 3, "3:2": 3 / 2, "3:4": 3 / 4, "4:3": 4 / 3, "4:5": 4 / 5, "5:4": 5 / 4, "9:16": 9 / 16, "16:9": 16 / 9 };
const stream = bytes => new Blob([bytes]).stream();
async function out(t, fmt, quality) { return new Uint8Array(await (await t.output({ format: fmt || "image/jpeg", quality: quality || 92 })).response().arrayBuffer()); }
function wearing(r) { return r.costume.replace(/,?\s*holding .*$/i, ""); }

// The pages this part is on, in order.
export const pagesOf = (storyKey, role) => Object.entries(STORIES[storyKey].scenes).filter(([, sc]) => (sc.cast || []).includes(role)).map(([n]) => n);

// Grid for `c` figures: up to 3 in a row, at most 2 rows (6 figures).
export function grid(c) {
  const cols = c <= 3 ? c : c === 4 ? 2 : 3, rows = c <= 3 ? 1 : 2;
  const want = cols * 3 / (rows * 4);  // portrait cells, 3:4
  const ratio = Object.entries(RATIOS).sort((a, b) => Math.abs(Math.log(a[1] / want)) - Math.abs(Math.log(b[1] / want)))[0][0];
  return { cols, rows, ratio };
}

export function posesPrompt(storyKey, role) {
  const s = STORIES[storyKey], r = s.roles[role], pages = pagesOf(storyKey, role), c = Math.min(6, pages.length);
  return "We are painting a character sheet for " + r.name + " in the children's picture book \"" + s.title + "\". " +
    "These are the pages they appear on:\n" + pages.map(n => "Page " + n + ": " + s.scenes[n].desc).join("\n") +
    "\n\nPlan exactly " + c + " different full-length poses of " + r.name + " that together cover every page: each pose says the body position, " +
    "which way they face (front, three-quarter left or right, side, back), the action and the facial expression, in under 25 words, " +
    "without other characters or props except things " + r.name + " holds. Then say which pose fits each page best. " +
    "Reply with JSON only: {\"poses\":[\"...\"], \"pages\":{\"<page>\": <pose number from 0>}}";
}

async function poses(env, deps, storyKey, role) {
  const k = "style/fst/" + storyKey + "/poses-" + role + ".v1.json";
  const o = await env.BUCKET.get(k);
  if (o) return o.json();
  const pages = pagesOf(storyKey, role), c = Math.min(6, pages.length);
  const p = await deps.checkPicture(env, [], posesPrompt(storyKey, role));
  if (!Array.isArray(p.poses) || p.poses.length < 1) throw new Error("no poses planned for " + role);
  const plan = { poses: p.poses.slice(0, c).map(String), pages: {} };
  for (const n of pages) { const i = Number((p.pages || {})[n]); plan.pages[n] = Number.isInteger(i) && i >= 0 && i < plan.poses.length ? i : 0; }
  await env.BUCKET.put(k, JSON.stringify(plan), { httpMetadata: { contentType: "application/json" } });
  return plan;
}

export function sheetPrompt(storyKey, role, list) {
  const s = STORIES[storyKey], r = s.roles[role], g = grid(list.length);
  return "IMAGE 1 is a character from our children's picture book: " + r.name + ", wearing " + wearing(r) + ". " +
    "Paint a character sheet of this EXACT person: " + list.length + " full-length figures of the same person, arranged in an even grid of " + g.cols +
    " column" + (g.cols > 1 ? "s" : "") + " and " + g.rows + " row" + (g.rows > 1 ? "s" : "") + ", each figure whole and centred in its own equal cell, " +
    "the same size in every cell, with plenty of white space round each one; nothing crosses from one cell into another. " +
    "Every figure has exactly the same face, features, skin tone, age, glasses or beard, and the hair's exact colour, length, texture and style as IMAGE 1, " +
    "and the same clothes. Cells, left to right and top to bottom: " + list.map((p, i) => (i + 1) + ") " + p).join("; ") + ". " +
    "Painted in this style: " + s.style + ". Pure white background, no lines, borders, numbers, labels or text.";
}

// The sheet for one person (painted once per book) and the figure for page n, as JPEG images.
export async function sheetPose(env, deps, id, storyKey, role, n, portrait) {
  const plan = await poses(env, deps, storyKey, role);
  const k = "toon/" + id + "/sheet-" + role + ".png";
  let o = await env.BUCKET.get(k), sheet;
  if (o) sheet = new Uint8Array(await o.arrayBuffer());
  else {
    const drawn = await deps.drawStory(env, [portrait], sheetPrompt(storyKey, role, plan.poses), grid(plan.poses.length).ratio, "2K");
    sheet = await out(env.IMAGES.input(stream(drawn.bytes)), "image/jpeg", 92);
    await env.BUCKET.put(k, sheet, { httpMetadata: { contentType: "image/jpeg" } });
    if (deps.touch) await deps.touch();
  }
  const { width: W, height: H } = await env.IMAGES.info(stream(sheet));
  const g = grid(plan.poses.length), i = plan.pages[n] ?? 0, cw = Math.floor(W / g.cols), ch = Math.floor(H / g.rows);
  const cell = await out(env.IMAGES.input(stream(sheet)).transform({ trim: { left: (i % g.cols) * cw, top: Math.floor(i / g.cols) * ch, width: cw, height: ch } }), "image/jpeg", 92);
  return { image: { bytes: cell, type: "image/jpeg" }, pose: plan.poses[i], index: i };
}
