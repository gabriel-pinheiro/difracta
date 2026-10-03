import { defineFilter } from "@difracta/render/sdk";

export const kaleido = defineFilter({
  id: "kaleido",
  name: "Kaleido",
  description:
    "Folds the picture into pie slices around a centre, each a mirror of its neighbour, like a kaleidoscope.",
  notes:
    "A kaleidoscope over the picture: the plane is cut into Segments wedges around Centre, one wedge of the source is drawn in every one of them, alternately mirrored, so any clip becomes a mandala and motion in it becomes a bloom. Segments is the number of wedges, 2 to 16; 2 is a single fold, 6 the classic, high counts turn fine detail into lace. Rotation turns the whole pattern in degrees, and linking it to a Number Controller or sweeping it from a Macro spins the mandala, which with a still clip is the cheapest motion there is. Centre X and Centre Y place the hub in the picture, 0.5 and 0.5 being the middle; off-centre pulls more of one side of the clip into the wedges. Wedges are measured true to the picture's shape, from its size on the Output, so a 6-fold is six equal wedges on a wide Surface too. Pixels asked for past the picture's edge reflect back in, so the pattern has no blank rays. It always does something, so there is no setting at which it passes through. Nothing is animated by itself: it redraws when a Parameter changes, or every frame when the clip under it moves. It belongs inside a Visual Layer, folding one clip on its own wall, where it follows the Surface's mapping and stays inside its Masks; at the root it folds the whole frame around a point of the projector's image, across Surfaces. Stack Hue Shift or Colorize over it for colour, or Transform under it to choose the part of the clip that feeds the wedges.",
  parameters: {
    segments: {
      kind: "number",
      label: "Segments",
      default: 6,
      min: 2,
      max: 16,
      step: 1,
      description: "How many wedges the picture is cut into.",
    },
    rotation: {
      kind: "number",
      label: "Rotation",
      default: 0,
      min: -180,
      max: 180,
      step: 1,
      unit: "°",
      description: "Turns the whole pattern; sweep it to spin.",
    },
    centreX: {
      kind: "number",
      label: "Centre X",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      description: "The hub's position across the picture.",
    },
    centreY: {
      kind: "number",
      label: "Centre Y",
      default: 0.5,
      min: 0,
      max: 1,
      step: 0.01,
      description: "The hub's position down the picture.",
    },
  },
  fragment: `
vec4 filter_image(vec2 uv) {
  vec2 centre = vec2(u_centreX, u_centreY);
  vec2 shape = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 p = (uv - centre) * shape;
  float radius = length(p);
  float turn = radians(u_rotation);
  float wedge = 6.2831853 / u_segments;
  float angle = atan(p.y, p.x) - turn;
  angle = abs(mod(angle, wedge) - wedge * 0.5) + turn;
  vec2 source = vec2(cos(angle), sin(angle)) * radius / shape + centre;
  return sample_mirrored(source);
}`,
});
