export const CATEGORIES = [
  { id: "shape", name: "Shape and form", blurb: "See complex subjects as simple 2D shapes and 3D forms." },
  { id: "proportion", name: "Proportions and measurement", blurb: "Compare sizes, angles and alignments like a sight-size painter." },
  { id: "perspective", name: "Perspective", blurb: "Place objects convincingly in 3D space." },
  { id: "light", name: "Light and shadow", blurb: "Understand how light wraps around form." },
  { id: "values", name: "Values and tonal control", blurb: "Group tones into clear, readable masses." },
  { id: "anatomy", name: "Anatomy", blurb: "Build figures from structure, not outlines." },
  { id: "composition", name: "Composition", blurb: "Arrange shapes and values so the eye moves with intent." },
  { id: "gesture", name: "Gesture drawing", blurb: "Capture movement and rhythm quickly." },
  { id: "line", name: "Line quality", blurb: "Confident, varied lines that describe form." },
  { id: "still_life", name: "Still life and observation", blurb: "Draw what you see, not what you think you see." },
] as const;

export type Level = "beginner" | "intermediate" | "advanced";

export interface Exercise {
  id: string;
  category: string;
  title: string;
  instructions: string;
  minutes: number;
  levels: Level[];
  focus: string; // what to self-assess
}

export const EXERCISES: Exercise[] = [
  { id: "boxes-20", category: "perspective", title: "Draw 20 boxes from different angles", minutes: 15, levels: ["beginner", "intermediate"], instructions: "Draw 20 boxes in two-point perspective, rotating each a little. Draw through every box (show hidden edges). Keep receding edges converging, never diverging.", focus: "Do parallel edges converge consistently?" },
  { id: "cylinders-10", category: "shape", title: "Draw 10 cylinders", minutes: 12, levels: ["beginner", "intermediate"], instructions: "Draw 10 cylinders at different tilts. Draw the central axis first, then ellipses perpendicular to it. The ellipse further from your eye level should be fuller.", focus: "Are the ellipse minor axes aligned with the cylinder axis?" },
  { id: "gesture-5min", category: "gesture", title: "5-minute gesture drawings", minutes: 10, levels: ["beginner", "intermediate", "advanced"], instructions: "Find figure photos online. Do 2 gestures of 5 minutes each. Start with one line of action, then the big masses. No details, no outlines of fingers.", focus: "Does the drawing feel like it is moving?" },
  { id: "gesture-30s", category: "gesture", title: "30-second gesture sprint", minutes: 8, levels: ["intermediate", "advanced"], instructions: "Do 15 thirty-second gestures. Use only the line of action plus 2-3 curves. Speed forces you to prioritise.", focus: "Did you capture the main action before detail?" },
  { id: "portrait-5shapes", category: "shape", title: "Simplify a portrait into 5 major shapes", minutes: 10, levels: ["beginner", "intermediate"], instructions: "Pick a portrait photo. Reduce the head, hair mass, neck, shoulders and background into exactly 5 flat shapes. Compare their sizes to each other.", focus: "Are the 5 shapes the right relative size?" },
  { id: "three-value", category: "values", title: "3-value study of a photograph", minutes: 15, levels: ["beginner", "intermediate", "advanced"], instructions: "Use DrawLab's 3-value view of a reference. Paint or shade only white, mid-grey and dark. No blending. Squint to check.", focus: "Do the big light and dark masses read from across the room?" },
  { id: "still-life-forms", category: "still_life", title: "Still life using only basic forms", minutes: 20, levels: ["beginner", "intermediate"], instructions: "Set up 3 household objects. Draw them only as spheres, boxes, cylinders and cones, showing overlaps and contact points.", focus: "Do objects sit on the same ground plane?" },
  { id: "value-scale", category: "values", title: "9-step value scale", minutes: 10, levels: ["beginner"], instructions: "Draw 9 boxes in a row. Fill them evenly from paper-white to your darkest dark. Each step should be an equal jump.", focus: "Are the steps evenly spaced?" },
  { id: "sphere-light", category: "light", title: "Shade a sphere with a single light", minutes: 15, levels: ["beginner", "intermediate"], instructions: "Use the Light Academy sphere as reference. Draw the terminator first, then the core shadow, reflected light and cast shadow. Keep reflected light darker than any lit area.", focus: "Is the light side clearly separated from the shadow side?" },
  { id: "cast-shadows", category: "light", title: "Cast shadow construction", minutes: 15, levels: ["intermediate", "advanced"], instructions: "Draw a box and a cylinder on a ground plane with a point light. Project the cast shadows by running lines from the light through the object's corners.", focus: "Do the shadow shapes follow the ground plane's perspective?" },
  { id: "measure-landmarks", category: "proportion", title: "Measure with a unit", minutes: 15, levels: ["beginner", "intermediate"], instructions: "Pick a reference. Choose one unit (e.g. head height). Mark the top, bottom and 5 landmarks on your paper by measuring in that unit before drawing any contour.", focus: "How far off were the landmarks before correction?" },
  { id: "plumb-lines", category: "proportion", title: "Plumb and level lines", minutes: 10, levels: ["intermediate", "advanced"], instructions: "Draw a reference using only vertical and horizontal alignment checks between landmarks. Leave the alignment lines visible.", focus: "Did alignment lines catch errors?" },
  { id: "ghosted-lines", category: "line", title: "Ghosted lines and ellipses", minutes: 8, levels: ["beginner", "intermediate", "advanced"], instructions: "Fill a page with straight lines between two dots, then ellipses inside boxes. Ghost the motion 3 times before committing. Draw from the shoulder.", focus: "Are your lines smooth and confident, not hairy?" },
  { id: "line-weight", category: "line", title: "Line weight study", minutes: 12, levels: ["intermediate", "advanced"], instructions: "Draw a simple object twice: once with uniform lines, once with heavier lines in shadow and at overlaps, lighter on lit edges.", focus: "Does the weighted version feel more 3D?" },
  { id: "thumbnails", category: "composition", title: "6 composition thumbnails", minutes: 15, levels: ["beginner", "intermediate", "advanced"], instructions: "Draw 6 tiny (5 cm) thumbnails of the same scene with different croppings and focal points. Use only 3 values.", focus: "Which thumbnail has the clearest focal point, and why?" },
  { id: "mannequin", category: "anatomy", title: "Mannequin figures", minutes: 15, levels: ["beginner", "intermediate"], instructions: "Draw 6 figures as mannequins: egg-shaped ribcage, bucket pelvis, cylinders for limbs. Focus on how the ribcage and pelvis tilt against each other.", focus: "Do ribcage and pelvis tilt in believable opposition?" },
  { id: "hands-forms", category: "anatomy", title: "Hands as boxes", minutes: 15, levels: ["intermediate", "advanced"], instructions: "Draw 5 hand poses: palm as a flat box, fingers as stacked cylinders. Note how the knuckle line arcs.", focus: "Is the palm box consistent in perspective?" },
  { id: "one-point-room", category: "perspective", title: "One-point room", minutes: 20, levels: ["beginner", "intermediate"], instructions: "Draw a room interior in one-point perspective with a door, window and table. Use a ruler for the construction lines.", focus: "Do all depth lines hit the single vanishing point?" },
  { id: "three-point-tower", category: "perspective", title: "Three-point tower", minutes: 20, levels: ["advanced", "intermediate"], instructions: "Draw a tall building from a worm's-eye view. Place two VPs on the horizon and a third far above.", focus: "Do the verticals converge consistently?" },
  { id: "blind-contour", category: "still_life", title: "Blind contour", minutes: 8, levels: ["beginner", "intermediate", "advanced"], instructions: "Draw your hand or a mug without looking at the paper. Move your eye and pencil at the same slow speed.", focus: "Did you observe more edges than usual?" },
  { id: "rotated-boxes", category: "perspective", title: "Rotated boxes in space", minutes: 15, levels: ["intermediate", "advanced"], instructions: "Draw 10 boxes floating at random rotations, each with its own vanishing points. Check each against the Perspective Academy's rotating box.", focus: "Do boxes still look rectangular, not warped?" },
  { id: "five-value", category: "values", title: "5-value study", minutes: 20, levels: ["intermediate", "advanced"], instructions: "Use DrawLab's 5-value view. Map highlight, light, halftone, shadow and darkest accent. Keep the shadow family clearly separated from the light family.", focus: "Do halftones stay in the light family?" },
];

export const LESSONS = {
  perspective: [
    { id: "p-3d-space", title: "Understanding 3D space" },
    { id: "p-boxes", title: "Drawing basic boxes" },
    { id: "p-one-point", title: "One-point perspective" },
    { id: "p-two-point", title: "Two-point perspective" },
    { id: "p-three-point", title: "Three-point perspective" },
    { id: "p-rotating", title: "Rotating boxes in space" },
    { id: "p-ellipses", title: "Ellipses in perspective" },
    { id: "p-cylinders", title: "Cylinders in perspective" },
    { id: "p-environments", title: "Perspective in environments" },
    { id: "p-foreshortening", title: "Foreshortening" },
  ],
  light: [
    { id: "l-source", title: "Light source identification" },
    { id: "l-form-cast", title: "Form shadows vs cast shadows" },
    { id: "l-core", title: "The core shadow" },
    { id: "l-reflected", title: "Reflected light" },
    { id: "l-occlusion", title: "Ambient occlusion" },
    { id: "l-highlight", title: "Highlight placement" },
    { id: "l-shadow-shapes", title: "Shadow shapes" },
  ],
};

/** Deterministic daily selection: same picks for a user on a given day. */
export function dailyExercises(userId: number, level: Level, day: string, weakCategories: string[]): Exercise[] {
  let seed = 0;
  for (const ch of `${userId}:${day}`) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const pool = EXERCISES.filter((e) => e.levels.includes(level));
  const picks: Exercise[] = [];
  // One from the learner's weakest category, if we know it.
  for (const cat of weakCategories) {
    const opts = pool.filter((e) => e.category === cat);
    if (opts.length) {
      picks.push(opts[Math.floor(rand() * opts.length)]);
      break;
    }
  }
  const rest = pool.filter((e) => !picks.includes(e));
  while (picks.length < 3 && rest.length) {
    const i = Math.floor(rand() * rest.length);
    const [e] = rest.splice(i, 1);
    if (!picks.some((p) => p.category === e.category) || rest.length < 3) picks.push(e);
  }
  return picks;
}
