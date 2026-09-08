import type { DifractaClient, DocumentView } from "@difracta/client";
import { settings } from "@difracta/core";
import type { DocumentSummary, OutputTelemetry } from "@difracta/protocol";

import { FrameCanvas } from "./frame-canvas.ts";

interface OutputPageOptions {
  readonly client: DifractaClient;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLDivElement;
  readonly outputId: string | null;
}

const noWorkload = { executedPerFrame: 0, enabled: 0, relevant: 0 };

/**
 * One Output: waits for the runtime's open Installation to contain the
 * Output id, subscribes to the document (without live state, which this page
 * never needs), attaches as an Output Session and drives the frame. Without
 * an id it lists every Output of the Installation so a display can be paired
 * by clicking. Telemetry goes out once a second while attached.
 */
export class OutputPage {
  readonly #options: OutputPageOptions;
  readonly #frame: FrameCanvas;
  #view: DocumentView | undefined;
  #unsubscribeView: (() => void) | undefined;
  #telemetryTimer: number | undefined;

  constructor(options: OutputPageOptions) {
    this.#options = options;
    this.#frame = new FrameCanvas(options.canvas);
    options.client.phase.subscribe(() => this.#refresh());
    options.client.document.subscribe(() => this.#refresh());
    this.#refresh();
  }

  #refresh(): void {
    const { client, outputId } = this.#options;
    if (client.phase.get() !== "connected") {
      this.#showOverlay(
        `<p>${client.phase.get() === "reconnecting" ? "Reconnecting to the runtime…" : "Connecting to the runtime…"}</p>`,
      );
      this.#pause();
      return;
    }
    const summary = client.document.get();
    if (summary === null) {
      this.#showOverlay("<p>No Installation is open on this runtime.</p>");
      this.#pause();
      this.#detach();
      return;
    }
    if (outputId === null) {
      this.#showPicker(summary);
      return;
    }
    if (!summary.outputs.some((output) => output.id === outputId)) {
      this.#showOverlay(
        `<p>Output <code>${outputId}</code> is not part of “${summary.name}”.</p>`,
      );
      this.#pause();
      this.#detach();
      return;
    }
    this.#attach(summary, outputId);
  }

  #attach(summary: DocumentSummary, outputId: string): void {
    const { client } = this.#options;
    if (this.#view?.documentId !== summary.id) {
      this.#detach();
      const view = client.openDocument(summary.id);
      this.#view = view;
      const render = (): void => {
        const document = view.get();
        if (document === undefined) return;
        this.#frame.update({ document, outputId });
      };
      this.#unsubscribeView = view.subscribePath([], render);
      render();
    }
    client.attach(outputId);
    this.#options.overlay.hidden = true;
    this.#frame.start();
    this.#telemetryTimer ??= window.setInterval(
      () => this.#report(),
      settings.live.telemetryIntervalMs,
    );
  }

  #report(): void {
    const metrics = this.#frame.metrics();
    const telemetry: OutputTelemetry = {
      ...metrics,
      workload: {
        canvasVisuals: noWorkload,
        shaderVisuals: noWorkload,
        filters: noWorkload,
      },
    };
    this.#options.client.report(telemetry);
  }

  /** Stops drawing and reporting; keeps the subscription for a quick resume. */
  #pause(): void {
    this.#frame.stop();
    if (this.#telemetryTimer !== undefined)
      window.clearInterval(this.#telemetryTimer);
    this.#telemetryTimer = undefined;
  }

  #detach(): void {
    this.#options.client.attach(null);
    this.#unsubscribeView?.();
    this.#unsubscribeView = undefined;
    if (this.#view !== undefined)
      this.#options.client.closeDocument(this.#view.documentId);
    this.#view = undefined;
  }

  #showPicker(summary: DocumentSummary): void {
    const items = summary.outputs.map(
      (output) =>
        `<li><a href="?output=${encodeURIComponent(output.id)}">${output.name}</a></li>`,
    );
    this.#showOverlay(
      items.length === 0
        ? `<p>“${summary.name}” has no Outputs yet.</p>`
        : `<p>Pick the Output for this display</p><ul>${items.join("")}</ul>`,
    );
  }

  #showOverlay(html: string): void {
    this.#options.overlay.innerHTML = html;
    this.#options.overlay.hidden = false;
  }
}
