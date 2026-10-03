import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

import { dragData, takesVariant } from "./sortable-data";

interface SortableContext {
  readonly kind: string;
  readonly listId: string;
  /** The variants the list's rows may be; undefined takes any. */
  readonly variants: readonly string[] | undefined;
}

const Context = createContext<SortableContext | undefined>(undefined);

/**
 * Reordering by drag and drop, plus Alt+Up / Alt+Down on the selected row.
 * `onMove(id, after)` reports the wanted position; the list itself re-renders
 * only when the runtime's delta arrives. Lists of one kind accept each
 * other's rows: `id` may then belong to another list, and `after` names a
 * row of this one.
 */
export function SortableList({
  kind,
  listId = kind,
  variants,
  ids,
  selectedId,
  onMove,
  children,
}: {
  /** Drags only land on lists of the same kind. */
  readonly kind: string;
  /** Tells lists of one kind apart; defaults to the kind for a single list. */
  readonly listId?: string;
  /** Row variants this list takes, such as only Filter Layers inside a Visual Layer; undefined takes any. */
  readonly variants?: readonly string[] | undefined;
  /** Ids in current display order. */
  readonly ids: readonly string[];
  readonly selectedId: string | undefined;
  readonly onMove: (id: string, after: string | null) => void;
  readonly children: ReactNode;
}) {
  // Read by long-lived listeners below without re-registering them per render.
  const latest = useRef({ ids, selectedId, onMove });
  useEffect(() => {
    latest.current = { ids, selectedId, onMove };
  });
  const variantsKey = variants?.join(" ");

  useEffect(() => {
    const move = (id: string, after: string | null): void => {
      const { ids: current, onMove: report } = latest.current;
      const index = current.indexOf(id);
      if (after === id) return;
      if (index !== -1) {
        const currentAfter = current[index - 1] ?? null;
        if (after === currentAfter) return;
      }
      report(id, after);
    };

    const stopMonitoring = monitorForElements({
      canMonitor: ({ source }) => source.data.kind === kind,
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (target === undefined) return;
        // Drops inside a row are the row's own business.
        if (target.data.inside === true) return;
        const targetData = dragData(target.data);
        const sourceData = dragData(source.data);
        if (targetData === undefined || sourceData === undefined) return;
        if (targetData.listId !== listId) return;
        const edge = extractClosestEdge(target.data);
        const targetId = targetData.id;
        const sourceId = sourceData.id;
        const current = latest.current.ids;
        const after =
          edge === "top"
            ? (current[current.indexOf(targetId) - 1] ?? null)
            : targetId;
        // Dropping just below itself: the neighbour above is the wanted "after".
        move(
          sourceId,
          after === sourceId
            ? (current[current.indexOf(sourceId) - 1] ?? null)
            : after,
        );
      },
    });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        !event.altKey ||
        (event.key !== "ArrowUp" && event.key !== "ArrowDown")
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const { ids: current, selectedId: selected } = latest.current;
      if (selected === undefined) return;
      const index = current.indexOf(selected);
      if (index === -1) return;
      event.preventDefault();
      if (event.key === "ArrowUp" && index > 0)
        move(selected, current[index - 2] ?? null);
      if (event.key === "ArrowDown" && index < current.length - 1)
        move(selected, current[index + 1] ?? null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      stopMonitoring();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [kind, listId]);

  const context = useMemo(
    () => ({
      kind,
      listId,
      variants: variantsKey === undefined ? undefined : variantsKey.split(" "),
    }),
    [kind, listId, variantsKey],
  );
  return <Context.Provider value={context}>{children}</Context.Provider>;
}

/** Rows that take a dropped row into themselves: a Group, a Scene, a Visual Layer. */
export interface DropInside {
  /** Source kinds accepted, such as "layer" on a Scene row. */
  readonly kinds: readonly string[];
  /** Among rows of the list's own kind, only these variants; undefined takes any. */
  readonly variants?: readonly string[] | undefined;
  readonly onDrop: (sourceId: string) => void;
}

/**
 * One draggable row and drop target; shows a line on the edge a drop would
 * land on. A descendant marked `data-drag-handle` becomes the only place a
 * drag starts, for rows holding controls of their own.
 */
export function SortableItem({
  id,
  variant,
  inside,
  children,
}: {
  readonly id: string;
  /** The row's variant within the list's kind, such as a Layer's kind; what lists and rows may limit. */
  readonly variant?: string | undefined;
  /** Accepts drops onto the row's middle, shown as an outline. */
  readonly inside?: DropInside | undefined;
  readonly children: ReactNode;
}) {
  const context = useContext(Context);
  if (context === undefined)
    throw new Error("SortableItem needs a SortableList.");
  const { kind, listId, variants } = context;
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<Edge | "inside" | null>(null);
  const [dragging, setDragging] = useState(false);
  const latestInside = useRef(inside);
  useEffect(() => {
    latestInside.current = inside;
  });
  const insideKinds = inside?.kinds.join(" ") ?? "";
  const insideVariants = inside?.variants?.join(" ");
  const listVariants = variants?.join(" ");

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const split = (joined: string | undefined) => joined?.split(" ");
    const acceptsInside = (source: Record<string, unknown>): boolean =>
      typeof source.kind === "string" &&
      insideKinds.split(" ").includes(source.kind) &&
      (source.kind !== kind ||
        takesVariant(split(insideVariants), source.variant));
    // A row of the list's own kind lands before or after this one only when
    // the list takes its variant; a Group over a Visual Layer's Filters does not.
    const acceptsBeside = (source: Record<string, unknown>): boolean =>
      source.kind === kind && takesVariant(split(listVariants), source.variant);
    const handle = element.querySelector<HTMLElement>("[data-drag-handle]");
    return combine(
      draggable({
        element,
        ...(handle === null ? {} : { dragHandle: handle }),
        getInitialData: () => ({ kind, id, listId, variant }),
        // A translucent copy of the row follows the pointer, so the drop line
        // underneath stays readable.
        onGenerateDragPreview: ({ nativeSetDragImage, location }) => {
          setCustomNativeDragPreview({
            nativeSetDragImage,
            getOffset: preserveOffsetOnSource({
              element,
              input: location.current.input,
            }),
            render: ({ container }) => {
              const copy = element.cloneNode(true) as HTMLElement;
              copy.style.width = `${String(element.getBoundingClientRect().width)}px`;
              copy.style.opacity = "0.5";
              copy.style.background = "var(--sidebar-accent)";
              copy.style.borderRadius = "var(--radius-sm)";
              container.appendChild(copy);
            },
          });
        },
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          source.data.id !== id &&
          (acceptsBeside(source.data) || acceptsInside(source.data)),
        getData: ({ input, element: self, source }) => {
          const sameKind = acceptsBeside(source.data);
          const data = { kind, id, listId, variant };
          // The row is the first child; an open Group's wrapper also holds
          // its children's rows, which must not count as the row.
          const row = self.firstElementChild ?? self;
          if (!acceptsInside(source.data)) {
            return attachClosestEdge(data, {
              input,
              element: row,
              allowedEdges: ["top", "bottom"],
            });
          }
          // The middle half of a row that takes children means "inside";
          // the edges keep meaning "before" or "after" for rows of its kind.
          const rect = row.getBoundingClientRect();
          const y = (input.clientY - rect.top) / Math.max(1, rect.height);
          if (!sameKind || (y > 0.25 && y < 0.75))
            return { ...data, inside: true };
          return attachClosestEdge(data, {
            input,
            element: row,
            allowedEdges: ["top", "bottom"],
          });
        },
        // Every row up the chain hears the drag; only the innermost shows it.
        onDrag: ({ self, location }) =>
          setEdge(
            location.current.dropTargets[0]?.element !== element
              ? null
              : self.data.inside === true
                ? "inside"
                : extractClosestEdge(self.data),
          ),
        onDragLeave: () => setEdge(null),
        onDrop: ({ self, source, location }) => {
          setEdge(null);
          // Every row up the chain gets the drop (a Scene row wraps its
          // Layers); only the innermost one takes it.
          if (location.current.dropTargets[0]?.element !== element) return;
          const sourceId = source.data.id;
          if (self.data.inside === true && typeof sourceId === "string")
            latestInside.current?.onDrop(sourceId);
        },
      }),
    );
  }, [kind, id, listId, variant, insideKinds, insideVariants, listVariants]);

  return (
    <div
      ref={ref}
      title="Drag to reorder, or Alt+↑ / Alt+↓ on the selected row"
      className={cn(
        "relative",
        dragging && "opacity-40",
        edge === "inside" && "rounded-sm ring-1 ring-selection ring-inset",
      )}
    >
      {children}
      {edge !== null && edge !== "inside" && (
        <div
          className={cn(
            "pointer-events-none absolute right-1 left-1 h-0.5 rounded-full bg-selection",
            edge === "top" ? "-top-px" : "-bottom-px",
          )}
        />
      )}
    </div>
  );
}
