import { mediaTypeOf, settings } from "@difracta/core";
import { describe, expect, it } from "vitest";

import { mediaDialogFilters } from "./media-dialog.ts";

describe("mediaDialogFilters", () => {
  it("offers every extension media.create accepts, all together first", () => {
    const [all, images, videos] = mediaDialogFilters();
    expect(all?.name).toBe("Images and videos");
    expect(all?.extensions).toEqual([
      ...settings.media.imageExtensions,
      ...settings.media.videoExtensions,
    ]);
    expect(images?.extensions.map((ext) => mediaTypeOf(`a.${ext}`))).toEqual(
      images?.extensions.map(() => "image"),
    );
    expect(videos?.extensions.map((ext) => mediaTypeOf(`a.${ext}`))).toEqual(
      videos?.extensions.map(() => "video"),
    );
  });
});
