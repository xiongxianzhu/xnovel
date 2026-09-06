import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import {
  Alert,
  Button,
  Input,
  Modal,
  Pagination,
  Segmented,
  Select,
  Skeleton,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  BookOpenText,
  Eye,
  ImageUp,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import {
  deleteProjectRequest,
  listProjectsRequest,
  restoreProjectRequest,
  updateProjectRequest,
} from "../../features/projects/projectsApi";
import { useDebouncedValue } from "../../features/admin/useDebouncedValue";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";
import type { ProjectSummary } from "../../shared/api/generated/types.gen";

type ProjectView = "active" | "archived" | "deleted";
export function ProjectListPage() {
  const { t } = useTranslation(["common", "projects"]);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = (searchParams.get("view") as ProjectView | null) ?? "active";
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const query = searchParams.get("q") ?? "";
  const requestedStatus = searchParams.get("update_status");
  const updateStatus = ["not_started", "serializing", "completed"].includes(
    requestedStatus ?? "",
  )
    ? (requestedStatus as ProjectSummary["update_status"])
    : undefined;
  const debouncedQuery = useDebouncedValue(query, 300);
  const [error, setError] = useState<string>();
  const projects = useQuery({
    queryKey: ["projects", view, page, debouncedQuery, updateStatus],
    queryFn: () =>
      listProjectsRequest(view, page, 50, debouncedQuery, updateStatus),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  const action = useMutation({
    mutationFn: async ({
      id,
      type,
    }: {
      id: string;
      type: "archive" | "delete" | "restore" | "unarchive";
    }) => {
      if (type === "delete") await deleteProjectRequest(id);
      else if (type === "restore") await restoreProjectRequest(id);
      else
        await updateProjectRequest(id, {
          status: type === "archive" ? "archived" : "active",
        });
    },
    onSuccess: refresh,
    onError: () => setError(t("projects:mutationFailed")),
  });

  return (
    <main aria-labelledby="projects-title" className="projects-page">
      <header className="page-heading projects-heading">
        <div>
          <h1 id="projects-title">{t("projects:titlePlural")}</h1>
          <p className="page-description">{t("projects:description")}</p>
        </div>
        <div className="studio-actions">
          <Link className="studio-link-button" to="/import">
            {t("studio:import")}
          </Link>
          <Link to="/projects/new">
            <Button icon={<Plus aria-hidden size={17} />} type="primary">
              {t("projects:create")}
            </Button>
          </Link>
        </div>
      </header>
      <Segmented<ProjectView>
        block
        className="project-view-switch"
        onChange={(next) =>
          setSearchParams((current) => {
            current.set("view", next);
            current.set("page", "1");
            return current;
          })
        }
        options={[
          { label: t("projects:currentProjects"), value: "active" },
          { label: t("projects:archivedProjects"), value: "archived" },
          { label: t("projects:recycleBin"), value: "deleted" },
        ]}
        value={view}
      />
      <div className="project-filter-bar">
        <Input.Search
          aria-label={t("projects:searchPlaceholder")}
          allowClear
          className="project-search"
          onChange={(event) =>
            setSearchParams((current) => {
              if (event.target.value) current.set("q", event.target.value);
              else current.delete("q");
              current.set("page", "1");
              return current;
            })
          }
          placeholder={t("projects:searchPlaceholder")}
          value={query}
        />
        <Select
          aria-label={t("projects:updateStatusLabel")}
          value={updateStatus ?? "all"}
          options={[
            { label: t("projects:allUpdateStatuses"), value: "all" },
            ...["not_started", "serializing", "completed"].map((value) => ({
              label: t(`projects:updateStatus.${value}`),
              value,
            })),
          ]}
          onChange={(value) =>
            setSearchParams((current) => {
              if (value === "all") current.delete("update_status");
              else current.set("update_status", value);
              current.set("page", "1");
              return current;
            })
          }
        />
      </div>
      {error ? (
        <Alert
          closable
          onClose={() => setError(undefined)}
          showIcon
          title={error}
          type="error"
        />
      ) : null}
      {projects.isPending ? (
        <Skeleton active paragraph={{ rows: 8 }} title={false} />
      ) : null}
      {projects.isError ? (
        <Alert
          action={
            <Button onClick={() => void projects.refetch()}>
              {t("common:retry")}
            </Button>
          }
          showIcon
          title={t("common:requestFailed")}
          type="error"
        />
      ) : null}
      {projects.data?.items.length === 0 ? (
        <section className="projects-empty">
          <h2>{t("projects:emptyTitle")}</h2>
          <p>{t("projects:emptyDescription")}</p>
        </section>
      ) : null}
      {projects.data?.items.length ? (
        <RecordTable
          items={projects.data.items}
          columns={[
            {
              title: t("projects:cover"),
              key: "cover",
              width: 76,
              render: (_, item) =>
                item.cover_url ? (
                  <img
                    className="record-cover"
                    alt=""
                    src={resolveMediaUrl(item.cover_url)}
                  />
                ) : (
                  <ImageUp aria-hidden size={24} />
                ),
            },
            {
              title: t("projects:title"),
              dataIndex: "title",
              width: 210,
              ellipsis: true,
              render: (value: string, item) =>
                view === "deleted" ? (
                  value
                ) : (
                  <Link to={`/projects/${item.id}/details`}>{value}</Link>
                ),
            },
            {
              title: t("projects:author"),
              dataIndex: "author",
              width: 160,
              ellipsis: true,
              render: (value: string) => value || t("projects:authorNotSet"),
            },
            {
              title: t("studio:bookNumber"),
              dataIndex: "book_number",
              width: 190,
              ellipsis: true,
            },
            {
              title: t("studio:description"),
              dataIndex: "description",
              width: 300,
              ellipsis: true,
            },
            {
              title: t("studio:status"),
              dataIndex: "update_status",
              width: 120,
              render: (value: string) => t(`projects:updateStatus.${value}`),
            },
            {
              title: t("studio:chapterCount"),
              dataIndex: "chapter_count",
              width: 100,
            },
            {
              title: t("studio:wordCount"),
              dataIndex: "word_count",
              width: 100,
            },
            {
              title: t("studio:updatedAt"),
              dataIndex: "updated_at",
              width: 180,
              render: (value: string) => new Date(value).toLocaleString(),
            },
            {
              title: t("admin:actions"),
              key: "actions",
              width: 256,
              fixed: "right",
              align: "center",
              render: (_, item) => (
                <div className="record-actions">
                  {view !== "deleted" ? (
                    <>
                      <RowAction
                        label={t("projects:viewDetails")}
                        icon={Eye}
                        to={`/projects/${item.id}/details`}
                      />
                      <RowAction
                        label={t("projects:openWorkspace")}
                        icon={BookOpenText}
                        to={`/projects/${item.id}`}
                      />
                      <RowAction
                        label={t("projects:editProject", { title: item.title })}
                        icon={Pencil}
                        to={`/projects/${item.id}/edit`}
                      />
                    </>
                  ) : null}
                  {view === "active" ? (
                    <RowAction
                      label={t("projects:archiveProject")}
                      icon={Archive}
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ id: item.id, type: "archive" })
                      }
                    />
                  ) : view === "archived" ? (
                    <RowAction
                      label={t("projects:unarchiveProject")}
                      icon={RotateCcw}
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ id: item.id, type: "unarchive" })
                      }
                    />
                  ) : null}
                  {view !== "deleted" ? (
                    <RowAction
                      label={t("projects:deleteProject")}
                      icon={Trash2}
                      danger
                      disabled={action.isPending}
                      onClick={() =>
                        Modal.confirm({
                          title: t("projects:deleteProjectTitle"),
                          content: t("projects:deleteProjectDescription"),
                          onOk: () =>
                            action.mutateAsync({ id: item.id, type: "delete" }),
                        })
                      }
                    />
                  ) : (
                    <RowAction
                      label={t("projects:restoreProject")}
                      icon={RotateCcw}
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({ id: item.id, type: "restore" })
                      }
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      ) : null}
      {projects.data && projects.data.total > 0 ? (
        <Pagination
          current={projects.data.page}
          onChange={(nextPage) =>
            setSearchParams((current) => {
              current.set("page", String(nextPage));
              return current;
            })
          }
          pageSize={projects.data.page_size}
          showQuickJumper
          showSizeChanger={false}
          total={projects.data.total}
        />
      ) : null}
    </main>
  );
}
