/** Version-neutral private package graph and raw-artifact mechanics. */
import { createHash } from "node:crypto";
import { types } from "node:util";
import { ManualArtifactSchema, type ManualArtifactKind } from "./manual-factory-schemas.ts";
import { copyManualBytes } from "./manual-json.ts";
import { createReferenceHash, type ReferenceNode } from "./identity.ts";

function fail(message: string): never { throw new TypeError(message); }
function need(condition: unknown, message: string): asserts condition { if (!condition) fail(message); }
const key = (node: { kind: string; id: string }) => node.kind + "\0" + node.id;
const hash = (value: Uint8Array) => "sha256:" + createHash("sha256").update(value).digest("hex");

export function copyManualArtifacts<T extends readonly string[]>(value: unknown, fields: T, required: readonly string[]): Record<T[number], Uint8Array> {
  if (!value || typeof value !== "object" || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail("Plain artifact object required");
  }
  const result: Record<string, Uint8Array> = {};
  for (const name of Reflect.ownKeys(value)) {
    if (typeof name !== "string" || !fields.includes(name)) fail("Unknown artifact field");
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) fail("Artifact accessors forbidden");
    result[name] = copyManualBytes(descriptor.value);
  }
  for (const name of required) if (!result[name]) fail("Required artifact missing");
  return result as Record<T[number], Uint8Array>;
}

export function createManualArtifactNode(id: string, kind: ManualArtifactKind, raw: Uint8Array): ReferenceNode {
  const bytes = copyManualBytes(raw);
  return { kind: "evidence", id, payload: {
    schemaVersion: "manual-artifact/1", artifactKind: kind, byteLength: bytes.length,
    bytesHash: hash(bytes), bytesBase64: Buffer.from(bytes).toString("base64"),
  }, references: [], contentHash: "" };
}

export function finalizeManualReferenceGraph(nodes: ReferenceNode[]): ReferenceNode[] {
  const map = new Map(nodes.map((node) => [key(node), node]));
  const active = new Set<string>();
  const cache = new Map<string, string>();
  need(map.size === nodes.length && nodes.length <= 100, "Duplicate or excessive graph nodes");
  const walk = (node: ReferenceNode, depth = 0): string => {
    const nodeKey = key(node);
    if (depth > 32 || active.has(nodeKey)) fail("Graph cycle or depth overflow");
    const known = cache.get(nodeKey);
    if (known) return known;
    need(new Set(node.references.map(key)).size === node.references.length, "Duplicate graph edge");
    active.add(nodeKey);
    const references = node.references.map((reference) => {
      const child = map.get(key(reference)); need(child, "Missing graph reference");
      return { ...reference, contentHash: walk(child!, depth + 1) };
    });
    const contentHash = createReferenceHash({ kind: node.kind, id: node.id, payload: node.payload, references });
    active.delete(nodeKey); cache.set(nodeKey, contentHash); node.contentHash = contentHash;
    return contentHash;
  };
  nodes.forEach((node) => walk(node));
  return nodes;
}

export function manualQuestionRoots(question: {
  taxonomyVersionId: string;
  stimulusVersionId?: string | null;
  provenanceIds: readonly string[];
  private: { evidenceRefs: readonly string[] };
}) {
  return [
    { kind: "taxonomy", id: question.taxonomyVersionId },
    ...(question.stimulusVersionId ? [{ kind: "stimulus", id: question.stimulusVersionId }] : []),
    ...question.provenanceIds.map((id) => ({ kind: "provenance", id })),
    ...question.private.evidenceRefs.map((id) => ({ kind: "evidence", id })),
  ];
}

export function isManualReferenceReachable(node: { kind: string; id: string }, nodes: readonly {
  kind: string; id: string; references: readonly { kind: string; id: string }[];
}[], refs: readonly { kind: string; id: string }[]): boolean {
  const map = new Map(nodes.map((candidate) => [key(candidate), candidate]));
  const seen = new Set<string>();
  const visit = (reference: { kind: string; id: string }) => {
    const refKey = key(reference);
    if (seen.has(refKey)) return;
    seen.add(refKey);
    const target = map.get(refKey); need(target, "Missing root");
    target!.references.forEach(visit);
  };
  refs.forEach(visit);
  return seen.has(key(node));
}

export function decodeManualArtifacts(artifactRefs: Record<string, { id: string; bytesHash: string } | undefined>, references: readonly {
  kind: string; id: string; payload: unknown; references: readonly unknown[];
}[], artifactKinds: Record<string, ManualArtifactKind>): Record<string, Uint8Array> {
  const artifacts: Record<string, Uint8Array> = {};
  for (const [name, ref] of Object.entries(artifactRefs)) {
    if (!ref) continue;
    const nodes = references.filter((node) => node.kind === "evidence" && node.id === ref.id);
    need(nodes.length === 1 && nodes[0]!.references.length === 0, "Artifact must be one leaf");
    const artifact = ManualArtifactSchema.parse(nodes[0]!.payload);
    const bytes = Buffer.from(artifact.bytesBase64, "base64");
    need(artifact.artifactKind === artifactKinds[name] && bytes.toString("base64") === artifact.bytesBase64
      && bytes.length === artifact.byteLength && hash(bytes) === artifact.bytesHash && ref.bytesHash === artifact.bytesHash,
    "Raw artifact mismatch");
    artifacts[name] = bytes;
  }
  return artifacts;
}
