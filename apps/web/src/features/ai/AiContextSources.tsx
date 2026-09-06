import { useQuery } from "@tanstack/react-query";
import { Button, Checkbox } from "antd";
import { useTranslation } from "react-i18next";
import { getWritingRecall } from "../../shared/api/generated/sdk.gen";
import { apiClient } from "../../shared/api/client";
import { StudioError } from "../studio/StudioFrame";

export function AiContextSources({
  projectId,
  documentId,
  summaryIds,
  factIds,
  onChange,
}: {
  projectId: string;
  documentId?: string;
  summaryIds: string[];
  factIds: string[];
  onChange: (summaries: string[], facts: string[]) => void;
}) {
  const { t } = useTranslation("studio");
  const query = useQuery({
    queryKey: ["ai-recall-options", projectId, documentId],
    enabled: Boolean(documentId),
    queryFn: async () =>
      (
        await getWritingRecall({
          client: apiClient,
          path: { project_id: projectId },
          query: { document_id: documentId! },
        })
      ).data.data,
  });
  if (!documentId) return null;
  return (
    <section>
      {query.isError ? (
        <StudioError retry={() => void query.refetch()} />
      ) : null}
      {query.data?.summaries.length ? (
        <fieldset className="ai-skill-fieldset">
          <legend>{t("summaries")}</legend>
          <Checkbox.Group
            value={summaryIds}
            onChange={(values) => onChange(values.map(String), factIds)}
            options={query.data.summaries.map((item) => ({
              value: item.id,
              label: `${item.title}${item.source_stale ? ` · ${t("stale")}` : ""}`,
              disabled: Boolean(
                item.source_stale && !summaryIds.includes(item.id),
              ),
            }))}
          />
        </fieldset>
      ) : null}
      {query.data?.facts.length ? (
        <fieldset className="ai-skill-fieldset">
          <legend>{t("facts")}</legend>
          <Checkbox.Group
            value={factIds}
            onChange={(values) => onChange(summaryIds, values.map(String))}
            options={query.data.facts.map((item) => ({
              value: item.id,
              label: `${item.title}${item.source_stale ? ` · ${t("stale")}` : ""}`,
              disabled: Boolean(
                item.source_stale && !factIds.includes(item.id),
              ),
            }))}
          />
        </fieldset>
      ) : null}
      {summaryIds.length + factIds.length > 0 ? (
        <Button onClick={() => onChange([], [])}>{t("clearSelection")}</Button>
      ) : null}
    </section>
  );
}
