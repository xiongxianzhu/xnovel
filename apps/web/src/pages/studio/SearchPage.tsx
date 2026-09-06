import { ExternalLink } from "lucide-react";
import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { useQuery } from "@tanstack/react-query";
import { Pagination } from "antd";
import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { searchProjectManuscript } from "../../shared/api/generated/sdk.gen";
import { apiClient } from "../../shared/api/client";
import {
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";

export function SearchPage() {
  const { projectId = "" } = useParams();
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const archived = params.get("archived") === "true";
  const query = useQuery({
    queryKey: ["manuscript-search", projectId, debouncedQ, page, archived],
    queryFn: async () =>
      (
        await searchProjectManuscript({
          client: apiClient,
          path: { project_id: projectId },
          query: {
            q: debouncedQ,
            page,
            page_size: 50,
            include_archived: archived,
          },
        })
      ).data.data,
  });
  return (
    <StudioFrame title={t("search")} back={`/projects/${projectId}`}>
      <div className="studio-filter">
        <label>
          {t("keyword")}
          <input
            value={q}
            onChange={(event) =>
              setParams(
                {
                  q: event.target.value,
                  page: "1",
                  archived: String(archived),
                },
                { replace: true },
              )
            }
          />
        </label>
        <label>
          <span>{t("includeArchived")}</span>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) =>
              setParams({
                q,
                page: "1",
                archived: String(event.target.checked),
              })
            }
            aria-label={t("includeArchived")}
          />
        </label>
      </div>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <RecordTable
            items={query.data.items.map((hit) => ({
              ...hit,
              rowKey: `${hit.kind}:${hit.id}`,
            }))}
            rowKey="rowKey"
            columns={[
              {
                title: t("title"),
                dataIndex: "title",
                width: 240,
                ellipsis: true,
              },
              {
                title: t("kind"),
                dataIndex: "kind",
                width: 120,
                render: (value: string) =>
                  t(value === "character" ? "characters" : value),
              },
              {
                title: t("body"),
                dataIndex: "excerpt",
                width: 480,
                ellipsis: true,
              },
              {
                title: t("admin:actions"),
                key: "actions",
                width: 88,
                fixed: "right",
                align: "center",
                render: (_, hit) => (
                  <RowAction
                    label={t("openSource")}
                    icon={ExternalLink}
                    to={
                      hit.kind === "document"
                        ? `/projects/${projectId}?document=${hit.id}&find=${encodeURIComponent(q)}`
                        : `/projects/${projectId}/${hit.kind === "character" ? "characters" : "world"}/${hit.id}`
                    }
                  />
                ),
              },
            ]}
          />
          <div className="studio-pagination">
            <Pagination
              current={page}
              pageSize={50}
              total={query.data.total}
              showSizeChanger={false}
              showQuickJumper
              onChange={(value) =>
                setParams({
                  q,
                  page: String(value),
                  archived: String(archived),
                })
              }
            />
          </div>
        </>
      )}
    </StudioFrame>
  );
}
