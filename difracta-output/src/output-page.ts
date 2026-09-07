import type { DifractaClient, DocumentView } from "@difracta/client";
import type { DocumentSummary } from "@difracta/protocol";

import { FrameCanvas } from "./frame-canvas.ts";

interface OutputPageOptions {
  readonly client: DifractaClient;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLDivElement;
  readonly outputId: string | null;
}

/**
 * One Output: finds the open Document that owns the Output id, subscribes,
 * and drives the frame. Without an id it lists every Output the runtime has
 * so a display can be paired by clicking.
 */
export class OutputPage {
  readonly #options: OutputPageOptions;
  readonly #frame: FrameCanvas;
  #view: DocumentView | undefined;
  #unsubscribeView: (() => void) | undefined;

  constructor(options: OutputPageOptions) {
    this.#options = options;
    this.#frame = new FrameCanvas(options.canvas);
    options.client.phase.subscribe(() => this.#refresh());
    options.client.documents.subscribe(() => this.#refresh());
    this.#refresh();
  }

  #refresh(): void {
    const { client, outputId } = this.#options;
    if (client.phase.get() !== "connected") {
      this.#showOverlay(
        `<p>${client.phase.get() === "reconnecting" ? "Reconnecting to the runtime…" : "Connecting to the runtime…"}</p>`,
      );
      this.#frame.stop();
      return;
    }
    const documents = client.documents.get();
    if (outputId === null) {
      this.#showPicker(documents);
      return;
    }
    const owner = documents.find((summary) =>
      summary.outputs.some((output) => output.id === outputId),
    );
    if (owner === undefined) {
      this.#showOverlay(
        `<p>Output <code>${outputId}</code> is not part of any open Installation.</p>`,
      );
      this.#frame.stop();
      this.#detach();
      return;
    }
    this.#attach(owner, outputId);
  }

  #attach(owner: DocumentSummary, outputId: string): void {
    if (this.#view?.documentId !== owner.id) {
      this.#detach();
      const view = this.#options.client.openDocument(owner.id);
      this.#view = view;
      const render = (): void => {
        const document = view.get();
        if (document === undefined) return;
        const output = document.outputs[outputId];
        this.#frame.update({
          blackout: document.operational.blackout,
          limitPixelRatio: output?.limitPixelRatio ?? false,
          label: `${document.installation.name} · ${output?.name ?? outputId}`,
        });
      };
      this.#unsubscribeView = view.subscribePath([], render);
      render();
    }
    this.#options.overlay.hidden = true;
    this.#frame.start();
  }

  #detach(): void {
    this.#unsubscribeView?.();
    this.#unsubscribeView = undefined;
    if (this.#view !== undefined)
      this.#options.client.closeDocument(this.#view.documentId);
    this.#view = undefined;
  }

  #showPicker(documents: readonly DocumentSummary[]): void {
    const items = documents.flatMap((summary) =>
      summary.outputs.map(
        (output) =>
          `<li><a href="?output=${encodeURIComponent(output.id)}">${summary.name} · ${output.name}</a></li>`,
      ),
    );
    this.#showOverlay(
      items.length === 0
        ? "<p>No Outputs are configured on this runtime yet.</p>"
        : `<p>Pick the Output for this display</p><ul>${items.join("")}</ul>`,
    );
  }

  #showOverlay(html: string): void {
    this.#options.overlay.innerHTML = html;
    this.#options.overlay.hidden = false;
  }
}
