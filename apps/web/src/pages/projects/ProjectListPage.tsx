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
        <Link to="/projects/new">
          <Button icon={<Plus aria-hidden size={17} />} type="primary">
            {t("projects:create")}
          </Button>
        </Link>
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
      <section
        aria-label={t("projects:titlePlural")}
        className="project-list project-metadata-list"
      >
        {projects.data?.items.map((project) => (
          <article className="project-metadata-row" key={project.id}>
            <div className="project-cover-thumb">
              {project.cover_url ? (
                <img alt="" src={resolveMediaUrl(project.cover_url)} />
              ) : (
                <ImageUp aria-hidden size={24} />
              )}
            </div>
            <div className="project-row-content">
              <div className="project-row-title">
                {view === "deleted" ? (
                  <strong>{project.title}</strong>
                ) : (
                  <Link to={`/projects/${project.id}/details`}>
                    {project.title}
                  </Link>
                )}
                <span>
                  {t(`projects:updateStatus.${project.update_status}`)}
                </span>
              </div>
              <p>{project.description || t("projects:noDescription")}</p>
              <div className="project-row-meta">
                <span>
                  {t("projects:author")}:{" "}
                  {project.author || t("projects:authorNotSet")}
                </span>
                <span>
                  {t("projects:bookNumber", { value: project.book_number })}
                </span>
                <span>
                  {t("projects:chapterCount", { count: project.chapter_count })}
                </span>
                <span>
                  {t("projects:wordCount", { count: project.word_count })}
                </span>
                <span>
                  {t("projects:updatedOn", {
                    value: new Date(project.updated_at).toLocaleDateString(),
                  })}
                </span>
              </div>
            </div>
            <div className="project-row-actions">
              {view !== "deleted" ? (
                <>
                  <Link to={`/projects/${project.id}/details`}>
                    <Button icon={<Eye aria-hidden size={16} />}>
                      {t("projects:viewDetails")}
                    </Button>
                  </Link>
                  <Link to={`/projects/${project.id}`}>
                    <Button>{t("projects:openWorkspace")}</Button>
                  </Link>
                </>
              ) : null}
              {view !== "deleted" ? (
                <Link to={`/projects/${project.id}/edit`}>
                  <Button
                    aria-label={t("projects:editProject", {
                      title: project.title,
                    })}
                    icon={<Pencil aria-hidden size={16} />}
                  />
                </Link>
              ) : null}
              {view === "active" ? (
                <Button
                  icon={<Archive aria-hidden size={16} />}
                  onClick={() =>
                    action.mutate({ id: project.id, type: "archive" })
                  }
                >
                  {t("projects:archiveProject")}
                </Button>
              ) : null}
              {view === "archived" ? (
                <Button
                  icon={<RotateCcw aria-hidden size={16} />}
                  onClick={() =>
                    action.mutate({ id: project.id, type: "unarchive" })
                  }
                >
                  {t("projects:unarchiveProject")}
                </Button>
              ) : null}
              {view !== "deleted" ? (
                <Button
                  danger
                  icon={<Trash2 aria-hidden size={16} />}
                  onClick={() =>
                    Modal.confirm({
                      title: t("projects:deleteProjectTitle"),
                      content: t("projects:deleteProjectDescription"),
                      onOk: () =>
                        action.mutateAsync({ id: project.id, type: "delete" }),
                    })
                  }
                >
                  {t("projects:deleteProject")}
                </Button>
              ) : (
                <Button
                  icon={<RotateCcw aria-hidden size={16} />}
                  onClick={() =>
                    action.mutate({ id: project.id, type: "restore" })
                  }
                >
                  {t("projects:restoreProject")}
                </Button>
              )}
            </div>
          </article>
        ))}
      </section>
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
