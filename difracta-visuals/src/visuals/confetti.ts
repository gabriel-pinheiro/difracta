import { cssColor, defineVisual, fit, type Random } from "@difracta/render/sdk";

interface Piece {
  /** Fall cycles per second at Fall Speed 1: the piece's own weight. */
  readonly fallRate: number;
  /** The column it falls down, 0 to 1 of the Target's width. */
  readonly x: number;
  readonly swayRate: number;
  readonly sizeScale: number;
  /** Which way and how fast it tumbles, -0.5 to 0.5 of Spin. */
  readonly spinBias: number;
  readonly flutterRate: number;
  /** 0 above the top edge, 1 below the bottom one, then around again. */
  fall: number;
  sway: number;
  spin: number;
  /** Edge-on to face-on and back, which makes a piece of paper flutter. */
  flutter: number;
}

function makePiece(random: Random): Piece {
  return {
    fallRate: 0.12 + random() * 0.18,
    x: random(),
    swayRate: 1.2 + random(),
    sizeScale: 0.6 + random() * 0.8,
    spinBias: random() - 0.5,
    flutterRate: 2.4 + random() * 2,
    fall: random(),
    sway: random() * Math.PI * 2,
    spin: random() * Math.PI * 2,
    flutter: random() * Math.PI * 2,
  };
}

export const confetti = defineVisual({
  id: "confetti",
  name: "Confetti",
  description:
    "Rectangular pieces in three colors fall, sway, tumble and flutter edge-on. Every clock runs from Fall Speed, so zero holds the whole shower in the air.",
  notes:
    "The celebration drop: a transparent overlay that reads as paper over any Visual below it, and best of all over a dark one. Pieces cycles how many are in the air at once and Piece Size is the long edge in Layer pixels, so 140 pieces at 9 px is a fine drizzle and 40 at 20 px is a heavy fall you can see from the back of the room. Colors A, B and C are dealt round-robin, so three of the same color reads as one. Sway is the horizontal wander as a share of the Target's width and Spin how fast pieces tumble, each piece taking its own share and direction of both; Sway 0 with Spin 0 is straight, dead ticker-tape. Fall Speed scales all of it together, and holding it at 0 freezes the shower rather than resetting it, which makes it a good Cue-free stinger when a Link rides it. Everything integrates, so any of these can be swept live. Each piece is one filled rectangle, so even 400 is cheap.",
  parameters: {
    colorA: { kind: "color", label: "Color A", default: [1, 0.251, 0.506, 1] },
    colorB: { kind: "color", label: "Color B", default: [0.251, 0.753, 1, 1] },
    colorC: { kind: "color", label: "Color C", default: [1, 0.839, 0.251, 1] },
    pieces: {
      kind: "number",
      label: "Pieces",
      default: 140,
      min: 20,
      max: 400,
      step: 10,
    },
    size: {
      kind: "number",
      label: "Piece Size",
      default: 9,
      min: 3,
      max: 24,
      step: 1,
      unit: "px",
    },
    speed: {
      kind: "number",
      label: "Fall Speed",
      default: 1,
      min: 0,
      max: 3,
      step: 0.05,
      unit: "x",
    },
    sway: {
      kind: "number",
      label: "Sway",
      default: 0.025,
      min: 0,
      max: 0.2,
      step: 0.005,
      percent: true,
      description: "How far a piece wanders sideways, as a share of the width.",
    },
    spin: {
      kind: "number",
      label: "Spin",
      default: 5,
      min: 0,
      max: 15,
      step: 0.5,
      description: "How fast pieces tumble as they fall.",
    },
  },
  create({ random, params }) {
    const all: Piece[] = [];
    fit(all, params.pieces, () => makePiece(random));
    return {
      update({ dt, params, changed }) {
        fit(all, params.pieces, () => makePiece(random));
        const step = dt * params.speed;
        for (const piece of all) {
          piece.fall += step * piece.fallRate;
          piece.fall -= Math.floor(piece.fall);
          piece.sway += step * piece.swayRate;
          piece.spin += step * piece.spinBias * params.spin;
          piece.flutter += step * piece.flutterRate;
        }
        return {
          changed: changed || params.speed > 0,
          blank:
            params.colorA[3] <= 0 &&
            params.colorB[3] <= 0 &&
            params.colorC[3] <= 0,
        };
      },
      render({ context, width, height, params }) {
        const palette = [params.colorA, params.colorB, params.colorC] as const;
        all.forEach((piece, index) => {
          const size = params.size * piece.sizeScale;
          const x = (piece.x + Math.sin(piece.sway) * params.sway) * width;
          const y = piece.fall * (height + size * 3) - size * 1.5;
          const flutter =
            size * 0.6 * (0.15 + 0.85 * Math.abs(Math.sin(piece.flutter)));

          context.save();
          context.translate(x, y);
          context.rotate(piece.spin);
          const color = palette[index % palette.length] ?? params.colorA;
          context.fillStyle = cssColor(color, 0.9 * color[3]);
          context.fillRect(-size / 2, -flutter / 2, size, flutter);
          context.restore();
        });
      },
    };
  },
});
