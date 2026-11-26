import { READERS } from "./readers.js";  // Family Learn to Read stock stories (generated)
/* Story books: fixed, hand-written stories. Customers choose who plays each role; the AI first draws
   each family member as a story character, then draws every scene from those characters.
   All prompts live here on the server, so the public API can only draw these scenes. */

export const ANIMALS = ["dog", "cat", "rabbit", "guinea pig", "pet"];
export const WHO = ["toddler", "baby", "girl", "boy", "child", "woman", "man", "older woman", "older man", "teenager", "dog", "cat", "rabbit", "guinea pig", "pet"];
export const WHERE = ["", "on the left", "on the right", "in the middle", "at the front", "at the back"];

const WOLF = "the Wolf: a lanky, shaggy grey wolf with a pale cream chest and muzzle, big round yellow eyes, a black nose, tall pointed ears, a long snout with a far-too-wide grin full of small pointy teeth and a big bushy grey tail; he wears no clothes; comical and silly rather than scary";

export const STORIES = Object.assign({
  redhood: {
    title: "Little Red Riding Hood",
    villain: WOLF, villainName: "the Wolf", villainPose: "standing on his hind legs",
    villainRule: "He is a plain wild animal: NO scarf, neckerchief, vest, collar, hat or any other clothing or accessories.",
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
      6: { cast: ["grandma"], wolf: true, text: "right", desc: "outside a cosy cottage in the woods, the Wolf knocks on the front door; Grandma stays INSIDE the cottage and only peeks out through a side window, holding a rolling pin, and spots his grey tail" },
      7: { cast: [], wolf: true, text: "left", desc: "the Wolf lies in Grandma's bed wearing her frilly nightcap and round reading glasses, chuckling, the blanket pulled up to his chin" },
      8: { cast: ["hero"], wolf: true, text: "left", desc: "Little Red, holding a fistful of bluebells, stands beside Grandma's bed looking puzzled; in the bed the Wolf wears a frilly nightcap and round glasses, his big ears poking out, trying to look innocent" },
      9: { cast: ["hero"], wolf: true, text: "right", desc: "the Wolf, still in Grandma's frilly nightcap and round glasses, leaps out of the bed towards Little Red with his mouth wide open, arms outstretched and the blanket flying, while Little Red leans back in surprise; dramatic but funny, not frightening" },
      10: { cast: ["grandma", "helper", "hero"], wolf: true, text: "left", desc: "a comical moment in Grandma's bedroom: as the Wolf (in the frilly nightcap) lunges towards Little Red, the wardrobe doors burst open and Grandma springs out and bonks him on the head with her wooden rolling pin, little cartoon stars circling his head and his eyes crossed; Little Red ducks out of the way and the woodcutter strides in through the cottage door behind them" },
      11: { cast: ["grandma", "helper", "hero"], wolf: true, text: "right", desc: "the Wolf flees over a green hill looking scared and silly, ears flat, tongue flapping and a big bump on his head, the nightcap flying one way and the glasses the other, while Grandma (waving her rolling pin), the woodcutter and Little Red stand together at the cottage door laughing" },
      12: { cast: ["grandma", "helper", "hero"], text: "right", desc: "Grandma, the woodcutter and Little Red sit around a wooden table having honey buns and soup, laughing together in the warm cottage; the red cape hangs on a hook by the door" }
    }
  },
  goldilocks: {
    title: "Goldilocks and the Three Bears",
    villain: "three friendly brown bears standing side by side, from tallest to smallest: Big Bear, a big burly bear with a tweed flat cap and a red spotted neckerchief; Middle Bear, a round, cosy bear with a lilac apron and a daisy behind one ear; and Little Bear, a small fluffy cub in green dungarees; round ears, kind button eyes, soft caramel-brown fur; gentle and funny, never scary",
    villainName: "the three bears", villainMany: true, villainPose: "standing upright together", villainRule: "Draw all three bears, each wearing exactly the clothes described and nothing else.",
    style: "a warm, classic hand-painted children's picture-book illustration: soft gouache and watercolour textures, gentle storybook light, honey golds, leafy greens and buttercup yellow, expressive friendly faces and slightly simplified shapes. Not 3D, not anime, not photographic",
    roles: {
      hero: { name: "Goldilocks", costume: "a buttercup-yellow knitted jumper with a white daisy on the front, blue dungarees and little red wellington boots",
        standin: "a cheerful five-year-old child with a round face, rosy cheeks and bouncy golden curls" },
      mum: { name: "the mother", costume: "a soft green cardigan over a cream blouse, a long brown skirt and a flowery apron",
        standin: "a friendly young mother in her thirties with light olive skin and long dark hair in a loose plait" },
      helper: { name: "the chair-mender", costume: "a mustard-yellow checked shirt with rolled-up sleeves, brown corduroy trousers, a leather tool belt and sturdy boots",
        standin: "a friendly man in his thirties with brown skin, short black hair and a neat moustache" }
    },
    scenes: {
      1: { cast: ["mum", "hero"], text: "right", desc: "outside a pretty cottage at the edge of a sunny wood, the mother waves from the garden gate as Goldilocks sets off happily towards the trees" },
      2: { cast: [], wolf: true, text: "left", desc: "in a cosy wooden cottage kitchen deep in the wood, the three bears stand round a table with three steaming bowls of porridge (big, middle and little); Big Bear fans his bowl and pulls a face because it is too hot" },
      3: { cast: ["hero"], text: "right", desc: "Goldilocks peeps round the open front door of the bears' little cottage in the wood, a butterfly fluttering beside her, curious and a little bit cheeky" },
      4: { cast: ["hero"], text: "left", desc: "inside the bears' kitchen, Goldilocks happily eats from the little bowl of porridge with a spoon; the big bowl and the middle bowl sit on the table beside her" },
      5: { cast: ["hero"], text: "right", desc: "in the bears' sitting room by the fire, the little wooden chair breaks into pieces under Goldilocks with a comical CRACK, Goldilocks landing on her bottom looking surprised; a big armchair and a middle-sized squashy chair stand nearby" },
      6: { cast: ["hero"], text: "left", desc: "in the bears' bedroom, Goldilocks is fast asleep, snuggled in the smallest of three beds (big, middle and little) under a patchwork quilt" },
      7: { cast: [], wolf: true, text: "right", desc: "the three bears come home and stare at their porridge bowls; Little Bear holds up his empty little bowl, looking very cross and upset, while Big Bear and Middle Bear look puzzled" },
      8: { cast: [], wolf: true, text: "left", desc: "in the sitting room, the three bears look at their chairs; Little Bear sniffs sadly over the pieces of his broken little chair while Big Bear scratches his head" },
      9: { cast: ["hero"], wolf: true, text: "right", desc: "in the bedroom, the three bears lean over the smallest bed in astonishment, Little Bear pointing, as Goldilocks sleeps there, still unaware" },
      10: { cast: ["hero"], wolf: true, text: "left", desc: "Goldilocks runs out of the bears' cottage door and down the woodland path, startled but funny, while the three bears watch from the doorway looking just as surprised" },
      11: { cast: ["mum", "helper", "hero"], text: "right", desc: "at home in a warm kitchen, the chair-mender kneels to talk kindly with Goldilocks, who looks a little sorry, while the mother listens with a gentle smile" },
      12: { cast: ["mum", "helper", "hero"], wolf: true, text: "left", desc: "back at the bears' cottage, everyone is happy: the chair-mender proudly holds up the mended little chair, the mother sets down a honey cake, Goldilocks shakes paws with a delighted Little Bear, and Big Bear and Middle Bear smile with bowls of fresh porridge" }
    }
  },
  pigs: {
    title: "The Three Little Pigs",
    villain: WOLF + "; he has a terrible cold, with a pink runny nose and a hanky in his paw",
    villainName: "the Wolf", villainPose: "standing on his hind legs",
    villainRule: "He is a plain wild animal: NO scarf, neckerchief, vest, collar, hat or any other clothing; the hanky is the only thing he holds.",
    style: "a warm, classic hand-painted children's picture-book illustration: soft gouache and watercolour textures, gentle storybook light, sunny farmyard colours (straw gold, leafy green and warm brick red), expressive friendly faces and slightly simplified shapes. Not 3D, not anime, not photographic",
    roles: {
      hero: { name: "the little pig who builds with bricks", costume: "a soft pink knitted hood with two little pig ears, brick-red dungarees over a white T-shirt, a builder's tool belt and brown boots",
        standin: "a cheerful five-year-old child with a round face, rosy cheeks and short wavy brown hair" },
      big: { name: "the little pig who builds with straw", costume: "a soft pink knitted hood with two little pig ears, straw-yellow dungarees over a striped T-shirt and a battered straw sun hat on top of the hood",
        standin: "a cheerful nine-year-old child with light brown skin and short black hair" },
      middle: { name: "the little pig who builds with sticks", costume: "a soft pink knitted hood with two little pig ears, leaf-green dungarees over a white T-shirt and a little woolly scarf",
        standin: "a cheerful seven-year-old child with pale skin, freckles and ginger hair" },
      mum: { name: "Mother Pig", costume: "a soft pink knitted hood with two little pig ears, a flowery dress and a cream apron",
        standin: "a warm, smiling mother in her thirties with dark brown skin and short natural hair" }
    },
    scenes: {
      1: { cast: ["mum", "big", "middle", "hero"], text: "right", desc: "outside a happy, muddy farmhouse, Mother Pig waves goodbye as the three little pigs set off down the lane with their bags" },
      2: { cast: ["big"], text: "left", desc: "the straw-house pig has finished a wobbly little house made of straw in a sunny meadow and naps in the sunshine in front of it" },
      3: { cast: ["middle"], text: "right", desc: "the stick-house pig taps the last stick into a rickety little house made of sticks at the edge of a wood, looking very pleased" },
      4: { cast: ["hero"], text: "left", desc: "under a rising moon, the brick-house pig lays the last brick on a sturdy little red-brick house with a chimney, a trowel in hand, tired but proud" },
      5: { cast: ["big"], wolf: true, text: "right", desc: "the Wolf, sniffling with his cold and holding a hanky, knocks at the door of the straw house while the straw-house pig peeks out of the window, shaking their head" },
      6: { cast: ["big"], wolf: true, text: "left", desc: "the Wolf gives an enormous sneeze and the straw house blows away into the sky in a flurry of straw, while the straw-house pig runs away down the path, holding on to the straw hat" },
      7: { cast: ["big", "middle"], wolf: true, text: "right", desc: "the Wolf sneezes the stick house down in a clatter of tumbling sticks, while the straw-house pig and the stick-house pig run off together towards a brick house in the distance" },
      8: { cast: ["big", "middle", "hero"], wolf: true, text: "left", desc: "the Wolf huffs and puffs at the sturdy brick house until his cheeks bulge and his ears go pink, but it doesn't wobble at all; the three little pigs wave cheekily from the window" },
      9: { cast: ["big", "middle", "hero"], wolf: true, text: "right", desc: "the Wolf scrambles up onto the roof of the brick house towards the chimney; inside, in a cut-away view, the three pigs pour water into a big tin bathtub full of bubbles under the fireplace" },
      10: { cast: ["big", "middle", "hero"], wolf: true, text: "left", desc: "the Wolf lands with a huge SPLASH in the tub of cold bubbly water under the fireplace, bubbles on his nose and ears and a shocked funny face, while the three pigs giggle" },
      11: { cast: ["big", "middle", "hero"], wolf: true, text: "right", desc: "the Wolf runs away over a green hill, dripping wet and sneezing, with bubbles flying off him, while the three pigs cheer from the doorway of the brick house" },
      12: { cast: ["mum", "big", "middle", "hero"], text: "left", desc: "inside a bigger, cosy brick house, Mother Pig and the three little pigs sit by a crackling fire eating hot soup together, happy and snug" }
    }
  },
  cinderella: {
    title: "Cinderella",
    villain: "two of our own storybook characters side by side: on the left Lady Pinchworth, the stepmother, a tall, bony woman with a sour, lemony face, pinched lips, a towering grey hairdo with a feather, a stiff mustard-yellow gown and a lorgnette, comical rather than frightening; on the right the Prince, a cheerful, friendly boy of about eight with tidy dark hair, a small gold crown and a deep-green velvet jacket with gold buttons",
    villainName: "Lady Pinchworth and the Prince", villainMany: true, villainPose: "standing side by side", villainRule: "Draw exactly these two characters in exactly these clothes. Not in the style of any film.",
    style: "a warm, classic hand-painted children's picture-book illustration: soft gouache and watercolour textures, gentle candlelight and moonlight, rose pinks, warm golds and soft silvers, expressive friendly faces and slightly simplified shapes. Not 3D, not anime, not photographic, and not like any animated film",
    roles: {
      hero: { name: "Cinderella", costume: "a patched grey work dress with a faded apron, a headscarf and soft worn shoes",
        gown: "a gown the colour of moonlight and roses: shimmering silvery white with pale pink roses embroidered on it, and two sparkling glass slippers (not blue)",
        standin: "a cheerful six-year-old child with warm brown skin, big brown eyes and dark curly hair" },
      grandma: { name: "the Fairy Godmother", costume: "a long star-spotted plum dress, a sparkly lilac shawl and a slim wand with a little star on top",
        standin: "a twinkly, smiling grandmother in her seventies with fair skin and a soft white bun" },
      sister: { name: "the kind stepsister", costume: "a frilly peach party dress with big bows and a matching hair ribbon",
        standin: "a kind, smiley ten-year-old girl with pale skin, freckles and long red hair" }
    },
    scenes: {
      1: { cast: ["hero", "sister"], wolf: true, text: "right", desc: "in a grand but gloomy hallway, Lady Pinchworth points and snaps orders while Cinderella scrubs the floor with a brush and bucket; the kind stepsister gives Cinderella a sympathetic look (the Prince is NOT in this scene)" },
      2: { cast: ["hero", "sister"], wolf: true, text: "left", desc: "Lady Pinchworth holds up a golden invitation in triumph while the kind stepsister squeezes Cinderella's hand (the Prince is NOT in this scene)" },
      3: { cast: ["hero", "grandma"], text: "right", desc: "by a kitchen fireplace at night, the Fairy Godmother appears in a twinkle of sparkles in front of a surprised, tearful Cinderella" },
      4: { cast: ["hero", "grandma"], text: "left", desc: "in a moonlit garden, the Fairy Godmother waves her wand and a big pumpkin turns into a golden coach, six white mice become prancing white horses, and a sleepy cat becomes a coachman with fine whiskers, while Cinderella watches in delight" },
      5: { cast: ["hero", "grandma"], wear: { hero: "gown" }, text: "right", desc: "the Fairy Godmother waves her wand and Cinderella twirls in her new gown and glass slippers, sparkles swirling around her, the golden coach waiting behind" },
      6: { cast: ["hero", "sister"], wear: { hero: "gown" }, wolf: true, others: true, text: "left", desc: "in a glittering palace ballroom, the Prince bows to Cinderella and they dance; the kind stepsister claps happily and Lady Pinchworth peers through her lorgnette without recognising her; a few small guests dance in the background" },
      7: { cast: ["hero"], wear: { hero: "gown" }, text: "right", desc: "at night, a big palace clock shows midnight and Cinderella runs down the long palace steps, one glass slipper left sparkling on a step behind her" },
      8: { cast: [], wolf: true, text: "left", desc: "in daylight, the Prince stands at the front door of Lady Pinchworth's house holding a glass slipper on a velvet cushion, while Lady Pinchworth opens the door with a greedy smile" },
      9: { cast: ["hero", "sister"], wolf: true, text: "right", desc: "in the parlour, Lady Pinchworth hops and wobbles trying to squash her big foot into the tiny glass slipper, which pops off and flies through the air towards the Prince, who catches it; Cinderella and the kind stepsister watch from the side, trying not to giggle" },
      10: { cast: ["hero", "sister"], wolf: true, text: "left", desc: "Cinderella sits on a stool while the glass slipper slides perfectly onto her foot, and she takes the matching slipper from her apron pocket; the Prince beams, the kind stepsister cheers and Lady Pinchworth gapes" },
      11: { cast: ["hero", "grandma"], wolf: true, text: "right", desc: "the Fairy Godmother appears in a twinkle of sparkles and hugs Cinderella, while Lady Pinchworth, pink as a radish, says sorry; the Prince smiles nearby" },
      12: { cast: ["hero", "grandma", "sister"], wear: { hero: "gown" }, wolf: true, others: true, text: "left", desc: "a joyful palace ball: Cinderella dances with the Prince, the kind stepsister dances with the Fairy Godmother, and Lady Pinchworth taps her toes at the side; small happy guests dance in the background under twinkling chandeliers" }
    }
  },
  sleeping: {
    title: "Sleeping Beauty",
    villain: "Fairy Grumblethorn: a tall, bony, grumpy fairy with pale green skin, a long pointy nose, frizzy purple hair, a crooked dark-green pointed hat, a cloak made of thorny brambles, small grey moth wings and a gnarled twig wand; a cross scowl, comical rather than frightening",
    villainName: "Fairy Grumblethorn", villainPose: "standing", villainRule: "Draw exactly this one fairy in exactly these clothes.",
    style: "a warm, classic hand-painted children's picture-book illustration: soft gouache and watercolour textures, gentle storybook light, rose pinks, castle stone greys and leafy greens, expressive friendly faces and slightly simplified shapes. Not 3D, not anime, not photographic, and not like any animated film",
    roles: {
      hero: { name: "the young royal", costume: "a rose-pink royal tunic dress with a little gold circlet on the head and soft pink shoes",
        standin: "a cheerful six-year-old child with light brown skin and long wavy dark hair" },
      mum: { name: "the Queen", costume: "a long burgundy royal gown, a velvet cloak and a gold crown",
        standin: "a kind, smiling queen in her thirties with fair skin and long auburn hair" },
      helper: { name: "the King", costume: "a deep red velvet royal robe with white fur trim, a gold crown and soft boots",
        standin: "a jolly king in his forties with dark brown skin and a short grey beard" },
      grandma: { name: "the good fairy", costume: "a flowing lilac gown, a soft rose-coloured shawl, glittering see-through wings and a wand topped with a rose",
        standin: "a wise, twinkly grandmother in her seventies with pale skin and long silver hair in a loose bun" }
    },
    scenes: {
      1: { cast: ["mum", "helper"], others: true, text: "right", desc: "in a castle hall covered in climbing roses, the Queen and the King proudly show a sweet newborn baby in a lacy cradle to happy guests at a grand party" },
      2: { cast: ["grandma"], others: true, text: "left", desc: "small good fairies with glittering wings bring gifts to a baby in a lacy cradle, and the good fairy steps forward last, smiling" },
      3: { cast: ["mum", "helper"], wolf: true, text: "right", desc: "the great doors burst open and Fairy Grumblethorn sweeps in, in a puff of green smoke, pointing her twig wand at the baby's cradle, while the Queen and King gasp" },
      4: { cast: ["grandma", "mum", "helper"], text: "left", desc: "the good fairy gently raises her rose wand over the baby's cradle, soft pink sparkles falling like petals, while the Queen and King look on hopefully" },
      5: { cast: ["hero"], text: "right", desc: "a sunny castle rose garden, where the young royal laughs while chasing butterflies" },
      6: { cast: ["hero"], text: "left", desc: "at the top of a dusty, winding tower staircase, the young royal finds an old wooden spinning wheel and reaches out a finger towards its spindle, curious" },
      7: { cast: ["hero", "mum", "helper"], others: true, text: "right", desc: "the whole castle falls asleep: the young royal asleep on a velvet bed in the tower, the Queen and King yawning and nodding off on their thrones, a cook snoring by a pot and a cat curled up asleep" },
      8: { cast: [], wolf: true, text: "left", desc: "thick, thorny rose hedges have grown over the castle walls; Fairy Grumblethorn peeks out from behind a tree, grinning, but looking a tiny bit lonely too" },
      9: { cast: ["grandma"], text: "right", desc: "the good fairy flies towards the castle and the thorny rose hedge parts to make a path for her" },
      10: { cast: ["grandma", "hero"], text: "left", desc: "in the tower bedroom, the good fairy sits by the bed and softly sings, and the young royal opens their eyes with a happy, sleepy smile" },
      11: { cast: ["mum", "helper"], wolf: true, others: true, text: "right", desc: "the castle wakes: the Queen and King stretch and rub their eyes, the roses curl back, a cook stirs a pot; outside the castle gate, Fairy Grumblethorn stands alone looking very sorry" },
      12: { cast: ["hero", "mum", "helper", "grandma"], wolf: true, others: true, text: "left", desc: "a joyful birthday party in the castle hall with a big pink cake: the young royal hands a party invitation to a smiling Fairy Grumblethorn, while the Queen, the King and the good fairy celebrate and happy guests dance in the background" }
    }
  }
}, READERS);

// Every character (from a photo, a stand-in or the villain) is drawn the same way, so they all match on the page.
const POSE = "standing in a relaxed three-quarter view on a plain white background, the whole body in frame, filling most of the height of the picture";

// styleRef: true when our own drawing of this role (Learn to Read's example family) is sent as IMAGE 2, so a family's
// character is drawn in exactly the house style (outlines, flat colours, proportions) and sits with the rest of the art.
const STYLE_REF = "IMAGE 2 is a character from our books. Use it ONLY for the drawing style: copy its clean dark ink outlines, flat cheerful colours with soft simple shading, " +
  "its simplified cartoon proportions (head size, hands, feet), the way it draws eyes, noses, mouths and hair as simple shapes and lines, and its level of detail, " +
  "so the new character looks drawn by the same illustrator for the same book. Never copy IMAGE 2's face, hair, skin tone, body or";
const NOT_PHOTO = "It must be a flat illustration, not a painting of the photo: no photographic shading, no skin or fur texture, no realistic hair strands, no soft airbrushed gradients.";
// Family Storybooks (styleRef "painted"): our example character for this role is IMAGE 2, so a family's character is
// painted in the same hand-painted picture-book style as the story pages instead of a realistic portrait of the photo.
const STYLE_REF_PAINTED = "IMAGE 2 is a character from our book. Use it ONLY for the drawing and painting style: copy its soft gouache and watercolour look, its gentle hand-drawn outlines, " +
  "its warm colours and simple soft shading, its friendly simplified proportions (rounder face, slightly larger head, small simple hands and feet), the way it paints eyes as small dark shapes, " +
  "noses and mouths with a few simple strokes, rosy cheeks and hair as soft shapes, and its level of detail, so the new character looks painted by the same illustrator for the same book. " +
  "Never copy IMAGE 2's face, hair, skin tone, body or";
const NOT_PHOTO_PAINTED = "It must look like a hand-painted storybook illustration, never like a photo or a realistic portrait: no photographic lighting, no realistic skin or hair texture, " +
  "no realistic facial detail, and the same simplified face shapes as IMAGE 2.";
export function characterPrompt(story, role, who, where, styleRef) {
  const s = STORIES[story], r = s.roles[role];
  const painted = styleRef === "painted", REF = painted ? STYLE_REF_PAINTED : STYLE_REF, NOT = painted ? NOT_PHOTO_PAINTED : NOT_PHOTO;
  if (ANIMALS.includes(who)) {  // a family pet (Learn to Read books): no clothes, the pet's own look
    return "IMAGE 1 is a photo of the customer's pet. Draw ONLY the " + who + (where ? " " + where : "") + " from it as a full-body storybook animal character called " + r.name +
      ", in a relaxed three-quarter view on a plain white background, the whole body in frame, filling most of the picture. " +
      "LIKENESS IS THE MOST IMPORTANT THING: the family must recognise their own pet instantly. Copy from the photo, as closely as the style allows: the kind of animal and breed, " +
      "its size and build, the exact fur or feather colours and markings, the ear shape, eye colour, muzzle or face shape, tail and any collar. Keep it a real animal on its usual legs, not dressed and not standing like a person. " +
      (styleRef ? REF + " its kind of animal, breed, colours or markings: those all come from IMAGE 1. " + NOT + " " : "") +
      "Style: " + s.style + ". Draw only this one animal. No text or letters.";
  }
  const person = (who || "person") + (where ? " " + where : "");
  return "IMAGE 1 is a photo of the customer's family. Draw ONLY the " + person + " from it as a full-body storybook character called " + r.name + ", " + POSE + ". " +
    "LIKENESS IS THE MOST IMPORTANT THING: their own family must recognise them instantly, " +
    (painted ? "the way a picture-book illustrator captures a real child in a few simple strokes, not a generic storybook face. " : "as in a portrait painted by a skilled illustrator, not a generic storybook face. ") +
    "Copy from the photo, as closely as the style allows: the face shape and proportions, the shape, size and spacing of the eyes, the eyebrows, nose, mouth and smile, " +
    "the ears, skin tone, freckles, dimples or moles, the hairline and the hair's exact colour, length, parting and texture, any glasses, beard or moustache, and their age and build. " +
    (styleRef
      ? REF + " clothes: the person comes from IMAGE 1. Keep them recognisable through the shapes (face shape, eyes, smile, hair, skin tone, age) rather than through realistic detail. " + NOT + " "
      : "Keep the stylisation light on the face: do not make the eyes bigger, the nose smaller or the face younger or prettier than in the photo. ") +
    "Remove any sunglasses so the eyes show. " +
    "Dress them in " + r.costume + ". Style: " + s.style + ". Draw only this one character. No text or letters.";
}

// Our own invented character for a part the family leaves without a photo (no customer image is used).
export function standinPrompt(story, role, styleRef) {
  const s = STORIES[story], r = s.roles[role];
  const look = styleRef === "painted" ? "the same soft hand-painted gouache and watercolour look, outlines, colours, proportions and level of detail" : "the same ink outlines, flat colours, proportions and level of detail";
  return (styleRef ? "IMAGE 1 is a character from our books. Draw a NEW, different person in exactly its drawing style (" + look + "), not the same face or hair. " : "") +
    "Draw a full-body storybook character called " + r.name + ": " + r.standin + ", " + POSE + ". " +
    "Dress them in " + r.costume + ". Style: " + s.style + ". Draw only this one character. No text or letters.";
}

export function villainPrompt(story) {
  const s = STORIES[story];
  return "Draw " + s.villain + ", as " + (s.villainMany ? "full-body storybook characters " : "a full-body storybook character ") + (s.villainPose || "standing") + ", " + POSE + ". " +
    (s.villainRule || "") + " Style: " + s.style + ". No text or letters.";
}

// villainRef: true when the drawn villain is sent as the last reference image.
// opts.example: IMAGE 1 is our own finished page of this scene (storybooks), which sets the layout, the size of everyone
// in it, the props and the finish, so every family's book looks like our example book. opts.note: the family's own
// words on what to change (a redraw from the proof page), already cleaned.
export function scenePrompt(story, n, villainRef, opts) {
  const s = STORIES[story], sc = s.scenes[n], ours = s.villainName || "the Wolf", o = opts || {}, first = o.example ? 2 : 1;
  const wearing = role => { const r = s.roles[role], alt = sc.wear && sc.wear[role]; return alt ? r[alt] : r.costume; };
  const refs = sc.cast.map((role, i) => "IMAGE " + (i + first) + " is " + s.roles[role].name + " (in this scene wearing " + wearing(role) + ")");
  if (sc.wolf && villainRef) refs.push("IMAGE " + (sc.cast.length + first) + " is " + ours);
  const changed = sc.cast.filter(role => sc.wear && sc.wear[role]).map(role => s.roles[role].name);
  const example = o.example ? "IMAGE 1 is this exact page from our own finished book, painted for another family. Repaint IMAGE 1 as closely as you can: " +
    "the same composition and camera angle, the same setting, furniture and props, the same positions, poses and sizes of every character " +
    "(a child stays child-sized next to the house, the door and the furniture), the same empty area for the words, and exactly the same soft " +
    "gouache and watercolour painting style, gentle outlines, colours, light and finish. The ONLY change: each character in IMAGE 1 becomes the matching " +
    "character from their own reference image below. Do not add, remove or move anything else. IMPORTANT: the people in IMAGE 1 are a different family. " +
    "Copy only their pose, place and size; every face, hair, skin tone, age, beard or glasses and outfit must come from the character's own reference, never from IMAGE 1. " +
    sc.cast.map((role, i) => "The " + s.roles[role].name + " in IMAGE 1 becomes the person in IMAGE " + (i + 2) + ", wearing " + wearing(role) + ".").join(" ") + " " : "";
  const note = o.note ? "The family asked for this change to the picture: \u201c" + o.note + "\u201d. Make that change if it fits a children's picture book, and keep everything else the same. " : "";
  return "Illustrate one wide double-page spread of a children's picture book. Scene: " + sc.desc + ". " + example +
    (refs.length ? "The other images provided are character reference sheets (" + refs.join("; ") + "). Every character in the scene must be the SAME character as in their reference, copied exactly: " +
      "the same face, hair colour and style, skin tone, age, glasses or beard, body shape" + (changed.length ? "" : ", and exactly the same clothes, patterns and colours") + ". " +
      (changed.length ? "Keep everyone's clothes exactly as in their reference, except that " + changed.join(" and ") + " now wears the outfit described above instead. " : "Do not change their outfit. ") +
      "Do not change their hair or age, and do not invent a different-looking person. Each character appears only once. " +
      "Ignore anything a character is holding in their reference (a basket, flowers, food) and the reference's background and painting style: what they hold, and what is in it, comes from " + (o.example ? "IMAGE 1 and " : "") + "the scene, and the style from " + (o.example ? "IMAGE 1" : "the style below") + ". " : "") +
    (sc.wolf && !villainRef ? "Also include " + s.villain + ". " : sc.wolf ? "Our own characters look exactly like their reference: " + s.villain + ". Only include the ones the scene mentions. " : "") +
    (sc.others ? "Any other people in the scene are small, simple background figures, clearly different from the main characters. " : "Do not add any other people. ") +
    "LAYOUT: the words of the story will be printed over the " + sc.text + " third of the picture, so keep that third completely free of characters, faces and important objects: only calm background there (sky, wall, floor or grass). Place every character in the other two thirds. " +
    "Style: " + s.style + ". " + note + "No text, letters or speech bubbles.";
}

// ---------- Layered pictures (Learn to Read) ----------
// Each scene is painted ONCE with nobody in it (a "set", kept and reused for every family), and each family member
// is drawn once in a few cut-out poses on flat magenta. The site keys out the magenta and places the poses on the set,
// so a family costs the same however many books they order.
export const PEOPLE_POSES = {
  stand: "standing facing us in a relaxed three-quarter view, smiling, arms relaxed",
  walk: "walking towards the right, mid-stride, happy",
  wave: "waving one hand high, big smile",
  point: "pointing excitedly towards the right with one arm, looking that way",
  cheer: "jumping for joy with both arms up in the air",
  hold: "holding both hands out in front at waist height, as if carrying or giving something small, looking down at their hands",
  crouch: "crouching down low on their heels, looking down at something on the ground in front of them",
  sit: "sitting on the ground with legs crossed, side-on to us, facing right",
  // The bed is part of this cut-out, so a bedroom set is painted without one (and is drawn wide, 4:3).
  bed: "sitting up in their own single wooden bed, tucked in up to the waist under a sky-blue duvet with little yellow moons and stars, leaning back on a big pillow, awake and smiling, the whole bed seen from the side and a little above, headboard on the left, short wooden legs on the floor"
};
export const WIDE_POSES = ["bed"];
export const PET_POSES = {
  stand: "standing on all fours, side-on facing right, looking happy",
  sit: "sitting up, facing us, looking happy",
  run: "running towards the right, all paws off the ground, ears flying",
  lie: "lying down curled up, resting, facing right",
  roll: "lying flat on its back, belly up, with all four legs waving in the air, wriggling happily, seen side-on"
};
// Magenta, not green: green clothes (the grown-up's jumper) and grass would be keyed out with green.
export const KEY_COLOUR = "one flat, even, pure bright magenta (#FF00FF) filling the whole background, with no ground, no shadow, no gradient and no other objects";

// The empty set for scene n: the place and its things, with none of the family in it.
export function setPrompt(story, n) {
  const s = STORIES[story], sc = s.scenes[n];
  const zone = sc.text === "left" ? "right" : "left";
  return "Paint ONE single, continuous, wide landscape picture (the background for a children's picture book page), edge to edge, as one view of one place: " +
    "no panels, frames, borders, split screens, seams, dividing lines, gutters or folds, and not a picture of a book. Nothing changes or lines up differently down the middle: every object, path and horizon runs straight across it. The scene: " + sc.desc + ". " +
    (sc.cast.length ? "The family (" + sc.cast.map(r => s.roles[r].name).join(", ") + ") will be added later as separate cut-out pictures, so leave every one of them OUT: no family members anywhere, not even partly, and no hands, shadows or footprints of them. "
      : "None of the family is in this picture. ") +
    "Do draw the place and everything the scene needs around them: the objects they use or look at, the weather, the light and the mood. " +
    (sc.others ? "Other people or animals the scene mentions (not the family) may appear, small and in the background. " : "No people and no animals at all, unless an animal is part of the scene itself and is not the family's pet. ") +
    "Words will be laid over the " + sc.text + " side later, so the " + sc.text + " side should simply be a quieter part of the same view (more sky, grass, floor or wall, with fewer details), continuing naturally with the same light and colours: never a blank, white, faded or separate area. " +
    (sc.ground ? "On the " + zone + " side, the bottom 45% is where the characters will stand, and it is " + sc.ground + ", reaching the bottom edge, with nothing standing on it. "
      : "On the " + zone + " side, keep the bottom 45% open: a clear, fairly flat stretch of floor, grass, sand or ground in the foreground, with nothing standing on it, where the characters will stand. ") +
    "Eye level is a small child's, looking straight on. Style: " + s.style + ". No text, letters or speech bubbles.";
}

// A cut-out pose on flat magenta: IMAGE 1 is the character's drawing (c-<role>); outfit is a role key (costume or outfitN).
// An outfit starting with "+" keeps the usual clothes and adds to them (holding a hat, splashed with mud).
// who (girl, boy, woman, man…) lets clothes such as swimwear suit the person; skin tone always comes from IMAGE 1.
export function posePrompt(story, role, outfit, pose, isPet, who) {
  const s = STORIES[story], r = s.roles[role], how = (isPet ? PET_POSES : PEOPLE_POSES)[pose];
  const wear = outfit && outfit !== "costume" && r[outfit] ? r[outfit] : null, extra = wear && wear[0] === "+" ? wear.slice(1) : null;
  const person = who && WHO.includes(who) && !ANIMALS.includes(who) ? who : null;
  return "IMAGE 1 is the character reference for " + r.name + (person ? ", who is a " + person : "") + ". Draw the SAME character again, full body, " + how + ". " +
    "Copy them exactly: the same face, hair, skin tone, age, body shape" + (isPet ? ", fur colours and markings" : "") + (wear && !extra ? "" : " and exactly the same clothes") + ". " +
    (extra ? "This time they are " + extra + ". " : wear ? "This time they are wearing " + wear + " instead of their usual clothes" + (person ? ", in the version that suits a " + person : "") + ". " : "") +
    (isPet ? "" : "Their arms, hands, legs and feet have the same skin tone as their face. ") +
    "Background: " + KEY_COLOUR + ". Do not use any magenta or purple on the character" + (isPet ? "" : " or their clothes") + ". The whole body is in frame with a clear gap of magenta all round it; nothing touches the edges. " +
    (pose === "bed" ? "Draw the bed too: it is part of this cut-out and is the only object allowed. The whole bed is in frame. " : "") +
    "Style: " + s.style + ". Draw only this one character" + (pose === "bed" ? " in their bed" : "") + ". No text or letters.";
}
