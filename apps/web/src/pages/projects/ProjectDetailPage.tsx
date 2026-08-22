import { Alert, Button, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { getProjectRequest } from "../../features/projects/projectsApi";
import { isApiError } from "../../shared/api/errors";

export function ProjectDetailPage() {
  const { t } = useTranslation(["common", "projects"]);
  const { projectId = "" } = useParams();
  const project = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProjectRequest(projectId),
    enabled: Boolean(projectId),
  });

  if (project.isPending) {
    return (
      <main aria-busy="true" className="project-detail-page">
        <Skeleton active paragraph={{ rows: 5 }} title />
      </main>
    );
  }

  if (project.isError) {
    const notFound = isApiError(project.error) && project.error.status === 404;
    return (
      <main className="project-detail-page">
        <Alert
          action={
            notFound ? (
              <Link to="/">
                <Button>{t("projects:backToProjects")}</Button>
              </Link>
            ) : (
              <Button onClick={() => void project.refetch()}>
                {t("common:retry")}
              </Button>
            )
          }
          showIcon
          title={notFound ? t("projects:notFound") : t("common:requestFailed")}
          type="error"
        />
      </main>
    );
  }

  return (
    <main
      className="project-detail-page"
      aria-labelledby="project-detail-title"
    >
      <Link className="back-link" to="/">
        {t("projects:backToProjects")}
      </Link>
      <header className="page-heading">
        <p className="eyebrow">{t("projects:workspace")}</p>
        <h1 id="project-detail-title">{project.data.title}</h1>
        <p className="page-description">
          {t(`projects:status.${project.data.status}`)}
        </p>
      </header>
      <section className="project-opening-panel">
        <div>
          <p className="eyebrow">{t("projects:initialDocument")}</p>
          <h2>{project.data.initial_document.title}</h2>
          <p>{t("projects:editorComingSoon")}</p>
        </div>
        <span className="document-kind">
          {t(`projects:documentKind.${project.data.initial_document.kind}`)}
        </span>
      </section>
    </main>
  );
}
