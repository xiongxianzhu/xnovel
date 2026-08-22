import { Alert, Button, Skeleton } from "antd";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { ProjectCreateForm } from "../../features/projects/ProjectCreateForm";
import {
  createProjectRequest,
  listProjectsRequest,
} from "../../features/projects/projectsApi";
import { ApiError, isApiError } from "../../shared/api/errors";

export function ProjectListPage() {
  const { t } = useTranslation(["common", "projects"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: listProjectsRequest,
  });
  const create = useMutation({
    mutationFn: createProjectRequest,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/projects/${project.id}`);
    },
    onError: (error: unknown) => {
      setCreateError(errorMessage(error, t));
    },
  });

  async function submitCreate(title: string) {
    setCreateError(null);
    await create.mutateAsync({ title });
  }

  if (projects.isPending) {
    return (
      <main aria-busy="true" className="projects-page">
        <Skeleton active paragraph={{ rows: 6 }} title />
      </main>
    );
  }

  return (
    <main aria-labelledby="projects-title" className="projects-page">
      <header className="page-heading projects-heading">
        <div>
          <p className="eyebrow">{t("projects:eyebrow")}</p>
          <h1 id="projects-title">{t("projects:titlePlural")}</h1>
          <p className="page-description">{t("projects:description")}</p>
        </div>
        <Button onClick={() => setIsCreating(true)} type="primary">
          {t("projects:create")}
        </Button>
      </header>

      {projects.isError ? (
        <Alert
          action={
            <Button onClick={() => void projects.refetch()} size="small">
              {t("common:retry")}
            </Button>
          }
          className="projects-alert"
          showIcon
          title={errorMessage(projects.error, t)}
          type="error"
        />
      ) : null}

      {isCreating ? (
        <ProjectCreateForm
          error={createError}
          isSubmitting={create.isPending}
          onCancel={() => {
            setCreateError(null);
            setIsCreating(false);
          }}
          onSubmit={submitCreate}
        />
      ) : null}

      {!projects.isError && projects.data.items.length === 0 ? (
        <section className="projects-empty">
          <p className="empty-mark" aria-hidden>
            ∅
          </p>
          <h2>{t("projects:emptyTitle")}</h2>
          <p>{t("projects:emptyDescription")}</p>
          <Button onClick={() => setIsCreating(true)} type="primary">
            {t("projects:create")}
          </Button>
        </section>
      ) : null}

      {!projects.isError && projects.data.items.length > 0 ? (
        <section
          aria-label={t("projects:titlePlural")}
          className="project-list"
        >
          {projects.data.items.map((project) => (
            <Link
              className="project-row"
              key={project.id}
              to={`/projects/${project.id}`}
            >
              <span className="project-row-main">
                <strong>{project.title}</strong>
                <span>{t(`projects:status.${project.status}`)}</span>
              </span>
              <time dateTime={project.updated_at}>
                {new Date(project.updated_at).toLocaleDateString()}
              </time>
            </Link>
          ))}
        </section>
      ) : null}
    </main>
  );
}

function errorMessage(error: unknown, t: (key: string) => string): string {
  if (isApiError(error) && error.status === 404) {
    return t("projects:notFound");
  }
  if (error instanceof ApiError && error.code) {
    const message = t(`errors:${error.code}`);
    return message === `errors:${error.code}`
      ? t("common:requestFailed")
      : message;
  }
  return t("common:requestFailed");
}
