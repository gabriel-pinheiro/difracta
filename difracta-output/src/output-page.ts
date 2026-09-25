import type { DifractaClient, DocumentView } from "@difracta/client";
import { settings } from "@difracta/core";
import {
  MAX_TELEMETRY_ISSUES,
  type DocumentSummary,
  type OutputTelemetry,
} from "@difracta/protocol";

import { FrameCanvas } from "./frame-canvas.ts";
import { chooseOutput } from "./output-choice.ts";

interface OutputPageOptions {
  readonly client: DifractaClient;
  readonly canvas: HTMLCanvasElement;
  readonly overlay: HTMLDivElement;
  /** The `?output=` value: an Output id or name, or null to pick one. */
  readonly output: string | null;
  /** Where a Media item's file is fetched from, by id, on the runtime this page talks to. */
  readonly mediaUrl: (id: string) => string;
}

/**
 * One Output: waits for the runtime's open Installation to contain the
 * Output its `?output=` id or name picks, subscribes to the document (without live state, which this page
 * never needs), attaches as an Output Session and drives the frame. Without
 * an id it lists every Output of the Installation so a display can be paired
 * by clicking, and it lists them under the message too when the value names
 * no Output or several. Everything shown is built as DOM nodes and text,
 * never as HTML, since the query and the names come from outside. Telemetry goes out once a second while attached.
 */
export class OutputPage {
  readonly #options: OutputPageOptions;
  readonly #frame: FrameCanvas;
  #view: DocumentView | undefined;
  /** The Output being drawn; a name may resolve to another id later. */
  #outputId: string | undefined;
  #unsubscribeView: (() => void) | undefined;
  #telemetryTimer: number | undefined;

  constructor(options: OutputPageOptions) {
    this.#options = options;
    this.#frame = new FrameCanvas(options.canvas, {
      mediaUrl: options.mediaUrl,
    });
    options.client.phase.subscribe(() => this.#refresh());
    options.client.document.subscribe(() => this.#refresh());
    this.#refresh();
  }

  #refresh(): void {
    const { client, output } = this.#options;
    if (client.phase.get() !== "connected") {
      this.#showOverlay([
        paragraph(
          client.phase.get() === "reconnecting"
            ? "Reconnecting to the runtime…"
            : "Connecting to the runtime…",
        ),
      ]);
      this.#pause();
      return;
    }
    const summary = client.document.get();
    if (summary === null) {
      this.#showOverlay([
        paragraph("No Installation is open on this runtime."),
      ]);
      this.#pause();
      this.#detach();
      return;
    }
    if (output === null) {
      this.#showOverlay(picker(summary));
      return;
    }
    const choice = chooseOutput(summary.outputs, output);
    if (choice.kind === "found") {
      this.#attach(summary, choice.id);
      return;
    }
    const problem =
      choice.kind === "unknown"
        ? paragraph(
            "No Output of “",
            summary.name,
            "” is called or identified “",
            code(output),
            "”.",
          )
        : paragraph(
            `${choice.matches.length} Outputs of “`,
            summary.name,
            "” are called “",
            code(output),
            "”; open one by its id.",
          );
    this.#showOverlay([problem, ...picker(summary)]);
    this.#pause();
    this.#detach();
  }

  #attach(summary: DocumentSummary, outputId: string): void {
    const { client } = this.#options;
    const moved = this.#outputId !== outputId;
    this.#outputId = outputId;
    if (this.#view?.documentId !== summary.id) {
      this.#detach();
      const view = client.openDocument(summary.id);
      this.#view = view;
      const unsubscribeRender = view.subscribePath([], () => this.#render());
      const unsubscribeEvents = view.subscribeEvents((address) => {
        const [entity, layerId, field, key] = address.split("/");
        if (entity === "layer" && field === "cue" && layerId && key)
          this.#frame.trigger(layerId, key);
      });
      this.#unsubscribeView = () => {
        unsubscribeRender();
        unsubscribeEvents();
      };
      this.#render();
    } else if (moved) this.#render();
    client.attach(outputId);
    this.#options.overlay.hidden = true;
    this.#frame.start();
    this.#telemetryTimer ??= window.setInterval(
      () => this.#report(),
      settings.live.telemetryIntervalMs,
    );
  }

  #render(): void {
    const document = this.#view?.get();
    const outputId = this.#outputId;
    if (document === undefined || outputId === undefined) return;
    this.#frame.update({ document, outputId });
  }

  #report(): void {
    const { layers, shaders, filters, issues, ...metrics } =
      this.#frame.metrics();
    const telemetry: OutputTelemetry = {
      ...metrics,
      workload: {
        canvasVisuals: {
          executedPerFrame: layers.renderedPerFrame,
          enabled: layers.running,
          relevant: layers.planned,
        },
        shaderVisuals: {
          executedPerFrame: shaders.renderedPerFrame,
          enabled: shaders.running,
          relevant: shaders.planned,
        },
        filters: {
          executedPerFrame: filters.executedPerFrame,
          enabled: filters.running,
          relevant: filters.planned,
        },
      },
      issues: issues.slice(0, MAX_TELEMETRY_ISSUES),
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

  #showOverlay(content: readonly Node[]): void {
    const box = document.createElement("div");
    box.append(...content);
    this.#options.overlay.replaceChildren(box);
    this.#options.overlay.hidden = false;
  }
}

/** A paragraph of text and inline nodes; strings are only ever text. */
function paragraph(...parts: readonly (string | Node)[]): HTMLParagraphElement {
  const element = document.createElement("p");
  element.append(...parts);
  return element;
}

function code(text: string): HTMLElement {
  const element = document.createElement("code");
  element.textContent = text;
  return element;
}

/** Every Output of the Installation as a link that opens this page on it. */
function picker(summary: DocumentSummary): Node[] {
  if (summary.outputs.length === 0)
    return [paragraph("“", summary.name, "” has no Outputs yet.")];
  const list = document.createElement("ul");
  list.className = "picker";
  for (const output of summary.outputs) {
    const link = document.createElement("a");
    link.href = `?output=${encodeURIComponent(output.id)}`;
    link.textContent = output.name;
    const item = document.createElement("li");
    item.append(link);
    list.append(item);
  }
  return [paragraph("Pick the Output for this display"), list];
}
