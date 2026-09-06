export const studioKinds = [
  "summaries",
  "facts",
  "threads",
  "events",
  "knowledge",
  "issues",
  "plans",
  "notes",
  "rules",
] as const;
export type StudioKind = (typeof studioKinds)[number];
export type StudioField = {
  key: string;
  type?: "number" | "document" | "character" | "textarea";
  options?: readonly string[];
  required?: boolean;
};
export const studioFields: Record<StudioKind, StudioField[]> = {
  summaries: [
    { key: "status", options: ["confirmed", "candidate", "rejected"] },
  ],
  facts: [
    { key: "kind", options: ["fact", "plan", "inference"] },
    { key: "character_id", type: "character" },
    { key: "story_order", type: "number" },
  ],
  threads: [
    {
      key: "status",
      options: ["open", "progressing", "resolved", "abandoned"],
    },
    { key: "target_document_id", type: "document" },
  ],
  events: [
    { key: "story_order", type: "number" },
    { key: "time_label" },
    { key: "location" },
    { key: "participants" },
  ],
  knowledge: [
    { key: "character_id", type: "character", required: true },
    { key: "story_order", type: "number" },
    { key: "audience", options: ["character", "reader", "author"] },
  ],
  issues: [
    { key: "status", options: ["open", "resolved", "ignored"] },
    { key: "other_document_id", type: "document" },
    { key: "other_version", type: "number" },
    { key: "evidence", type: "textarea" },
    { key: "other_evidence", type: "textarea" },
    { key: "resolution", type: "textarea" },
  ],
  plans: [
    { key: "position", type: "number" },
    { key: "pov" },
    { key: "conflict", type: "textarea" },
    { key: "turning_point", type: "textarea" },
    { key: "hook", type: "textarea" },
    { key: "arc" },
    {
      key: "delivery_status",
      options: ["draft", "revising", "ready", "published"],
    },
  ],
  notes: [
    { key: "status", options: ["open", "resolved", "ignored"] },
    { key: "quote", type: "textarea" },
  ],
  rules: [
    { key: "kind", options: ["term", "pov", "tense", "expression"] },
    { key: "preferred", type: "textarea" },
  ],
};
export function isStudioKind(value: string | undefined): value is StudioKind {
  return studioKinds.some((kind) => kind === value);
}
