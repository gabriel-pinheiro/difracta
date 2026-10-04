import type { DocumentView } from "@difracta/client";
import {
  BUNDLED_PACK_ID,
  generateId,
  orderedEntries,
  type PackAttachment,
  type Share,
  type Table,
} from "@difracta/core";
import type { LiveState } from "@difracta/protocol";
import { FolderOpen } from "lucide-react";

import { useKnownPacks } from "@/entities/pack/known-packs";
import { usePackActions } from "@/entities/pack/pack-actions";
import { PackRow, type PackRowItem } from "@/entities/pack/pack-rows";
import { packRowStatus } from "@/entities/pack/pack-status";
import { ShareRows } from "@/entities/share/share-rows";
import { shareLive } from "@/entities/share/share-slots";
import { useCommand, useDocumentPath } from "@/lib/client";
import type { CreateItem } from "@/navigator/navigator-row";
import { NavigatorSection } from "@/navigator/navigator-section";
import { useSelection } from "@/selection/selection";

import { mediaTypeIcons, packIcon } from "./media-icons";

/**
 * Navigator section "Media": the Packs the Installation has, the Bundled
 * Pack first and the attached ones by name, each with what the runtime
 * says of it, then the Screen Shares in their order with who shares into
 * each. The "+" adds a Pack, from a folder on the runtime's machine where
 * that is allowed or one the machine already knows, or a Screen Share. The
 * header counts the missing Packs and interrupted shares while collapsed.
 * A Pack's entries have no rows: a selected entry keeps its Pack's row
 * shown as holding the selection.
 */
export function MediaSection({ view }: { readonly view: DocumentView }) {
  const command = useCommand(view);
  const { select } = useSelection();
  const actions = usePackActions(view);
  const known = useKnownPacks(view);
  const attached =
    useDocumentPath<Table<PackAttachment>>(view, ["packs"]) ?? {};
  const packsLive =
    useDocumentPath<LiveState["packs"]>(view, ["live", "packs"]) ?? {};
  const shares = useDocumentPath<Table<Share>>(view, ["shares"]) ?? {};
  const sharesLive =
    useDocumentPath<LiveState["shares"]>(view, ["live", "shares"]) ?? {};

  const packs: readonly PackRowItem[] = [
    { id: BUNDLED_PACK_ID, name: "Bundled", bundled: true },
    ...Object.values(attached)
      .map((pack) => ({ id: pack.id, name: pack.name, bundled: false }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
  ];
  const shareRows = orderedEntries(shares);
  const missing = packs.filter(
    (pack) => packRowStatus(packsLive[pack.id]).kind === "missing",
  ).length;
  const interrupted = shareRows.filter(
    (share) => shareLive(sharesLive[share.id]).status === "interrupted",
  ).length;

  const createItems: readonly CreateItem[] = [
    {
      label: "Add Pack",
      icon: packIcon,
      onSelect: () => undefined,
      items: [
        {
          label: "From folder…",
          icon: FolderOpen,
          onSelect: actions.addFromFolder,
          disabled: actions.gate,
        },
        ...known.map((pack) => ({
          label: pack.name,
          icon: packIcon,
          onSelect: () => actions.attachKnown(pack),
        })),
      ],
    },
    {
      label: "Screen Share",
      icon: mediaTypeIcons.live,
      onSelect: () => {
        const id = generateId("share");
        void command("share.create", { id }).then(() =>
          select({ kind: "share", id }),
        );
      },
    },
  ];

  return (
    <NavigatorSection
      storageKey="media"
      holds={["pack", "entry", "share"]}
      label="Media"
      warnings={missing + interrupted}
      createItems={createItems}
    >
      {packs.map((pack) => (
        <PackRow
          key={pack.id}
          view={view}
          pack={pack}
          live={packsLive[pack.id]}
          actions={actions}
        />
      ))}
      <ShareRows view={view} shares={shareRows} live={sharesLive} />
    </NavigatorSection>
  );
}
