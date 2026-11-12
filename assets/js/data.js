/* Family Board Books: catalogue data shared by every page.
   Prices are launch prices in EUR. Change them here and every page updates. */
var FBB = window.FBB = window.FBB || {};

FBB.config = {
  // Waitlist sign-ups and reservations are emailed to hello@ via FormSubmit (formsubmit.co).
  // After activating, you can replace the email in this URL with the random code FormSubmit gives you.
  formEndpoint: "https://formsubmit.co/ajax/hello@familyboardbooks.com",
  // Shopify (headless). The Storefront token is a public, read-only token meant for websites.
  shopify: {
    domain: "nuwppy-0s.myshopify.com",
    token: "8f6930448d2a7ff75a544f49cb66e124",
    apiVersion: "2025-07",
    checkoutLive: false, // keep false until payments, shipping, taxes and the printer are ready
    handles: { abc: "family-abc", numbers: "family-numbers", colours: "family-colours", emotions: "family-emotions", family: "who-loves-me", sayings: "family-sayings", bilingual: "bilingual-edition", giftbox: "gift-box" }
  },
  // Photo and cartoon service (Cloudflare Worker in /worker). Empty = free preview switched off.
  api: "https://familyboardbooks-api.silent-forest-c98a.workers.dev",
  freeCartoons: 6,
  currency: "€",
  foundingDiscount: 15
};

/* Shipping regions. "ordering" switches real checkout on per region (together with
   shopify.checkoutLive). Keep the UK off until a UK printer and UK VAT number are in place. */
FBB.regions = {
  eu: { id: "eu", label: "EU · €", name: "Europe", currency: "€", ordering: true, notice: "" },
  uk: { id: "uk", label: "UK · £", name: "United Kingdom", currency: "£", country: "GB", ordering: false,
        notice: "UK delivery opens soon. Prices are in pounds; reserve your book now and get 15% off as a founding family." }
};

/* UK prices in pounds, keyed by the euro price. Keep these the same as the GBP prices in Shopify Markets. */
FBB.gbp = { 49: 42, 59: 50, 29: 25, 39: 34, 47: 40, 25: 22, 6: 5, 5: 4 };

FBB.styles = [
  { id: "splash", name: "Cartoon Splash", line: "Bold, bright cartoon portraits on paint splats. Our signature look." },
  { id: "painted", name: "Painted Splash", line: "Painterly portraits that stay closest to your photos, on paint splats." },
  { id: "watercolour", name: "Watercolour", line: "Soft, gentle washes of colour. Lovely for babies." },
  { id: "comic", name: "Comic Pop", line: "Strong outlines and halftone dots, like a favourite comic." },
  { id: "storybook", name: "Storybook", line: "Calm pastel frames with a stitched edge, like a classic picture book." }
];

FBB.languages = [
  "English", "Español", "Català", "Français", "Deutsch", "Italiano", "Português", "Nederlands"
];

FBB.addons = {
  bilingual: { name: "Bilingual edition (two languages on every page)", price: 6 },
  giftbox: { name: "Gift box with ribbon", price: 5 }
};

FBB.books = {
  abc: {
    slug: "abc", name: "Family ABC", short: "ABC", color: "red", glyph: "Aa",
    tagline: "A to Z, starring everyone they love.",
    blurb: "Every letter is a person, place or word from your family's life: A for Auntie, G for Grandpa, H for Home.",
    ages: "0 to 4 years",
    inside: [
      "26 letter pages with a big capital and small letter, in a different colour for each letter",
      "Up to 3 people, places or words per letter, each with its own cartoon portrait",
      "Letters with nothing personal get a friendly word and picture from our library",
      "A dedication page and a cover with your child's name"
    ],
    editions: [
      { id: "classic", name: "Classic", pages: "28 pages", detail: "One page per letter, up to 3 pictures each", price: 49, badge: "Most popular" },
      { id: "deluxe", name: "Deluxe", pages: "40 pages", detail: "Extra pages for big families, up to 6 pictures per letter", price: 59 },
      { id: "copy", name: "Extra copy", pages: "Same book", detail: "For grandparents and godparents, ordered with your book", price: 29, isCopy: true }
    ],
    samples: [
      { heading: "Aa", color: "red", items: [{ c: "girl", t: "Amara" }, { c: "auntie", t: "Auntie Rose" }] },
      { heading: "Gg", color: "sky", items: [{ c: "grandpa", t: "Grandpa Joe" }, { c: "granny", t: "Granny Mae" }] },
      { heading: "Mm", color: "sun", items: [{ c: "mum", t: "Mummy" }] }
    ],
    builder: { kind: "letters", slots: 3, prompt: "Names or words starting with" }
  },
  numbers: {
    slug: "numbers", name: "Family 1 to 10", short: "Numbers", color: "sky", glyph: "123",
    tagline: "Count the people who make your family.",
    blurb: "1 Daddy, 2 Grannies, 3 Cousins. Counting becomes a game of spotting the faces they know best.",
    ages: "1 to 4 years",
    inside: [
      "10 counting pages from 1 to 10, with the numeral and dots to count",
      "One group photo per page, turned into a cartoon",
      "Optional bonus pages that count up to 20",
      "A dedication page and a cover with your child's name"
    ],
    editions: [
      { id: "classic", name: "1 to 10", pages: "24 pages", detail: "One page per number", price: 39, badge: "Most popular" },
      { id: "deluxe", name: "1 to 20", pages: "32 pages", detail: "Counts on to 20 for older toddlers", price: 47 },
      { id: "copy", name: "Extra copy", pages: "Same book", detail: "Ordered with your book", price: 25, isCopy: true }
    ],
    samples: [
      { heading: "1", color: "sky", items: [{ c: "dad", t: "1 Daddy" }] },
      { heading: "2", color: "leaf", items: [{ c: "granny", t: "2 Grannies" }, { c: "grandpa", t: "" }] },
      { heading: "3", color: "grape", items: [{ c: "boy", t: "3 Cousins" }, { c: "girl", t: "" }, { c: "baby", t: "" }] }
    ],
    builder: { kind: "numbers", slots: 1, prompt: "Who or what do we count?" }
  },
  colours: {
    slug: "colours", name: "Family Colours", short: "Colours", color: "leaf", glyph: "dots",
    tagline: "Grandpa's red jumper. Mummy's green bike.",
    blurb: "Ten colours, each one found in your family's world: favourite clothes, toys, cars and places.",
    ages: "1 to 4 years",
    inside: [
      "10 colour pages: red, orange, yellow, green, blue, purple, pink, brown, black and white",
      "Up to 2 photos per colour, with the colour named in big letters",
      "Pages printed with a bold band of the colour itself",
      "A dedication page and a cover with your child's name"
    ],
    editions: [
      { id: "classic", name: "Board book", pages: "24 pages", detail: "Ten colours, up to 2 pictures each", price: 39, badge: "Most popular" },
      { id: "copy", name: "Extra copy", pages: "Same book", detail: "Ordered with your book", price: 25, isCopy: true }
    ],
    samples: [
      { heading: "Red", color: "red", items: [{ c: "grandpa", t: "Grandpa's red car" }] },
      { heading: "Green", color: "leaf", items: [{ c: "mum", t: "Mummy's green bike" }] },
      { heading: "Yellow", color: "sun", items: [{ c: "boy", t: "Sam's yellow boots" }] }
    ],
    builder: { kind: "colours", slots: 2, prompt: "Something this colour" }
  },
  emotions: {
    slug: "emotions", name: "How I Feel", short: "Emotions", color: "grape", glyph: "face",
    tagline: "Happy, sleepy, silly: feelings they can name.",
    blurb: "Real photos of your family feeling happy, surprised, sleepy or proud help little ones put words to big feelings.",
    ages: "18 months to 5 years",
    inside: [
      "10 feelings: happy, sad, cross, surprised, scared, silly, proud, sleepy, loving and calm",
      "One photo per feeling, from anyone in the family",
      "A gentle question on each page to talk about together",
      "A dedication page and a cover with your child's name"
    ],
    editions: [
      { id: "classic", name: "Board book", pages: "24 pages", detail: "Ten feelings, one picture each", price: 39, badge: "Most popular" },
      { id: "copy", name: "Extra copy", pages: "Same book", detail: "Ordered with your book", price: 25, isCopy: true }
    ],
    samples: [
      { heading: "Happy", color: "sun", items: [{ c: "girl", t: "Amara is happy" }] },
      { heading: "Sleepy", color: "sky", items: [{ c: "baby", t: "Leo is sleepy" }] },
      { heading: "Silly", color: "grape", items: [{ c: "dad", t: "Daddy is silly" }] }
    ],
    builder: { kind: "emotions", slots: 1, prompt: "Who is feeling this?" }
  },
  family: {
    slug: "family", name: "Who Loves Me", short: "Family", color: "pink", glyph: "heart",
    tagline: "One page for every person who loves them.",
    blurb: "A page each for parents, grandparents, aunts, uncles and friends, with their name and where they live. Perfect when family is far away.",
    ages: "0 to 3 years",
    inside: [
      "Up to 12 people, one page each",
      "Their name, who they are and where they live",
      "Ends with a page for the whole family together",
      "A dedication page and a cover with your child's name"
    ],
    editions: [
      { id: "classic", name: "Board book", pages: "16 pages", detail: "Up to 12 people", price: 39, badge: "Most popular" },
      { id: "deluxe", name: "Big family", pages: "28 pages", detail: "Up to 24 people", price: 49 },
      { id: "copy", name: "Extra copy", pages: "Same book", detail: "Ordered with your book", price: 25, isCopy: true }
    ],
    samples: [
      { heading: "Granny Mae", color: "pink", items: [{ c: "granny", t: "lives in Dublin" }] },
      { heading: "Uncle Tom", color: "sky", items: [{ c: "uncle", t: "lives in Madrid" }] },
      { heading: "Auntie Rose", color: "grape", items: [{ c: "auntie", t: "lives next door" }] }
    ],
    builder: { kind: "people", slots: 1, prompt: "Who they are and where they live" }
  },
  sayings: {
    slug: "sayings", name: "Family Sayings", short: "Sayings", color: "orange", glyph: "quote",
    tagline: "The words your family always says.",
    blurb: "\"Love you to the moon.\" \"Night night, sleep tight.\" Your family's own phrases, each with the person who says it.",
    ages: "0 to 5 years",
    inside: [
      "Up to 10 sayings, songs or bedtime phrases, one per page",
      "A cartoon of the person who always says it",
      "Write them in any language, or mix languages",
      "A dedication page and a cover with your child's name"
    ],
    editions: [
      { id: "classic", name: "Board book", pages: "24 pages", detail: "Up to 10 sayings", price: 39, badge: "Most popular" },
      { id: "copy", name: "Extra copy", pages: "Same book", detail: "Ordered with your book", price: 25, isCopy: true }
    ],
    samples: [
      { heading: "“Love you to the moon”", color: "orange", items: [{ c: "mum", t: "says Mummy" }] },
      { heading: "“One more story?”", color: "sky", items: [{ c: "girl", t: "says Amara" }] },
      { heading: "“Night night”", color: "grape", items: [{ c: "grandpa", t: "says Grandpa" }] }
    ],
    builder: { kind: "sayings", slots: 1, prompt: "Who says it?" }
  }
};

FBB.order = ["abc", "numbers", "colours", "emotions", "family", "sayings"];

FBB.comingSoon = [
  { id: "shapes", name: "Family Shapes", glyph: "shapes", color: "sky", line: "Squares, circles and stars, with your family in every picture" },
  { id: "where", name: "Where's Daddy?", glyph: "where", color: "sun", line: "In front, behind, on top: position words with the people they love" },
  { id: "sounds", name: "First Sounds", glyph: "sh", color: "leaf", line: "Phonics with family examples" },
  { id: "year", name: "Our Year", glyph: "sun", color: "sun", line: "Birthdays, holidays and seasons" }
];

FBB.colourWords = [
  ["Red", "red"], ["Orange", "orange"], ["Yellow", "sun"], ["Green", "leaf"], ["Blue", "sky"],
  ["Purple", "grape"], ["Pink", "pink"], ["Brown", "brown"], ["Black", "ink"], ["White", "cloud"]
];
FBB.emotionWords = ["Happy", "Sad", "Cross", "Surprised", "Scared", "Silly", "Proud", "Sleepy", "Loving", "Calm"];
FBB.letterColours = ["red", "sky", "sun", "leaf", "grape", "orange", "pink"];
