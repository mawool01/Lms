/**
 * Shared logic for drag-to-reorder: turning a submitted order into position
 * updates. Pure, so the validation can be checked without a database — see
 * scripts/reorder-check.ts.
 */

export type Positioned = { id: string; position: number };

/**
 * The position to give a newly created row, so it lands at the end of its list.
 *
 * Counting the existing rows is the obvious way to do this and is wrong: delete
 * one from the middle and the remaining positions are 0, 2, 3 while the count
 * is 3, so the next row is handed a 3 that is already taken. Two rows sharing a
 * position leave their order down to whatever the database returns for a tie,
 * which can differ between two queries and change between page loads. Taking
 * one past the highest position in use can't collide.
 */
export async function nextPosition<W>(
  model: { aggregate: (args: { where: W; _max: { position: true } }) => Promise<{ _max: { position: number | null } }> },
  where: W,
): Promise<number> {
  const { _max } = await model.aggregate({ where, _max: { position: true } });
  return (_max.position ?? -1) + 1;
}

/**
 * Works out the position updates for an explicitly given order.
 *
 * Returns null — meaning write nothing — unless `ids` is exactly a permutation
 * of the siblings' own ids. A reorder arrives from the browser as a list of
 * ids, so a stale list (someone else deleted an item meanwhile), a duplicated
 * id, or an id belonging to another user's list must not be able to reposition
 * anything.
 *
 * A row is skipped only when the position already stored for it is the one it
 * is meant to end up with. Comparing against the stored value rather than the
 * row's index in `siblings` matters: two rows can share a position (deleting a
 * row leaves a gap, and new rows used to be numbered from a count), and then
 * the database's idea of the order is a tie broken arbitrarily, which need not
 * match the order the browser was showing. Skipping on index trusted that
 * order, so a reorder could leave some rows unwritten and hand out a position
 * twice over — the list then settled into an order nobody asked for, with each
 * row appearing to take on its neighbour's details. Keying off the stored value
 * also means any run of this normalises the positions back to 0..n-1.
 */
export function orderUpdates<T extends { id: string; position: number }>(siblings: T[], ids: string[]): Positioned[] | null {
  if (ids.length !== siblings.length) return null;
  const known = new Set(siblings.map((s) => s.id));
  if (new Set(ids).size !== ids.length) return null; // a duplicate id
  if (ids.some((id) => !known.has(id))) return null; // an id we don't own
  const stored = new Map(siblings.map((s) => [s.id, s.position]));
  return ids.map((id, position) => ({ id, position })).filter((u) => stored.get(u.id) !== u.position);
}
