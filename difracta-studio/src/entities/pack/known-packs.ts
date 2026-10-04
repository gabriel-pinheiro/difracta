import type { DocumentView } from "@difracta/client";
import type { PackAttachment, Table } from "@difracta/core";
import type { KnownPack, LiveState } from "@difracta/protocol";
import { useEffect, useState } from "react";

import { useClient, useDocumentPath } from "@/lib/client";

/**
 * The Packs the runtime's machine knows (its Registry) that the open
 * Installation does not attach: what "Add Pack ▸" offers besides a folder.
 * Asked for when the section mounts and again whenever the attached or
 * loaded Packs change, since attaching takes one off the list.
 */
export function useKnownPacks(view: DocumentView): readonly KnownPack[] {
  const client = useClient();
  const attached =
    useDocumentPath<Table<PackAttachment>>(view, ["packs"]) ?? {};
  const loaded =
    useDocumentPath<LiveState["packs"]>(view, ["live", "packs"]) ?? {};
  const attachedKey = Object.keys(attached).sort().join(",");
  const loadedKey = Object.keys(loaded).sort().join(",");
  const [known, setKnown] = useState<readonly KnownPack[]>([]);
  useEffect(() => {
    let current = true;
    client
      .request<readonly KnownPack[]>("packs.known", {})
      .then((packs) => {
        if (current) setKnown(packs);
      })
      .catch(() => {
        if (current) setKnown([]);
      });
    return () => {
      current = false;
    };
  }, [client, attachedKey, loadedKey]);
  return known.filter((pack) => !(pack.id in attached));
}
