/**
 * The screen the Live thumbnail shows, since the harness has nobody to
 * share one: a desktop with one window, a video in it and a list beside,
 * drawn on a canvas whose stream is shared from inside the page
 * (`loopbackShares`), so the thumbnail is still what the Visual made of a
 * share that reached it. `draw` paints it again, which is what gives the
 * stream a frame.
 */
const WIDTH = 1280;
const HEIGHT = 720;

export interface SharedScreen {
  readonly stream: MediaStream;
  draw(): void;
  stop(): void;
}

export function sharedScreen(): SharedScreen {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("No canvas to draw the screen on.");
  const box = (
    color: string,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number | number[] = 0,
  ): void => {
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    context.fill();
  };
  const draw = (): void => {
    const desktop = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
    desktop.addColorStop(0, "#1d3557");
    desktop.addColorStop(1, "#6d2e46");
    context.fillStyle = desktop;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    // The window, its title bar and its three buttons.
    box("#f4f1ea", 120, 70, 1040, 580, 18);
    box("#d9d4c7", 120, 70, 1040, 56, [18, 18, 0, 0]);
    ["#e76f51", "#e9c46a", "#2a9d8f"].forEach((color, index) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(156 + index * 34, 98, 10, 0, Math.PI * 2);
      context.fill();
    });
    box("#ffffff", 300, 84, 620, 28, 14);
    // The video, with its play mark.
    box("#14213d", 150, 150, 680, 382, 8);
    context.fillStyle = "#fca311";
    context.beginPath();
    context.moveTo(450, 281);
    context.lineTo(450, 401);
    context.lineTo(550, 341);
    context.closePath();
    context.fill();
    box("#b8b2a2", 150, 552, 420, 22, 6);
    box("#d9d4c7", 150, 588, 260, 16, 6);
    // The list beside it.
    for (let row = 0; row < 5; row += 1) {
      const y = 150 + row * 98;
      box("#2a9d8f", 860, y, 120, 76, 6);
      box("#b8b2a2", 996, y + 8, 140, 16, 6);
      box("#d9d4c7", 996, y + 36, 100, 12, 6);
    }
  };
  draw();
  const stream = canvas.captureStream();
  return {
    stream,
    draw,
    stop: () => {
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
