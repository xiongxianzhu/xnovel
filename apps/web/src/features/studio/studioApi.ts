import {
  listStudioSummary,
  getStudioSummary,
  createStudioSummary,
  updateStudioSummary,
  deleteStudioSummary,
  listStudioFact,
  getStudioFact,
  createStudioFact,
  updateStudioFact,
  deleteStudioFact,
  listStudioThread,
  getStudioThread,
  createStudioThread,
  updateStudioThread,
  deleteStudioThread,
  listStudioEvent,
  getStudioEvent,
  createStudioEvent,
  updateStudioEvent,
  deleteStudioEvent,
  listStudioKnowledge,
  getStudioKnowledge,
  createStudioKnowledge,
  updateStudioKnowledge,
  deleteStudioKnowledge,
  listStudioIssue,
  getStudioIssue,
  createStudioIssue,
  updateStudioIssue,
  deleteStudioIssue,
  listStudioPlan,
  getStudioPlan,
  createStudioPlan,
  updateStudioPlan,
  deleteStudioPlan,
  listStudioNote,
  getStudioNote,
  createStudioNote,
  updateStudioNote,
  deleteStudioNote,
  listStudioRule,
  getStudioRule,
  createStudioRule,
  updateStudioRule,
  deleteStudioRule,
} from "../../shared/api/generated/sdk.gen";
import type {
  SummaryData,
  SummaryInput,
  FactData,
  FactInput,
  ThreadData,
  ThreadInput,
  EventData,
  EventInput,
  KnowledgeData,
  KnowledgeInput,
  IssueData,
  IssueInput,
  PlanData,
  PlanInput,
  NoteData,
  NoteInput,
  RuleData,
  RuleInput,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";
import type { StudioKind } from "./studioConfig";
export type StudioRecord =
  | SummaryData
  | FactData
  | ThreadData
  | EventData
  | KnowledgeData
  | IssueData
  | PlanData
  | NoteData
  | RuleData;
export type StudioFormValues = Record<string, string>;
const apis = {
  summaries: {
    list: listStudioSummary,
    get: getStudioSummary,
    remove: deleteStudioSummary,
  },
  facts: { list: listStudioFact, get: getStudioFact, remove: deleteStudioFact },
  threads: {
    list: listStudioThread,
    get: getStudioThread,
    remove: deleteStudioThread,
  },
  events: {
    list: listStudioEvent,
    get: getStudioEvent,
    remove: deleteStudioEvent,
  },
  knowledge: {
    list: listStudioKnowledge,
    get: getStudioKnowledge,
    remove: deleteStudioKnowledge,
  },
  issues: {
    list: listStudioIssue,
    get: getStudioIssue,
    remove: deleteStudioIssue,
  },
  plans: { list: listStudioPlan, get: getStudioPlan, remove: deleteStudioPlan },
  notes: { list: listStudioNote, get: getStudioNote, remove: deleteStudioNote },
  rules: { list: listStudioRule, get: getStudioRule, remove: deleteStudioRule },
};
export async function listStudioRecords(
  kind: StudioKind,
  projectId: string,
  page: number,
  q: string,
  sourceDocumentId?: string,
) {
  return (
    await apis[kind].list({
      client: apiClient,
      path: { project_id: projectId },
      query: { page, page_size: 50, q, source_document_id: sourceDocumentId },
    })
  ).data.data;
}
export async function getStudioRecord(
  kind: StudioKind,
  projectId: string,
  recordId: string,
) {
  return (
    await apis[kind].get({
      client: apiClient,
      path: { project_id: projectId, record_id: recordId },
    })
  ).data.data;
}
export async function deleteStudioRecord(
  kind: StudioKind,
  projectId: string,
  recordId: string,
) {
  return (
    await apis[kind].remove({
      client: apiClient,
      path: { project_id: projectId, record_id: recordId },
    })
  ).data.data;
}
export async function saveStudioRecord(
  kind: StudioKind,
  projectId: string,
  recordId: string | undefined,
  values: StudioFormValues,
  version: number,
) {
  const path = { project_id: projectId, record_id: recordId ?? "" };
  const base = {
    title: values.title ?? "",
    body: values.body ?? "",
    source_document_id: values.source_document_id || null,
    source_version: values.source_version
      ? Number(values.source_version)
      : null,
    version,
  };
  switch (kind) {
    case "summaries": {
      const body: SummaryInput = {
        ...base,
        source_document_id: values.source_document_id || "",
        status: (values.status || "confirmed") as SummaryInput["status"],
      };
      const response = recordId
        ? await updateStudioSummary({ client: apiClient, path, body })
        : await createStudioSummary({ client: apiClient, path, body });
      return response.data.data;
    }
    case "facts": {
      const body: FactInput = {
        ...base,
        kind: (values.kind || "fact") as FactInput["kind"],
        character_id: values.character_id || null,
        story_order: values.story_order ? Number(values.story_order) : null,
      };
      const response = recordId
        ? await updateStudioFact({ client: apiClient, path, body })
        : await createStudioFact({ client: apiClient, path, body });
      return response.data.data;
    }
    case "threads": {
      const body: ThreadInput = {
        ...base,
        status: (values.status || "open") as ThreadInput["status"],
        target_document_id: values.target_document_id || null,
      };
      const response = recordId
        ? await updateStudioThread({ client: apiClient, path, body })
        : await createStudioThread({ client: apiClient, path, body });
      return response.data.data;
    }
    case "events": {
      const body: EventInput = {
        ...base,
        story_order: values.story_order ? Number(values.story_order) : null,
        time_label: values.time_label || "",
        location: values.location || "",
        participants: values.participants || "",
      };
      const response = recordId
        ? await updateStudioEvent({ client: apiClient, path, body })
        : await createStudioEvent({ client: apiClient, path, body });
      return response.data.data;
    }
    case "knowledge": {
      const body: KnowledgeInput = {
        ...base,
        character_id: values.character_id || "",
        story_order: values.story_order ? Number(values.story_order) : null,
        audience: (values.audience ||
          "character") as KnowledgeInput["audience"],
      };
      const response = recordId
        ? await updateStudioKnowledge({ client: apiClient, path, body })
        : await createStudioKnowledge({ client: apiClient, path, body });
      return response.data.data;
    }
    case "issues": {
      const body: IssueInput = {
        ...base,
        status: (values.status || "open") as IssueInput["status"],
        other_document_id: values.other_document_id || null,
        other_version: values.other_version
          ? Number(values.other_version)
          : null,
        evidence: values.evidence || "",
        other_evidence: values.other_evidence || "",
        resolution: values.resolution || "",
      };
      const response = recordId
        ? await updateStudioIssue({ client: apiClient, path, body })
        : await createStudioIssue({ client: apiClient, path, body });
      return response.data.data;
    }
    case "plans": {
      const body: PlanInput = {
        ...base,
        position: Number(values.position || 0),
        pov: values.pov || "",
        conflict: values.conflict || "",
        turning_point: values.turning_point || "",
        hook: values.hook || "",
        arc: values.arc || "",
        delivery_status: (values.delivery_status ||
          "draft") as PlanInput["delivery_status"],
      };
      const response = recordId
        ? await updateStudioPlan({ client: apiClient, path, body })
        : await createStudioPlan({ client: apiClient, path, body });
      return response.data.data;
    }
    case "notes": {
      const body: NoteInput = {
        ...base,
        status: (values.status || "open") as NoteInput["status"],
        quote: values.quote || "",
      };
      const response = recordId
        ? await updateStudioNote({ client: apiClient, path, body })
        : await createStudioNote({ client: apiClient, path, body });
      return response.data.data;
    }
    case "rules": {
      const body: RuleInput = {
        ...base,
        kind: (values.kind || "term") as RuleInput["kind"],
        preferred: values.preferred || "",
      };
      const response = recordId
        ? await updateStudioRule({ client: apiClient, path, body })
        : await createStudioRule({ client: apiClient, path, body });
      return response.data.data;
    }
  }
}
