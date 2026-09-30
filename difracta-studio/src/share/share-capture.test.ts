import { settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import type { DifractaShare } from "./share-bridge";
import { captureSource } from "./share-capture";
import { fakeCaptured } from "./share-fakes";

const choices = { quality: "sharp", cursor: false } as const;

function desktop(listed = true) {
  const chosen: (string | null)[] = [];
  const bridge = {
    choose: (id: string | null) => {
      chosen.push(id);
      return Promise.resolve(listed);
    },
  } as unknown as DifractaShare;
  return { bridge, chosen };
}

function devices(outcome: MediaStream | Error) {
  const asked: unknown[] = [];
  return {
    asked,
    media: {
      getDisplayMedia: (constraints?: unknown) => {
        asked.push(constraints);
        return outcome instanceof Error
          ? Promise.reject(outcome)
          : Promise.resolve(outcome);
      },
    },
  };
}

const named = (name: string, message: string): Error =>
  Object.assign(new Error(message), { name });

describe("Capturing a screen or a window", () => {
  it("tells Desktop which source was chosen here, then asks for the capture", async () => {
    const { bridge, chosen } = desktop();
    const { stream, track } = fakeCaptured().captured;
    const { media, asked } = devices(stream);
    expect(await captureSource(bridge, choices, "window:41:0", media)).toEqual({
      kind: "captured",
      captured: { stream, track },
    });
    expect(chosen).toEqual(["window:41:0"]);
    const { sharer } = settings.shares;
    expect(asked).toEqual([
      {
        video: {
          frameRate: { ideal: sharer.qualities.sharp.frameRate },
          width: { max: sharer.maxWidth },
          height: { max: sharer.maxHeight },
          cursor: "never",
        },
        audio: false,
      },
    ]);
  });

  it("leaves the choice to the system's picker without a source", async () => {
    const { bridge, chosen } = desktop();
    const { media } = devices(fakeCaptured().captured.stream);
    const result = await captureSource(
      bridge,
      { quality: "smooth", cursor: true },
      undefined,
      media,
    );
    expect(result.kind).toBe("captured");
    expect(chosen).toEqual([]);
  });

  it("takes a system picker closed without a choice for a change of mind", async () => {
    const { bridge } = desktop();
    for (const name of ["NotAllowedError", "AbortError"])
      expect(
        await captureSource(
          bridge,
          choices,
          undefined,
          devices(named(name, "Refused")).media,
        ),
      ).toEqual({ kind: "cancelled" });
  });

  it("says why a capture did not start", async () => {
    const { bridge } = desktop();
    expect(
      await captureSource(
        bridge,
        choices,
        undefined,
        devices(named("NotReadableError", "Could not start video source"))
          .media,
      ),
    ).toEqual({
      kind: "failed",
      reason: "The capture could not start: Could not start video source",
    });
    // Chosen here, so a refusal is not the person's change of mind.
    expect(
      (
        await captureSource(
          bridge,
          choices,
          "screen:0:0",
          devices(named("AbortError", "Refused")).media,
        )
      ).kind,
    ).toBe("failed");
  });

  it("asks for nothing when the source chosen is no longer listed", async () => {
    const { bridge } = desktop(false);
    const { media, asked } = devices(fakeCaptured().captured.stream);
    expect(
      (await captureSource(bridge, choices, "window:41:0", media)).kind,
    ).toBe("failed");
    expect(asked).toEqual([]);
  });
});
