import type { DocumentView } from "@difracta/client";
import { childMedia, generateId, type Media, type Table } from "@difracta/core";
import { FilePlus } from "lucide-react";
import { useState } from "react";

import { NameDialog, type NameRequest } from "@/components/name-dialog";
import { useCommand, useDocumentPath } from "@/lib/client";
import { useBrowser } from "@/library/browser-state";
import { useExpansion } from "@/navigator/expansion";
import type { CreateItem } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { useSelection } from "@/selection/selection";

import { bundledMediaIcon, mediaGroupIcon } from "./media-icons";
import { MediaRows } from "./media-rows";
import { mediaWarningCount, type MediaLiveTable } from "./media-status";
import {
  hasBundledMedia,
  NO_BUNDLED_MEDIA,
  useCreateMedia,
} from "./use-create-media";

/**
 * Navigator section listing the Media items as a tree of Media Groups:
 * each file with its type's icon and, when the runtime cannot serve it,
 * why. The "+" of the section or of a Group offers File…, which asks for
 * the file first (a native picker in Desktop, a typed path in a browser)
 * since the item takes its name from the file; Bundled…, which adds an
 * item on the first Bundled Media entry at once and opens the Library on
 * it, so picking the clip is previewing it; and Group, which asks for a
 * name. A new item lands last in the Group whose "+" was used.
 */
export function MediaSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { select } = useSelection();
  const { setExpanded } = useExpansion();
  const media = useDocumentPath<Table<Media>>(view, ["media"]) ?? {};
  const live = useDocumentPath<MediaLiveTable>(view, ["live", "media"]) ?? {};
  const { openMedia } = useBrowser();
  const { create, createBundled, dialog } = useCreateMedia();
  const [naming, setNaming] = useState<NameRequest | undefined>(undefined);
  const roots = childMedia(media, null);

  const reveal = (parentId: string | null, id: string): void => {
    if (parentId !== null) setExpanded("media", parentId, true);
    select({ kind: "media", id });
  };

  function requestGroup(parentId: string | null): void {
    const siblings = childMedia(media, parentId);
    setNaming({
      title: "New Media Group",
      label: "Name",
      initial: `Group ${String(siblings.length + 1)}`,
      submitLabel: "Create",
      onSubmit: (name) => {
        const id = generateId("media");
        void command("media.create", {
          id,
          kind: "group",
          parentId,
          name,
        }).then(() => reveal(parentId, id));
      },
    });
  }

  const createItems = (parentId: string | null): readonly CreateItem[] => [
    {
      label: "File…",
      icon: FilePlus,
      onSelect: () =>
        create({ parentId, onCreated: (id) => reveal(parentId, id) }),
    },
    {
      label: "Bundled…",
      icon: bundledMediaIcon,
      disabled: hasBundledMedia() ? undefined : NO_BUNDLED_MEDIA,
      onSelect: () =>
        createBundled({
          parentId,
          onCreated: (id) => {
            reveal(parentId, id);
            openMedia(id, { created: true });
          },
        }),
    },
    {
      label: "Group",
      icon: mediaGroupIcon,
      onSelect: () => requestGroup(parentId),
    },
  ];

  return (
    <>
      <NavigatorSection
        storageKey="media"
        holds={["media"]}
        label="Media"
        empty={roots.length === 0 ? "No Media yet." : undefined}
        warnings={mediaWarningCount(media, live)}
        createItems={createItems(null)}
      >
        <MediaRows
          view={view}
          parentId={null}
          depth={1}
          createItems={createItems}
        />
      </NavigatorSection>
      {dialog}
      <NameDialog request={naming} onClose={() => setNaming(undefined)} />
    </>
  );
}
