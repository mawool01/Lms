import type { Prisma } from "@prisma/client";
import { EXPIRING_SOON_DAYS } from "./status";

/** Shared filter for the admin registry page and its CSV export. */
export function registryWhere({ q = "", program = "", state = "" }: { q?: string; program?: string; state?: string }): Prisma.CertificationWhereInput {
  const now = new Date();
  const soon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86400000);
  const stateWhere: Prisma.CertificationWhereInput =
    state === "active" ? { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }
    : state === "expiring" ? { revokedAt: null, expiresAt: { gte: now, lte: soon } }
    : state === "expired" ? { revokedAt: null, expiresAt: { lt: now } }
    : state === "revoked" ? { revokedAt: { not: null } }
    : {};
  return {
    AND: [
      stateWhere,
      program ? { programId: program } : {},
      q
        ? {
            OR: [
              { holderName: { contains: q, mode: "insensitive" } },
              { holderEmail: { contains: q, mode: "insensitive" } },
              { centerName: { contains: q, mode: "insensitive" } },
              { institution: { contains: q, mode: "insensitive" } },
              { code: { contains: q.toUpperCase() } },
            ],
          }
        : {},
    ],
  };
}
