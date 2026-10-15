/**
 * Shared logic for drag-to-reorder: turning a submitted order into position
 * updates. Pure, so the validation can be checked without a database — see
 * scripts/reorder-check.ts.
 */

export type Positioned = { id: string; position: number };

/**
 * Works out the position updates for an explicitly given order.
 *
 * Returns null — meaning write nothing — unless `ids` is exactly a permutation
 * of the siblings' own ids. A reorder arrives from the browser as a list of
 * ids, so a stale list (someone else deleted an item meanwhile), a duplicated
 * id, or an id belonging to another user's list must not be able to reposition
 * anything. Only rows whose position actually changes are returned, so the
 * common case of dragging one row writes two or three updates rather than all
 * of them.
 */
export function orderUpdates<T extends { id: string }>(siblings: T[], ids: string[]): Positioned[] | null {
  if (ids.length !== siblings.length) return null;
  const known = new Set(siblings.map((s) => s.id));
  if (new Set(ids).size !== ids.length) return null; // a duplicate id
  if (ids.some((id) => !known.has(id))) return null; // an id we don't own
  const was = new Map(siblings.map((s, position) => [s.id, position]));
  return ids.map((id, position) => ({ id, position })).filter((u) => was.get(u.id) !== u.position);
}
