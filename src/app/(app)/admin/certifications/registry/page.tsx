import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { HOLDER_PORTFOLIO_SELECT, HolderName } from "@/components/portfolio/holder-link";
import { addCertificationManually, importCertifications, linkCertificationHolder, reinstateCertification, revokeCertification, setDirectoryVisibility } from "@/lib/actions/certifications";
import { EXPIRING_SOON_DAYS } from "@/lib/certifications/status";
import { registryWhere } from "@/lib/certifications/registry";
import { CertStatePill, VerifyLink, expiryText } from "@/components/cert/cert-ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default async function RegistryPage({ searchParams }: { searchParams: Promise<{ q?: string; program?: string; state?: string }> }) {
  await requireRole("ADMIN");
  const { q = "", program = "", state = "" } = await searchParams;
  const [certs, programs] = await Promise.all([
    db.certification.findMany({
      where: registryWhere({ q, program, state }),
      include: { program: true, level: true, holder: HOLDER_PORTFOLIO_SELECT },
      orderBy: { issuedAt: "desc" },
      take: 500,
    }),
    db.certProgram.findMany({ orderBy: { position: "asc" }, include: { levels: { orderBy: { position: "asc" } } } }),
  ]);
  const unlinkedEmails = certs.filter((c) => !c.holderId && c.holderEmail).map((c) => c.holderEmail!);
  const accountEmails = new Set(
    unlinkedEmails.length ? (await db.user.findMany({ where: { email: { in: unlinkedEmails } }, select: { email: true } })).map((u) => u.email) : [],
  );
  const exportQuery = new URLSearchParams({ q, program, state }).toString();

  return (
    <div className="space-y-6">
      <Card title={`Certified registry (${certs.length})`} action={<a href={`/api/certifications/export?${exportQuery}`} className="btn-secondary btn-sm">⬇ Export CSV</a>}>
        <form className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input name="q" defaultValue={q} placeholder="Search name, email, center, institution or code" />
          <select name="program" defaultValue={program} className="sm:w-64">
            <option value="">All programs</option>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="state" defaultValue={state} className="sm:w-44">
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="expiring">Expiring within {EXPIRING_SOON_DAYS} days</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
          </select>
          <button className="btn-secondary">Filter</button>
        </form>
        {certs.length === 0 ? (
          <EmptyState icon="🎖️" title="No certifications match" />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Holder</th><th>Certification</th><th>Issued</th><th>Validity</th><th>Code</th><th></th></tr></thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <p className="font-medium">{c.centerName ?? <HolderName name={c.holderName} holder={c.holder} staff />}</p>
                      <p className="muted text-xs">{c.centerName ? <><HolderName name={c.holderName} holder={c.holder} staff /> · </> : ""}{c.institution}{!c.holderId && c.holderEmail && ` · ${c.holderEmail} (${accountEmails.has(c.holderEmail) ? "account exists — not linked" : "no account"})`}</p>
                    </td>
                    <td className="text-sm">{c.program.name}<p className="muted text-xs">{c.level.name}{c.isRenewal && " · renewal"}</p></td>
                    <td className="muted text-xs whitespace-nowrap">{formatDate(c.issuedAt)}</td>
                    <td><CertStatePill cert={c} /><p className="muted mt-1 text-xs">{expiryText(c)}</p></td>
                    <td><VerifyLink code={c.code} /></td>
                    <td>
                      <details className="relative">
                        <summary className="btn-ghost btn-sm cursor-pointer list-none">⋯</summary>
                        <div className="card absolute right-0 z-10 mt-1 w-72 space-y-2 p-3">
                          <a href={`/certifications/${c.id}/certificate`} className="btn-secondary btn-sm w-full">⬇ Certificate PDF</a>
                          {!c.holderId && c.holderEmail && accountEmails.has(c.holderEmail) && (
                            <form action={linkCertificationHolder.bind(null, c.id)}><button className="btn-primary btn-sm w-full">Link to {c.holderEmail}&apos;s account</button></form>
                          )}
                          <form action={setDirectoryVisibility.bind(null, c.id, !c.showInDirectory)}>
                            <button className="btn-secondary btn-sm w-full">{c.showInDirectory ? "Hide from directory" : "Show in directory"}</button>
                          </form>
                          {c.revokedAt ? (
                            <form action={reinstateCertification.bind(null, c.id)}><button className="btn-secondary btn-sm w-full">Reinstate</button></form>
                          ) : (
                            <ActionForm action={revokeCertification.bind(null, c.id)} className="space-y-2">
                              <input name="reason" placeholder="Reason for revoking" aria-label="Reason" required />
                              <SubmitButton className="btn-danger btn-sm w-full">Revoke</SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Record an existing certification">
          {programs.length === 0 ? (
            <p className="muted text-sm">Set up programs first.</p>
          ) : (
            <ActionForm action={addCertificationManually} resetOnSuccess className="space-y-3">
              <select name="levelId" defaultValue="" required aria-label="Program and level">
                <option value="" disabled>Program & level…</option>
                {programs.map((p) => (
                  <optgroup key={p.id} label={p.name}>
                    {p.levels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </optgroup>
                ))}
              </select>
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="holderName" placeholder="Holder name" aria-label="Holder name" required />
                <input name="holderEmail" type="email" placeholder="Email (links to their account)" aria-label="Holder email" />
                <input name="institution" placeholder="Institution" aria-label="Institution" />
                <input name="centerName" placeholder="Center name (centers only)" aria-label="Center name" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="field"><label htmlFor="issuedAt">Issued</label><input id="issuedAt" name="issuedAt" type="date" required /></div>
                <div className="field"><label htmlFor="expiresAt">Expires <span className="muted font-normal">(blank = by program rules)</span></label><input id="expiresAt" name="expiresAt" type="date" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" name="isRenewal" /> This was a renewal</label>
              <SubmitButton>Add certification</SubmitButton>
            </ActionForm>
          )}
        </Card>
        <Card title="Bulk import (CSV)">
          <ActionForm action={importCertifications} className="space-y-3">
            <textarea name="csv" rows={7} className="font-mono text-xs" required aria-label="CSV"
              placeholder={"program,level,name,email,institution,center,issued,expires\nlclc,Level 2,Jane Doe,jane@college.edu,State College,,2024-05-01,\nlclc,Level 4 (Lifetime),Ann Lee,ann@uni.edu,Big University,,2019-03-15,lifetime\nlc-certification,Learning Center of Excellence,Sam Ortiz,sam@cc.edu,City College,Tutoring Center,2023-09-01,2028-09-01"} />
            <p className="muted text-xs">
              One per line: program key ({programs.map((p) => p.key).join(", ") || "none yet"}), level name, holder name, email, institution, center name, issued date (YYYY-MM-DD), expiry (YYYY-MM-DD, &ldquo;lifetime&rdquo;, or blank to use program rules). A header row is skipped.
            </p>
            <SubmitButton>Import</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
