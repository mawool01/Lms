-- Renumber every ordered list to 0..n-1.
--
-- New rows used to be given a position counted from how many rows already
-- existed, so once anything had been deleted the count pointed at a position
-- still in use and two rows ended up sharing one. A tie leaves the order to
-- whatever the database returns, which can differ between queries and change
-- between page loads, and a drag-to-reorder could then write a partial update
-- and settle the list into an order nobody asked for.
--
-- Code now takes one past the highest position in use, so no new collisions
-- appear. This repairs the lists that already collided. Ties are resolved by
-- the row id, which only has to be stable, not meaningful: these lists are
-- already in an arbitrary order wherever positions are equal.

UPDATE "PortfolioItem" t SET "position" = r."n" FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "userId", "type" ORDER BY "position", "id") - 1)::int AS "n" FROM "PortfolioItem"
) r WHERE t."id" = r."id" AND t."position" <> r."n";

UPDATE "Module" t SET "position" = r."n" FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "courseId" ORDER BY "position", "id") - 1)::int AS "n" FROM "Module"
) r WHERE t."id" = r."id" AND t."position" <> r."n";

UPDATE "Lesson" t SET "position" = r."n" FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "moduleId" ORDER BY "position", "id") - 1)::int AS "n" FROM "Lesson"
) r WHERE t."id" = r."id" AND t."position" <> r."n";

UPDATE "Question" t SET "position" = r."n" FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "quizId" ORDER BY "position", "id") - 1)::int AS "n" FROM "Question"
) r WHERE t."id" = r."id" AND t."position" <> r."n";

UPDATE "CertLevel" t SET "position" = r."n" FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "programId" ORDER BY "position", "id") - 1)::int AS "n" FROM "CertLevel"
) r WHERE t."id" = r."id" AND t."position" <> r."n";

UPDATE "CertCriterion" t SET "position" = r."n" FROM (
  SELECT "id", (ROW_NUMBER() OVER (PARTITION BY "programId" ORDER BY "position", "id") - 1)::int AS "n" FROM "CertCriterion"
) r WHERE t."id" = r."id" AND t."position" <> r."n";
