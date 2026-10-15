"use client";

import { Children, createContext, isValidElement, useContext, useEffect, useId, useState, type ReactElement, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

/** Lets SortableRow know when dragging is off, without each caller passing it down. */
const SortableDisabled = createContext(false);

/**
 * Drag-to-reorder for the app's reorderable lists (portfolio items, course
 * modules and lessons, certification criteria, lesson blocks, rubric criteria).
 *
 * Works with mouse, touch and keyboard: the grip is a real button, so Tab to it
 * then Space and the arrow keys move the row. The ↑/↓ buttons each list already
 * has are kept as well — they're the fallback when a drag misfires, and they
 * stay usable where dragging isn't practical.
 *
 * Rows stay server-rendered: pass each one as a <SortableRow id> child and only
 * the ordering happens on the client.
 *
 *   <SortableList ids={items.map((i) => i.id)} onReorder={save}>
 *     {items.map((i) => <SortableRow key={i.id} id={i.id}>…</SortableRow>)}
 *   </SortableList>
 */
export function SortableList({
  ids,
  onReorder,
  children,
  className,
  label,
  disabled = false,
}: {
  /** The current order, as given by the server. */
  ids: string[];
  /** Called with the new order. Reordering is shown immediately, so this only persists it. */
  onReorder: (ids: string[]) => void | Promise<unknown>;
  children: ReactNode;
  className?: string;
  /** Describes the list for screen readers, e.g. "positions". */
  label?: string;
  /** Renders a plain list with no grips — for viewers who may not reorder it. */
  disabled?: boolean;
}) {
  const [order, setOrder] = useState(ids);
  const context = useId();

  // Re-sync when the server sends a different set — an item added or deleted —
  // but not on every render, or an in-flight drag would snap back.
  const key = ids.join(",");
  useEffect(() => {
    setOrder((current) => (current.join(",") === key ? current : ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so taps and clicks on the
    // handle still behave like clicks and a touch drag doesn't fight scrolling.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rows = Children.toArray(children).filter((c): c is ReactElement<{ id: string }> => isValidElement(c));
  const ordered = order
    .map((id) => rows.find((r) => r.props.id === id))
    .filter((r): r is ReactElement<{ id: string }> => !!r);
  // Anything the order doesn't know about yet still renders, so a row can never vanish.
  const extra = rows.filter((r) => !order.includes(r.props.id));

  function onDragEnd(event: DragEndEvent) {
    if (disabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(order, from, to);
    setOrder(next); // optimistic: the row moves under the finger straight away
    void onReorder(next);
  }

  return (
    <DndContext
      id={context}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: `Press Space to start reordering ${label ?? "this list"}, then the arrow keys to move it, Space to drop, Escape to cancel.`,
        },
      }}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy} disabled={disabled}>
        <SortableDisabled.Provider value={disabled}>
          <ul className={className}>
            {ordered}
            {extra}
          </ul>
        </SortableDisabled.Provider>
      </SortableContext>
    </DndContext>
  );
}

/**
 * One row of a SortableList. Renders a grip on the left and the row's own
 * content beside it; `id` must match the id given to SortableList.
 */
export function SortableRow({
  id,
  children,
  className,
  handleClassName,
}: {
  id: string;
  children: ReactNode;
  className?: string;
  handleClassName?: string;
}) {
  const disabled = useContext(SortableDisabled);
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });

  if (disabled) return <li className={className}>{children}</li>;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-start gap-1", isDragging && "relative z-10 opacity-80 shadow-lg", className)}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        {...listeners}
        // touch-action: none stops the browser scrolling the page instead of
        // dragging the row; it's set only on the grip so the rest still scrolls.
        style={{ touchAction: "none" }}
        className={cn(
          "muted mt-1 shrink-0 cursor-grab touch-none rounded px-1.5 py-1 text-base leading-none select-none hover:bg-slate-100 active:cursor-grabbing dark:hover:bg-slate-800",
          handleClassName,
        )}
        aria-label="Reorder — press Space, then use the arrow keys"
        title="Drag to reorder"
      >
        ⠿
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}

/**
 * A row inside a SortableList that isn't reorderable — a SCORM package sitting
 * among a module's lessons, say. It reserves the grip's width with the same
 * markup, so its content lines up with the rows that do have one.
 */
export function StaticRow({ children, className }: { children: ReactNode; className?: string }) {
  const disabled = useContext(SortableDisabled);
  if (disabled) return <li className={className}>{children}</li>;
  return (
    <li className={cn("flex items-start gap-1", className)}>
      <span aria-hidden className="invisible mt-1 shrink-0 px-1.5 py-1 text-base leading-none select-none">⠿</span>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
