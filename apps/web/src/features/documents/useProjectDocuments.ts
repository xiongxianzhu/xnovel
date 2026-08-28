import { useQuery } from "@tanstack/react-query";

import {
  listProjectDocumentsRequest,
  type DocumentTreeStatus,
} from "./documentsApi";

export function projectDocumentsQueryKey(
  projectId: string,
  status: DocumentTreeStatus,
) {
  return ["projects", projectId, "documents", status] as const;
}

export function useProjectDocuments(
  projectId: string,
  status: DocumentTreeStatus = "active",
  enabled = true,
) {
  return useQuery({
    enabled: enabled && Boolean(projectId),
    queryFn: () => listProjectDocumentsRequest(projectId, status),
    queryKey: projectDocumentsQueryKey(projectId, status),
  });
}
