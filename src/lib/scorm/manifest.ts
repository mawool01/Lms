import { XMLParser } from "fast-xml-parser";

export type ParsedManifest = {
  version: "SCORM_12" | "SCORM_2004";
  title: string | null;
  launchPath: string;
  launchParams: string;
  masteryScore: number | null;
  scoCount: number;
};

type Node = Record<string, unknown>;

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "object") return text((v as Node)["#text"]);
  return String(v).trim();
};
/** Strips XML namespace prefixes so "adlcp:scormtype" and "scormType" can be looked up uniformly. */
const attr = (node: Node, name: string) => {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(node)) {
    if (!k.startsWith("@_")) continue;
    const local = k.slice(2).split(":").pop()!.toLowerCase();
    if (local === want) return String(v);
  }
  return undefined;
};
const child = (node: Node, name: string): unknown => {
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("@_")) continue;
    if (k.split(":").pop()!.toLowerCase() === want) return v;
  }
  return undefined;
};

function joinPath(...parts: string[]) {
  const out: string[] = [];
  for (const part of parts.join("/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

/** Parses imsmanifest.xml and finds the launchable SCO for the default organization. */
export function parseManifest(xml: string): ParsedManifest {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: false, parseTagValue: false });
  const doc = parser.parse(xml) as Node;
  const manifest = child(doc, "manifest") as Node | undefined;
  if (!manifest) throw new Error("imsmanifest.xml has no <manifest> element.");

  const metadata = child(manifest, "metadata") as Node | undefined;
  const schemaVersion = metadata ? text(child(metadata, "schemaversion")) : null;

  const resourcesNode = (child(manifest, "resources") as Node) ?? {};
  const resourcesBase = attr(resourcesNode, "base") ?? "";
  const manifestBase = attr(manifest, "base") ?? "";
  const resources = asArray(child(resourcesNode, "resource") as Node | Node[]);

  // Version detection: schemaversion, otherwise the attribute casing (1.2 uses scormtype, 2004 uses scormType).
  let version: ParsedManifest["version"] = "SCORM_12";
  if (schemaVersion && /2004|CAM 1\.3/i.test(schemaVersion)) version = "SCORM_2004";
  else if (!schemaVersion && xml.includes("adlcp:scormType")) version = "SCORM_2004";
  else if (!schemaVersion && /adlcp_v1p3|imsss/i.test(xml)) version = "SCORM_2004";

  const isSco = (r: Node) => (attr(r, "scormtype") ?? "").toLowerCase() === "sco";
  const scoCount = resources.filter(isSco).length;

  // Walk the default organization's item tree to find the first item that references a resource.
  const orgsNode = (child(manifest, "organizations") as Node) ?? {};
  const orgs = asArray(child(orgsNode, "organization") as Node | Node[]);
  const defaultOrgId = attr(orgsNode, "default");
  const org = orgs.find((o) => attr(o, "identifier") === defaultOrgId) ?? orgs[0];
  const title = org ? text(child(org, "title")) : null;

  let launchItem: Node | undefined;
  const walk = (items: Node[]) => {
    for (const item of items) {
      if (launchItem) return;
      const ref = attr(item, "identifierref");
      if (ref && resources.some((r) => attr(r, "identifier") === ref && attr(r, "href"))) {
        launchItem = item;
        return;
      }
      walk(asArray(child(item, "item") as Node | Node[]));
    }
  };
  if (org) walk(asArray(child(org, "item") as Node | Node[]));

  let resource = launchItem ? resources.find((r) => attr(r, "identifier") === attr(launchItem!, "identifierref")) : undefined;
  resource ??= resources.find((r) => isSco(r) && attr(r, "href")) ?? resources.find((r) => attr(r, "href"));
  if (!resource) throw new Error("No launchable resource was found in imsmanifest.xml.");

  const href = attr(resource, "href")!;
  const [hrefPath, hrefQuery = ""] = href.split("?");
  const launchPath = joinPath(manifestBase, resourcesBase, attr(resource, "base") ?? "", hrefPath);
  const itemParams = launchItem ? (attr(launchItem, "parameters") ?? "").replace(/^[?&]/, "") : "";
  const launchParams = [hrefQuery, itemParams].filter(Boolean).join("&");

  const mastery = launchItem ? text(child(launchItem, "masteryscore")) : null;
  const masteryScore = mastery !== null && mastery !== "" && Number.isFinite(Number(mastery)) ? Number(mastery) : null;

  return { version, title, launchPath, launchParams, masteryScore, scoCount };
}
