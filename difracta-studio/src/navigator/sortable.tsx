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
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

interface SortableContext {
  readonly kind: string;
}

const Context = createContext<SortableContext | undefined>(undefined);

/**
 * Reordering by drag and drop within one list, plus Alt+Up / Alt+Down on the
 * selected row. `onMove(id, after)` reports the wanted position; the list
 * itself re-renders only when the runtime's delta arrives.
 */
export function SortableList({
  kind,
  ids,
  selectedId,
  onMove,
  children,
}: {
  /** Drags only land on lists of the same kind. */
  readonly kind: string;
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

  useEffect(() => {
    const move = (id: string, after: string | null): void => {
      const { ids: current, onMove: report } = latest.current;
      const index = current.indexOf(id);
      if (index === -1 || after === id) return;
      const currentAfter = current[index - 1] ?? null;
      if (after === currentAfter) return;
      report(id, after);
    };

    const stopMonitoring = monitorForElements({
      canMonitor: ({ source }) => source.data.kind === kind,
      onDrop: ({ source, location }) => {
        const target = location.current.dropTargets[0];
        if (target === undefined) return;
        const edge = extractClosestEdge(target.data);
        const targetId = target.data.id;
        const sourceId = source.data.id;
        if (typeof targetId !== "string" || typeof sourceId !== "string")
          return;
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
  }, [kind]);

  return <Context.Provider value={{ kind }}>{children}</Context.Provider>;
}

/** One draggable row and drop target; shows a line on the edge a drop would land on. */
export function SortableItem({
  id,
  children,
}: {
  readonly id: string;
  readonly children: ReactNode;
}) {
  const context = useContext(Context);
  if (context === undefined)
    throw new Error("SortableItem needs a SortableList.");
  const { kind } = context;
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    return combine(
      draggable({
        element,
        getInitialData: () => ({ kind, id }),
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
          source.data.kind === kind && source.data.id !== id,
        getData: ({ input, element: self }) =>
          attachClosestEdge(
            { kind, id },
            { input, element: self, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self }) => setEdge(extractClosestEdge(self.data)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [kind, id]);

  return (
    <div ref={ref} className={cn("relative", dragging && "opacity-40")}>
      {children}
      {edge !== null && (
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
