import { describe, expect, it } from "vitest";

import { settings } from "../settings.ts";
import {
  captureConstraints,
  codecOrder,
  scaleDownBy,
  sendEncoding,
  sentSize,
} from "./share-quality.ts";

const { maxWidth, maxHeight, qualities } = settings.shares.sharer;

describe("What a Sharer sends", () => {
  it("leaves a picture that fits as it is", () => {
    expect(scaleDownBy({ width: 1280, height: 720 })).toBe(1);
    expect(scaleDownBy({ width: maxWidth, height: maxHeight })).toBe(1);
    expect(sentSize({ width: 800, height: 1000 })).toEqual({
      width: 800,
      height: 1000,
    });
  });

  it("scales a larger one down to fit, keeping its shape", () => {
    expect(scaleDownBy({ width: 3840, height: 2160 })).toBe(2);
    expect(sentSize({ width: 3840, height: 2160 })).toEqual({
      width: maxWidth,
      height: maxHeight,
    });
    // A tall window is held by its height, a wide one by its width.
    expect(sentSize({ width: 1200, height: 2160 })).toEqual({
      width: 600,
      height: maxHeight,
    });
    expect(sentSize({ width: 3840, height: 1080 })).toEqual({
      width: maxWidth,
      height: 540,
    });
  });

  it("takes a size it does not know for one that fits", () => {
    expect(scaleDownBy({ width: 0, height: 0 })).toBe(1);
    expect(scaleDownBy({ width: Number.NaN, height: 1080 })).toBe(1);
  });

  it("asks the capture for the quality's frame rate, the limit and the cursor or not", () => {
    expect(captureConstraints("sharp", false)).toEqual({
      frameRate: { ideal: qualities.sharp.frameRate },
      width: { max: maxWidth },
      height: { max: maxHeight },
      cursor: "never",
    });
    expect(captureConstraints("smooth", true).cursor).toBe("always");
  });

  it("encodes at the quality's bitrate and frame rate, scaled when the capture is too large", () => {
    expect(sendEncoding("smooth", { width: 1280, height: 720 })).toEqual({
      maxBitrate: qualities.smooth.maxBitrate,
      maxFramerate: qualities.smooth.frameRate,
      scaleResolutionDownBy: 1,
    });
    expect(
      sendEncoding("sharp", { width: 2560, height: 1440 })
        .scaleResolutionDownBy,
    ).toBeCloseTo(4 / 3);
  });

  it("offers the quality's codecs first, in its order, and the rest as they came", () => {
    const available = [
      { mimeType: "video/VP8" },
      { mimeType: "video/rtx" },
      { mimeType: "video/H264", sdpFmtpLine: "a" },
      { mimeType: "video/H264", sdpFmtpLine: "b" },
      { mimeType: "video/vp9" },
      { mimeType: "video/ulpfec" },
    ];
    expect(
      codecOrder(available, "sharp").map(
        (codec) => `${codec.mimeType}${codec.sdpFmtpLine ?? ""}`,
      ),
    ).toEqual([
      "video/vp9",
      "video/VP8",
      "video/H264a",
      "video/H264b",
      "video/rtx",
      "video/ulpfec",
    ]);
    expect(codecOrder(available, "smooth")[0]?.mimeType).toBe("video/VP8");
    expect(codecOrder([], "sharp")).toEqual([]);
  });
});
