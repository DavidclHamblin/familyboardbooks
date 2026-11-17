/* Story books: fixed, hand-written stories. Customers choose who plays each role; the AI first draws
   each family member as a story character, then draws every scene from those characters.
   All prompts live here on the server, so the public API can only draw these scenes. */

export const WHO = ["toddler", "baby", "girl", "boy", "child", "woman", "man", "older woman", "older man", "teenager"];
export const WHERE = ["", "on the left", "on the right", "in the middle", "at the front", "at the back"];

const WOLF = "the Wolf: a lanky, shaggy grey wolf with a pale cream chest and muzzle, big round yellow eyes, a black nose, tall pointed ears, a long snout with a far-too-wide grin full of small pointy teeth and a big bushy grey tail; he wears no clothes; comical and silly rather than scary";

export const STORIES = {
  redhood: {
    title: "Little Red Riding Hood",
    villain: WOLF,
    style: "a warm, classic hand-painted children's picture-book illustration: soft gouache and watercolour textures, gentle storybook light, rich forest greens with a strawberry-red accent, expressive friendly faces and slightly simplified shapes. Not 3D, not anime, not photographic",
    roles: {
      hero: { name: "Little Red", costume: "a bright strawberry-red hooded cape over simple, cosy clothes and little brown boots, holding a small wicker basket",
        standin: "a cheerful five-year-old child with a round face, rosy cheeks and shoulder-length wavy brown hair" },
      mum: { name: "the mother", costume: "everyday clothes with a flowery apron",
        standin: "a friendly young mother in her thirties with warm brown skin and dark curly hair tied up" },
      grandma: { name: "Grandma", costume: "a long cosy dress, a knitted shawl and slippers",
        standin: "a kind, smiling grandmother in her seventies with short silver hair and round glasses" },
      helper: { name: "the woodcutter", costume: "a checked flannel shirt, braces, sturdy boots and a wool cap (no axe)",
        standin: "a tall, friendly man in his thirties with a short dark beard" }
    },
    scenes: {
      1: { cast: ["hero"], text: "right", desc: "Little Red stands happily outside a small cottage with a crooked chimney at the edge of a sunny, enchanted green forest" },
      2: { cast: ["mum", "hero"], text: "right", desc: "in a cosy cottage kitchen, the mother hands Little Red a wicker basket with honey buns, a jar of soup and a bunch of daisies; morning sun through the window" },
      3: { cast: ["hero"], text: "left", desc: "Little Red walks along a winding forest path between tall trees, birds singing and a squirrel waving its tail" },
      4: { cast: ["hero"], wolf: true, text: "left", desc: "Little Red walks on the forest path, not noticing that behind a mossy log the Wolf is peeking out with a far-too-wide grin" },
      5: { cast: ["hero"], wolf: true, text: "right", desc: "Little Red happily picks bluebells in a sunny glade while, far in the background, the Wolf sneaks off through the trees" },
      6: { cast: ["grandma"], wolf: true, text: "right", desc: "outside a cosy cottage in the woods, the Wolf knocks on the front door; at a side window Grandma peeks out, holding a rolling pin, and spots his grey tail" },
      7: { cast: [], wolf: true, text: "left", desc: "the Wolf lies in Grandma's bed wearing her frilly nightcap and round reading glasses, chuckling, the blanket pulled up to his chin" },
      8: { cast: ["hero"], wolf: true, text: "left", desc: "Little Red, holding a fistful of bluebells, stands beside Grandma's bed looking puzzled; in the bed the Wolf wears a frilly nightcap and round glasses, his big ears poking out, trying to look innocent" },
      9: { cast: ["hero"], wolf: true, text: "right", desc: "the Wolf, still in Grandma's frilly nightcap and round glasses, leaps out of the bed towards Little Red with his mouth wide open, arms outstretched and the blanket flying, while Little Red leans back in surprise; dramatic but funny, not frightening" },
      10: { cast: ["grandma", "helper", "hero"], wolf: true, text: "left", desc: "a comical moment in Grandma's bedroom: as the Wolf (in the frilly nightcap) lunges towards Little Red, the wardrobe doors burst open and Grandma springs out and bonks him on the head with her wooden rolling pin, little cartoon stars circling his head and his eyes crossed; Little Red ducks out of the way and the woodcutter strides in through the cottage door behind them" },
      11: { cast: ["grandma", "helper", "hero"], wolf: true, text: "right", desc: "the Wolf flees over a green hill looking scared and silly, ears flat, tongue flapping and a big bump on his head, the nightcap flying one way and the glasses the other, while Grandma (waving her rolling pin), the woodcutter and Little Red stand together at the cottage door laughing" },
      12: { cast: ["grandma", "helper", "hero"], text: "right", desc: "Grandma, the woodcutter and Little Red sit around a wooden table having honey buns and soup, laughing together in the warm cottage; the red cape hangs on a hook by the door" }
    }
  }
};

// Every character (from a photo, a stand-in or the villain) is drawn the same way, so they all match on the page.
const POSE = "standing in a relaxed three-quarter view on a plain white background, the whole body in frame, filling most of the height of the picture";

export function characterPrompt(story, role, who, where) {
  const s = STORIES[story], r = s.roles[role];
  const person = (who || "person") + (where ? " " + where : "");
  return "IMAGE 1 is a photo of the customer's family. Draw ONLY the " + person + " from it as a full-body storybook character called " + r.name + ", " + POSE + ". " +
    "LIKENESS IS THE MOST IMPORTANT THING: their own family must recognise them instantly, as in a portrait painted by a skilled illustrator, not a generic storybook face. " +
    "Copy from the photo, as closely as the style allows: the face shape and proportions, the shape, size and spacing of the eyes, the eyebrows, nose, mouth and smile, " +
    "the ears, skin tone, freckles, dimples or moles, the hairline and the hair's exact colour, length, parting and texture, any glasses, beard or moustache, and their age and build. " +
    "Keep the stylisation light on the face: do not make the eyes bigger, the nose smaller or the face younger or prettier than in the photo. Remove any sunglasses so the eyes show. " +
    "Dress them in " + r.costume + ". Style: " + s.style + ". Draw only this one character. No text or letters.";
}

// Our own invented character for a part the family leaves without a photo (no customer image is used).
export function standinPrompt(story, role) {
  const s = STORIES[story], r = s.roles[role];
  return "Draw a full-body storybook character called " + r.name + ": " + r.standin + ", " + POSE + ". " +
    "Dress them in " + r.costume + ". Style: " + s.style + ". Draw only this one character. No text or letters.";
}

export function villainPrompt(story) {
  const s = STORIES[story];
  return "Draw " + s.villain + ", as a full-body storybook character standing on his hind legs, " + POSE + ". " +
    "He is a plain wild animal: NO scarf, neckerchief, vest, collar, hat or any other clothing or accessories. " +
    "Style: " + s.style + ". Draw only this one character. No text or letters.";
}

// villainRef: true when the drawn villain is sent as the last reference image.
export function scenePrompt(story, n, villainRef) {
  const s = STORIES[story], sc = s.scenes[n];
  const refs = sc.cast.map((role, i) => "IMAGE " + (i + 1) + " is " + s.roles[role].name + " (wearing " + s.roles[role].costume + ")");
  if (sc.wolf && villainRef) refs.push("IMAGE " + (sc.cast.length + 1) + " is the Wolf");
  return "Illustrate one wide double-page spread of a children's picture book. Scene: " + sc.desc + ". " +
    (refs.length ? "The images provided are character reference sheets (" + refs.join("; ") + "). Every character in the scene must be the SAME character as in their reference, copied exactly: " +
      "the same face, hair colour and style, skin tone, age, glasses or beard, body shape, and exactly the same clothes, patterns and colours. Do not change their outfit, hair or age, and do not invent a different-looking person. " +
      "Each character appears only once. " : "") +
    (sc.wolf && !villainRef ? "Also include " + WOLF + ". " : sc.wolf ? "The Wolf looks exactly like his reference: " + WOLF + ". " : "") +
    "Do not add any other people. Keep the " + sc.text + " third of the picture calm and simple (sky, wall or grass) so text can be printed there. " +
    "Style: " + s.style + ". No text, letters or speech bubbles.";
}
