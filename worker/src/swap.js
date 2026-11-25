// Storybook pages, "swap" method (meta.paint.method === "swap"): start from our own finished example page and
// change one family member at a time, as an edit, so the page keeps our layout, sizes and finish. Then a quick
// look by an AI checks the page against the family's portraits and our example page, and what fails is
// painted again (up to CHECK_ROUNDS times). A page that still fails is kept but flagged, and the book is held.
//
// Why: painting the whole page from the example page plus every portrait at once let the example family win on
// some pages (a generic child), the portrait win on others (too big, a different finish), and nothing noticed.

import { STORIES } from "./stories.js";

const CHECK_ROUNDS = 3;

// The costume as it looks in our example page, without what the character holds in that scene.
function wearing(r) { return r.costume.replace(/,?\s*holding .*$/i, ""); }

export function swapPrompt(storyKey, role, others) {
  const s = STORIES[storyKey], r = s.roles[role];
  return "IMAGE 1 is a finished double-page spread from our children's picture book. IMAGE 2 is a portrait of a real family member. " +
    "Edit IMAGE 1 and change ONE character only: " + r.name + " (in IMAGE 1, the one wearing " + wearing(r) + ") must become the person in IMAGE 2. " +
    "Take from IMAGE 2 only who they are: the face shape and features, eyes, eyebrows, nose, mouth and smile, skin tone, the hair's exact colour, length, texture and style, " +
    "their age, and any glasses, beard or freckles. Everything else about that character stays exactly as in IMAGE 1: the pose, the action, where they are, " +
    "how big they are in the picture, the expression and the clothes. Paint the change in IMAGE 1's own style, matching its outlines, brushwork, colours and light " +
    "(" + s.style + "), never IMAGE 2's finish, so it does not look pasted in. Change nothing else: " + (others ? "every other character, " : "") +
    "the setting, props, composition, framing and the empty area for the words stay exactly as they are. " +
    "Ignore IMAGE 2's background, pose and anything they are holding. No text, letters or speech bubbles.";
}

function notePrompt(note) {
  return "IMAGE 1 is a finished page of a children's picture book. Make this one change the family asked for, if it fits a children's picture book: “" + note +
    "”. Keep everything else exactly as it is: every character's face, hair, size and place, the setting, the style and the empty area for the words. No text or letters.";
}

// Our page with nobody from the family in it: redrawn at print size, unchanged.
const AS_IS = "Repaint IMAGE 1 exactly as it is, at full quality: the same composition, characters, setting, colours and painting style, and the same empty area for the words. Change nothing. No text or letters.";

export function checkPrompt(storyKey, cast) {
  const s = STORIES[storyKey];
  const list = cast.map((role, i) => "\"" + role + "\" = " + s.roles[role].name + " (portrait: IMAGE " + (i + 3) + ")").join("; ");
  return "You are checking a personalised children's picture book before it is printed. IMAGE 1 is the finished page. IMAGE 2 is our original example page for the same scene, " +
    "painted with a DIFFERENT family. The images after that are portraits of this book's family: " + list + ". " +
    "For each of these characters, find them in IMAGE 1 and answer three questions. " +
    "family: is this clearly the person in their portrait (face, hair colour, length and texture, skin tone, age, glasses or beard), and NOT the person who plays that part in IMAGE 2? " +
    "Be strict: if the face or hair looks more like IMAGE 2's person than the portrait, family is false. " +
    "size: are they about the same size and in about the same place as that character in IMAGE 2? " +
    "style: are they painted in the same finish as the rest of IMAGE 1, not looking pasted in? " +
    "Also check that nobody appears twice, nobody is missing and no extra person appears. " +
    "Reply with JSON only, no other words: {\"characters\":{\"<key>\":{\"family\":true,\"size\":true,\"style\":true,\"why\":\"a few words\"}},\"people_ok\":true,\"why\":\"a few words\"}";
}

// The check's answer as: ok, the characters to paint again, whether to start again from our page, and a short note.
export function judge(answer, cast) {
  const c = (answer && answer.characters) || {}, fails = [], notes = [];
  let restart = answer && answer.people_ok === false;
  for (const role of cast) {
    const x = c[role];
    if (!x) { fails.push(role); notes.push(role + ": not found"); continue; }
    if (x.family === false || x.style === false) fails.push(role);
    if (x.size === false) restart = true;
    if (x.family === false || x.style === false || x.size === false)
      notes.push(role + ": " + [x.family === false && "not like the portrait", x.size === false && "wrong size", x.style === false && "looks pasted in"].filter(Boolean).join(", ") + (x.why ? " (" + String(x.why).slice(0, 80) + ")" : ""));
  }
  if (answer && answer.people_ok === false) notes.push("people: " + String(answer.why || "someone missing, twice or extra").slice(0, 80));
  return { ok: !fails.length && !restart, fails, restart: !!restart, notes: notes.join("; ") };
}

// Paint scene n of a family's book. deps: drawStory, storybookArt, loadImage, checkPicture, touch (keeps the slot
// marked as being painted). Returns { out, check }; out is the last drawing (with engine, size, skipped).
export async function paintSwap(env, id, key, story, n, deps, note) {
  const { drawStory, storybookArt, loadImage, checkPicture, touch } = deps;
  const sc = story.scenes[n], size = env.PRINT_IMAGE_SIZE || "4K";
  const example = await storybookArt(env, key, "s" + n);
  if (!example) throw new Error("our example page s" + n + " is missing");
  const cast = sc.cast.slice().sort((a, b) => (a === "hero") - (b === "hero"));  // the child last, so they are painted at print size
  const portraits = {};
  for (const role of cast) {
    const p = await loadImage(env, "toon/" + id + "/c-" + role + ".png");
    if (!p) throw new Error("character " + role + " missing");
    portraits[role] = p;
  }
  const engines = new Set(), skipped = [];
  const draw = async (images, text, sz) => {
    const out = await drawStory(env, images, text, "16:9", sz);
    engines.add(out.engine); skipped.push(...(out.skipped || []));
    if (touch) await touch();
    return out;
  };
  if (!cast.length) {
    let out = await draw([example], AS_IS, note ? "2K" : size);
    if (note) out = await draw([out], notePrompt(note), size);
    return { out: Object.assign(out, { skipped }), check: { ok: true, rounds: 0, notes: "no family on this page", at: Date.now() } };
  }
  let img = example, todo = cast.slice(), check = null, rounds = 0;
  for (;;) {
    rounds++;
    for (let i = 0; i < todo.length; i++) {
      const last = i === todo.length - 1 && !note;
      img = await draw([img, portraits[todo[i]]], swapPrompt(key, todo[i], cast.length > 1), last ? size : "2K");
    }
    if (note) img = await draw([img], notePrompt(note), size);
    if (!checkPicture) { check = { ok: null, notes: "not checked" }; break; }
    try {
      const answer = await checkPicture(env, [img, example].concat(cast.map(r => portraits[r])), checkPrompt(key, cast));
      check = judge(answer, cast);
    } catch (e) { check = { ok: null, notes: "check failed: " + String(e.message || e).slice(0, 120) }; break; }
    if (check.ok || rounds >= CHECK_ROUNDS) break;  // out of tries: keep the last page, flagged
    if (check.restart) { img = example; todo = cast.slice(); }
    else todo = cast.filter(r => check.fails.includes(r));
  }
  return { out: Object.assign(img, { skipped }), check: Object.assign(check, { rounds, engines: [...engines].join(","), at: Date.now() }) };
}
