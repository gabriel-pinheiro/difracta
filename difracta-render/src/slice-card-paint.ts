import type { Slice } from "@difracta/core";

type Context2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

export interface SliceCardLook {
  readonly slice: Pick<Slice, "name" | "rect" | "rotation">;
  /** Its position among the Output's Slices, which picks its hue. */
  readonly index: number;
  readonly selected: boolean;
  /** The checker cell, in Display pixels. */
  readonly cell: number;
}

/** Hues step by the golden angle, so any number of Slices stay apart. */
const HUE_STEP = 137.508;
const WHITE = "#ffffff";
/** How much an unselected Slice is darkened, from 0 (not) to 1 (black). */
const DIM = 0.55;
/**
 * The name's height: a fraction of the card's longer side, at most a
 * fraction of its shorter one (so a long strip still gets a readable name),
 * and never below a minimum in pixels.
 */
const NAME_OF_LONG = 0.08;
const NAME_OF_SHORT = 0.3;
const NAME_MIN = 12;
/** Line width as a fraction of the card's shorter side, at least 1 pixel. */
const LINE = 1 / 240;

/** The Slice's hue as a CSS colour: clean and saturated. */
export function sliceHue(index: number): string {
  return `hsl(${String((index * HUE_STEP) % 360)} 90% 55%)`;
}

/** The checker's other cells: the same hue, dimmer, so the panel stays its colour. */
export function sliceShade(index: number): string {
  return `hsl(${String((index * HUE_STEP) % 360)} 90% 30%)`;
}

/**
 * Paints one Slice's test card on a `width` × `height` canvas covering its
 * placed rectangle, in stage orientation: a checker counted in Display
 * pixels from the Slice's Display top-left in its hue and a dimmer shade of
 * it, so its cells line up with LED
 * modules whatever the rotation; a white border, both diagonals and an
 * inscribed circle; the name and Display size on a dark plate, reading
 * upright when the Slice is placed right. An unselected Slice is dimmed.
 */
export function paintSliceCard(
  context: Context2D,
  width: number,
  height: number,
  look: SliceCardLook,
): void {
  const { slice } = look;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = sliceShade(look.index);
  context.fillRect(0, 0, width, height);

  // Display pixels → card pixels: the rotation turns the Display rectangle
  // clockwise onto the stage, then it fills the card.
  const { width: dw, height: dh } = slice.rect;
  const sideways = slice.rotation === 90 || slice.rotation === 270;
  const kx = width / (sideways ? dh : dw);
  const ky = height / (sideways ? dw : dh);
  const turn = {
    0: [kx, 0, 0, ky, 0, 0],
    90: [0, ky, -kx, 0, dh * kx, 0],
    180: [-kx, 0, 0, -ky, dw * kx, dh * ky],
    270: [0, -ky, kx, 0, 0, dw * ky],
  }[slice.rotation] as [number, number, number, number, number, number];
  context.setTransform(...turn);
  context.fillStyle = sliceHue(look.index);
  const cell = Math.max(1, look.cell);
  for (let row = 0; row * cell < dh; row++)
    for (let column = (row % 2) * 1; column * cell < dw; column += 2)
      context.fillRect(
        column * cell,
        row * cell,
        Math.min(cell, dw - column * cell),
        Math.min(cell, dh - row * cell),
      );
  context.setTransform(1, 0, 0, 1, 0, 0);

  const side = Math.min(width, height);
  const line = Math.max(1, Math.round(side * LINE));
  context.strokeStyle = WHITE;
  context.lineWidth = line;
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(width, height);
  context.moveTo(width, 0);
  context.lineTo(0, height);
  context.stroke();
  context.beginPath();
  context.arc(width / 2, height / 2, side / 2 - line * 2, 0, Math.PI * 2);
  context.stroke();
  // The border twice the line, inside the card so it never falls on a neighbour.
  context.lineWidth = line * 2;
  context.strokeRect(line, line, width - line * 2, height - line * 2);

  plate(context, width, height, look);

  if (!look.selected) {
    context.fillStyle = `rgba(0, 0, 0, ${String(DIM)})`;
    context.fillRect(0, 0, width, height);
  }
}

/** The name and the Display size on a dark plate in the card's centre. */
function plate(
  context: Context2D,
  width: number,
  height: number,
  look: SliceCardLook,
): void {
  const name = look.slice.name;
  const size = `${String(look.slice.rect.width)}×${String(look.slice.rect.height)}`;
  let nameSize = Math.max(
    NAME_MIN,
    Math.min(
      Math.max(width, height) * NAME_OF_LONG,
      Math.min(width, height) * NAME_OF_SHORT,
    ),
  );
  const font = (pixels: number, weight: number) =>
    `${String(weight)} ${String(Math.round(pixels))}px system-ui, sans-serif`;
  // Shrink to fit a narrow card, never below the minimum.
  context.font = font(nameSize, 700);
  const fit = (width * 0.8) / Math.max(1, context.measureText(name).width);
  if (fit < 1) nameSize = Math.max(NAME_MIN, nameSize * fit);
  const sizeSize = Math.max(NAME_MIN * 0.75, nameSize * 0.5);
  context.font = font(nameSize, 700);
  const nameWidth = context.measureText(name).width;
  context.font = font(sizeSize, 500);
  const sizeWidth = context.measureText(size).width;
  const pad = nameSize * 0.35;
  const plateWidth = Math.max(nameWidth, sizeWidth) + pad * 2;
  const plateHeight = nameSize + sizeSize * 1.2 + pad * 2;
  const left = (width - plateWidth) / 2;
  const top = (height - plateHeight) / 2;
  context.fillStyle = "rgba(0, 0, 0, 0.85)";
  context.fillRect(left, top, plateWidth, plateHeight);
  context.fillStyle = WHITE;
  context.textAlign = "center";
  context.textBaseline = "top";
  context.font = font(nameSize, 700);
  context.fillText(name, width / 2, top + pad);
  context.font = font(sizeSize, 500);
  context.fillStyle = "rgba(255, 255, 255, 0.8)";
  context.fillText(size, width / 2, top + pad + nameSize * 1.1);
}
