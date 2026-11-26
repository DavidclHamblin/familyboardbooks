// Replicate (replicate.com), for two jobs the painters can't do well on their own (test copies only for now):
//   faceSwap:  put a person's face and hair from their drawn portrait onto their character in a picture, so they
//              look the same on every page (model REPLICATE_SWAP_MODEL, default easel/advanced-face-swap).
//   faceMatch: measure how alike two faces are, as a number, to pick the best of several tries
//              (model REPLICATE_MATCH_MODEL, default apna-mart/face-match).
// Needs the secret REPLICATE_API_TOKEN. Each model's input names are read from its own published schema (kept in
// R2 for a day), so we don't depend on guessing them.

const API = "https://api.replicate.com/v1/";
const SWAP = "easel/advanced-face-swap", MATCH = "apna-mart/face-match";

export const replicateReady = env => !!env.REPLICATE_API_TOKEN;
const swapModel = env => env.REPLICATE_SWAP_MODEL || SWAP;
const matchModel = env => env.REPLICATE_MATCH_MODEL || MATCH;

function headers(env, extra) { return Object.assign({ Authorization: "Bearer " + env.REPLICATE_API_TOKEN, "Content-Type": "application/json" }, extra || {}); }

function b64(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
// A JPEG data URI no larger than `max` pixels on its long side (Replicate takes data URIs; best under 1 MB).
export async function dataUri(env, im, max) {
  const t = env.IMAGES.input(new Blob([im.bytes]).stream()).transform({ width: max || 1024, height: max || 1024, fit: "scale-down" });
  const bytes = await (await t.output({ format: "image/jpeg", quality: 90 })).response().arrayBuffer();
  return "data:image/jpeg;base64," + b64(bytes);
}

// A model's input fields: { name: { type, format, enum, default, description } }.
export async function inputsOf(env, model) {
  const key = "replicate/schema/" + model.replace(/[^a-z0-9._-]/gi, "_") + ".json";
  const o = await env.BUCKET.get(key);
  if (o && Date.now() - Number((o.customMetadata || {}).at || 0) < 86400000) return o.json();
  const res = await fetch(API + "models/" + model, { headers: headers(env) });
  if (!res.ok) throw new Error("Replicate " + model + ": " + res.status + " " + (await res.text()).slice(0, 150));
  const m = await res.json(), v = m.latest_version || {};
  const schemas = (v.openapi_schema && v.openapi_schema.components && v.openapi_schema.components.schemas) || {};
  const props = (schemas.Input && schemas.Input.properties) || {};
  // Enums live in their own schemas ("allOf": [{ "$ref": "#/components/schemas/hair_source" }]).
  const out = {};
  for (const [k, p] of Object.entries(props)) {
    const ref = p.allOf && p.allOf[0] && p.allOf[0].$ref ? schemas[p.allOf[0].$ref.split("/").pop()] : null;
    out[k] = { type: p.type || (ref && ref.type), format: p.format, enum: p.enum || (ref && ref.enum), default: p.default, description: (p.description || "").slice(0, 120) };
  }
  const info = { version: v.id || null, inputs: out };
  await env.BUCKET.put(key, JSON.stringify(info), { httpMetadata: { contentType: "application/json" }, customMetadata: { at: String(Date.now()) } });
  return info;
}

// Run a model and wait for its output (sync mode, then polling, up to `ms`).
export async function run(env, model, input, ms) {
  const deadline = Date.now() + (ms || 180000);
  const res = await fetch(API + "models/" + model + "/predictions", { method: "POST", headers: headers(env, { Prefer: "wait=60" }), body: JSON.stringify({ input }) });
  let p = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Replicate " + model + ": " + res.status + " " + JSON.stringify(p).slice(0, 200));
  while (p.status === "starting" || p.status === "processing") {
    if (Date.now() > deadline) throw new Error("Replicate " + model + ": timed out");
    await new Promise(r => setTimeout(r, 3000));
    p = await (await fetch(p.urls.get, { headers: headers(env) })).json();
  }
  if (p.status !== "succeeded") throw new Error("Replicate " + model + ": " + p.status + " " + String(p.error || "").slice(0, 200));
  return p.output;
}

const find = (inputs, re, not) => Object.keys(inputs).find(k => re.test(k) && !(not && not.test(k)));
const isImage = p => p && (p.format === "uri" || /image|uri/i.test(p.description || ""));

// The field names for the face swap: which image gives the face, which is changed, and how to keep the portrait's hair.
export function swapFields(inputs) {
  const imgs = Object.keys(inputs).filter(k => isImage(inputs[k]) || /image|_url$/i.test(k));
  const target = imgs.find(k => /target|base|input_image|^image$/i.test(k));
  const source = imgs.find(k => k !== target && /swap|source|face|user/i.test(k) && !/_b$|_1$|second/i.test(k)) || imgs.find(k => k !== target);
  const hair = find(inputs, /hair/i) || Object.keys(inputs).find(k => (inputs[k].enum || []).some(v => /hair/i.test(String(v))));
  return { source, target, hair };
}

// Put the face (and hair) from `face` onto the person in `picture`. Both { bytes }; returns JPEG/PNG bytes.
export async function faceSwap(env, face, picture, gender) {
  const { inputs } = await inputsOf(env, swapModel(env));
  const f = swapFields(inputs);
  if (!f.source || !f.target) throw new Error("face swap: can't tell the image fields apart (" + Object.keys(inputs).join(",") + ")");
  const input = { [f.source]: await dataUri(env, face, 1024), [f.target]: await dataUri(env, picture, 1280) };
  if (f.hair) {
    const e = inputs[f.hair].enum || [];
    const keep = e.find(v => /user|swap|source|face/i.test(String(v)) && !/target/i.test(String(v)));  // the portrait's hair
    if (keep != null) input[f.hair] = keep;
  }
  const g = find(inputs, /gender/i, /_b$|_1$/);
  if (g && gender && inputs[g].enum) { const v = inputs[g].enum.find(x => new RegExp(gender, "i").test(String(x))); if (v != null) input[g] = v; }
  if (inputs.upscale) input.upscale = false;  // we fit it back to the box ourselves
  const out = await run(env, swapModel(env), input);
  const url = Array.isArray(out) ? out[0] : (out && typeof out === "object" ? (out.image || out.output || Object.values(out)[0]) : out);
  if (typeof url !== "string") throw new Error("face swap: no picture back (" + JSON.stringify(out).slice(0, 120) + ")");
  const r = await fetch(url);
  if (!r.ok) throw new Error("face swap: picture download " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// How alike the faces in two pictures are: a number, higher is more alike (null when a face isn't found).
// The model's answer shape isn't documented, so the score is read from the first number whose name says
// similarity or score (a distance is turned round).
export function readScore(out) {
  let best = null;
  const walk = (o, depth) => {
    if (!o || typeof o !== "object" || depth > 4 || best != null) return;
    for (const [k, v] of Object.entries(o)) {
      if (best != null) return;
      if (typeof v === "number" && /similar|score|cosine/i.test(k) && !/thresh|quality|confidence|det/i.test(k)) best = v;
      else if (typeof v === "number" && /distance/i.test(k)) best = 1 - v;
      else if (v && typeof v === "object") walk(v, depth + 1);
    }
  };
  walk(typeof out === "string" ? (() => { try { return JSON.parse(out); } catch (e) { return null; } })() : out, 0);
  return best;
}
// FLUX Kontext as the painter of a box (REPLICATE_KONTEXT_MODEL, default flux-kontext-apps/multi-image-kontext-pro,
// which takes two pictures: the box from our page, then the person's close-up face).
const KONTEXT = "flux-kontext-apps/multi-image-kontext-pro";
export async function kontextPaint(env, pictures, prompt) {
  const model = env.REPLICATE_KONTEXT_MODEL || KONTEXT;
  const { inputs } = await inputsOf(env, model);
  const imgs = Object.keys(inputs).filter(k => /image/i.test(k) && (isImage(inputs[k]) || /_\d$|^input_image/.test(k))).sort();
  if (!imgs.length) throw new Error("kontext: unexpected inputs (" + Object.keys(inputs).join(",") + ")");
  const input = { prompt };
  for (let i = 0; i < Math.min(imgs.length, pictures.length); i++) input[imgs[i]] = await dataUri(env, pictures[i], 1280);
  const ar = find(inputs, /aspect/i);
  if (ar && (inputs[ar].enum || []).includes("match_input_image")) input[ar] = "match_input_image";
  const fmt = find(inputs, /output_format/i);
  if (fmt && (inputs[fmt].enum || []).includes("jpg")) input[fmt] = "jpg";
  const out = await run(env, model, input);
  const url = Array.isArray(out) ? out[0] : out;
  if (typeof url !== "string") throw new Error("kontext: no picture back");
  const r = await fetch(url);
  if (!r.ok) throw new Error("kontext: picture download " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

export async function faceMatch(env, a, b) {
  const { inputs } = await inputsOf(env, matchModel(env));
  const imgs = Object.keys(inputs).filter(k => /image/i.test(k)).sort();
  if (imgs.length < 2) throw new Error("face match: unexpected inputs (" + Object.keys(inputs).join(",") + ")");
  const input = { [imgs[0]]: await dataUri(env, a, 1024), [imgs[1]]: await dataUri(env, b, 1024) };
  if (inputs.include_face_crops) input.include_face_crops = false;
  const out = await run(env, matchModel(env), input, 120000);
  return { score: readScore(out), raw: JSON.stringify(out).slice(0, 300) };
}
