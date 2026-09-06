import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import { Eye, ExternalLink } from "lucide-react";
import type {
  SummaryData,
  FactData,
  ThreadData,
} from "../../shared/api/generated/types.gen";
import { SelectField } from "../../shared/ui/SelectField";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Drawer } from "antd";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "../../shared/api/client";
import {
  getWritingRecall,
  listProjectDocuments,
} from "../../shared/api/generated/sdk.gen";
import {
  SourceLabel,
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";
import { useEffect, useState } from "react";

export function RecallContents({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId: string;
}) {
  const { t } = useTranslation("studio");
  const [storyOrder, setStoryOrder] = useState("");
  const query = useQuery({
    queryKey: ["recall", projectId, documentId, storyOrder],
    enabled: Boolean(documentId),
    queryFn: async () =>
      (
        await getWritingRecall({
          client: apiClient,
          path: { project_id: projectId },
          query: {
            document_id: documentId,
            ...(storyOrder ? { story_order: Number(storyOrder) } : {}),
          },
        })
      ).data.data,
  });
  if (!documentId) return <p>{t("chooseChapter")}</p>;
  return (
    <>
      <p className="studio-notice">{t("recallDescription")}</p>
      <p className="studio-notice">{t("parallelFactsNotice")}</p>
      <label className="studio-field">
        {t("story_order")}
        <input
          type="number"
          min={0}
          value={storyOrder}
          onChange={(event) => setStoryOrder(event.target.value)}
        />
      </label>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError retry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.stale_count > 0 ? (
            <Alert type="warning" showIcon title={t("stale")} />
          ) : null}
          {(["summaries", "facts", "threads"] as const).map((kind) => (
            <section key={kind}>
              <h2>{t(kind)}</h2>
              {!query.data[kind].length ? (
                <p>{t("empty")}</p>
              ) : (
                <RecordTable<SummaryData | FactData | ThreadData>
                  items={query.data[kind]}
                  columns={[
                    {
                      title: t("title"),
                      dataIndex: "title",
                      width: 200,
                      ellipsis: true,
                    },
                    {
                      title: t("body"),
                      dataIndex: "body",
                      width: 320,
                      ellipsis: true,
                    },
                    {
                      title: t("source"),
                      dataIndex: "source_title",
                      width: 170,
                      ellipsis: true,
                      render: (value: string | null) => value ?? t("manual"),
                    },
                    {
                      title: t("sourceState"),
                      key: "sourceState",
                      width: 170,
                      render: (_, row) => (
                        <SourceLabel
                          stale={row.source_stale}
                          missing={row.source_missing}
                          manual={!row.source_document_id}
                        />
                      ),
                    },
                    ...(kind === "facts"
                      ? [
                          {
                            title: t("story_order"),
                            key: "story_order",
                            width: 160,
                            render: (
                              _: unknown,
                              row: SummaryData | FactData | ThreadData,
                            ) =>
                              "story_order" in row
                                ? (row.story_order ?? t("unknown"))
                                : "—",
                          },
                        ]
                      : []),
                    ...(kind === "threads"
                      ? [
                          {
                            title: t("status"),
                            key: "status",
                            width: 150,
                            render: (
                              _: unknown,
                              row: SummaryData | FactData | ThreadData,
                            ) =>
                              "overdue" in row && row.overdue
                                ? t("overdue")
                                : "status" in row
                                  ? t(row.status ?? "unknown")
                                  : "—",
                          },
                        ]
                      : []),
                    {
                      title: t("admin:actions"),
                      key: "actions",
                      width: 112,
                      fixed: "right",
                      align: "center",
                      render: (_, row) => (
                        <div className="record-actions">
                          <RowAction
                            label={t("details")}
                            icon={Eye}
                            to={`/projects/${projectId}/studio/${kind}/${row.id}`}
                          />
                          {row.source_document_id ? (
                            <RowAction
                              label={t("openSource")}
                              icon={ExternalLink}
                              to={`/projects/${projectId}?document=${row.source_document_id}`}
                            />
                          ) : null}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
              <Link
                className="studio-link-button"
                to={`/projects/${projectId}/studio/${kind}/new`}
              >
                {t("create")}
              </Link>
            </section>
          ))}
        </>
      )}
    </>
  );
}

export function RecallPage() {
  const { projectId = "" } = useParams();
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const documents = useQuery({
    queryKey: ["recall-documents", projectId],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const selected =
    params.get("document") ??
    documents.data?.items.find((item) => item.kind === "manuscript")?.id ??
    "";
  return (
    <StudioFrame
      title={t("recall")}
      back={`/projects/${projectId}`}
      actions={
        <Link
          className="studio-link-button"
          to={`/projects/${projectId}/batches/new`}
        >
          {t("summary")}
        </Link>
      }
    >
      <label className="studio-field">
        {t("chooseChapter")}
        <SelectField
          value={selected}
          onValueChange={(value) => setParams({ document: value })}
        >
          {documents.data?.items
            .filter((item) => item.kind === "manuscript")
            .map((item) => (
              <option value={item.id} key={item.id}>
                {item.title}
              </option>
            ))}
        </SelectField>
      </label>
      <RecallContents projectId={projectId} documentId={selected} />
    </StudioFrame>
  );
}

export function RecallPanel({
  projectId,
  documentId,
  open,
  onClose,
}: {
  projectId: string;
  documentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation("studio");
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 1023px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  if (narrow)
    return (
      <Drawer
        title={t("recall")}
        open={open}
        onClose={onClose}
        width="min(100vw, 384px)"
      >
        <RecallContents projectId={projectId} documentId={documentId} />
      </Drawer>
    );
  return open ? (
    <aside className="studio-quick-panel" aria-label={t("recall")}>
      <header className="studio-heading">
        <h2>{t("recall")}</h2>
        <Button onClick={onClose}>{t("back")}</Button>
      </header>
      <RecallContents projectId={projectId} documentId={documentId} />
    </aside>
  ) : null;
}
