import { Alert, Button, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenText, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { getProjectRequest } from "../../features/projects/projectsApi";
import { isApiError } from "../../shared/api/errors";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";

export function ProjectInfoPage() {
  const { projectId = "" } = useParams();
  const { t, i18n } = useTranslation(["common", "projects"]);
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => getProjectRequest(projectId),
    enabled: Boolean(projectId),
  });
  const back = (
    <Link className="back-link" to="/projects">
      <ArrowLeft aria-hidden size={17} />
      {t("projects:backToProjects")}
    </Link>
  );

  if (project.isPending) {
    return (
      <main className="project-info-page" aria-busy="true">
        {back}
        <Skeleton active paragraph={{ rows: 8 }} />
      </main>
    );
  }
  if (project.isError) {
    const notFound = isApiError(project.error) && project.error.status === 404;
    return (
      <main className="project-info-page">
        {back}
        <Alert
          showIcon
          type="error"
          title={notFound ? t("projects:notFound") : t("common:requestFailed")}
          action={
            !notFound ? (
              <Button onClick={() => void project.refetch()}>
                {t("common:retry")}
              </Button>
            ) : undefined
          }
        />
      </main>
    );
  }

  const data = project.data;
  const formatDate = (value: string) =>
    new Date(value).toLocaleString(i18n.language);
  return (
    <main className="project-info-page" aria-labelledby="project-info-title">
      {back}
      <header className="page-heading projects-heading">
        <h1 id="project-info-title">{t("projects:detailsTitle")}</h1>
        <div className="project-info-actions">
          <Link to={`/projects/${data.id}/edit`}>
            <Button icon={<Pencil aria-hidden size={17} />}>
              {t("projects:editProjectTitle")}
            </Button>
          </Link>
          <Link to={`/projects/${data.id}`}>
            <Button
              type="primary"
              icon={<BookOpenText aria-hidden size={17} />}
            >
              {t("projects:openWorkspace")}
            </Button>
          </Link>
        </div>
      </header>
      <section className="project-info-layout" aria-label={data.title}>
        <div className="project-info-cover">
          {data.cover_url ? (
            <img
              alt={t("projects:cover")}
              src={resolveMediaUrl(data.cover_url)}
            />
          ) : (
            <BookOpenText aria-hidden size={40} />
          )}
        </div>
        <div className="project-info-content">
          <h2>{data.title}</h2>
          <p className="project-info-author">
            {t("projects:author")}: {data.author || t("projects:authorNotSet")}
          </p>
          <dl className="project-info-facts">
            <div className="project-info-book-number">
              <dt>{t("projects:bookNumberLabel")}</dt>
              <dd>{data.book_number}</dd>
            </div>
            <div>
              <dt>{t("projects:chaptersLabel")}</dt>
              <dd>
                {t("projects:chapterCount", { count: data.chapter_count })}
              </dd>
            </div>
            <div>
              <dt>{t("projects:wordsLabel")}</dt>
              <dd>{t("projects:wordCount", { count: data.word_count })}</dd>
            </div>
            <div>
              <dt>{t("projects:managementStatus")}</dt>
              <dd>{t(`projects:status.${data.status}`)}</dd>
            </div>
            <div>
              <dt>{t("projects:updateStatusLabel")}</dt>
              <dd>{t(`projects:updateStatus.${data.update_status}`)}</dd>
            </div>
            <div>
              <dt>{t("projects:structureMode")}</dt>
              <dd>{t(`projects:structure.${data.structure_mode}`)}</dd>
            </div>
            <div>
              <dt>{t("projects:createdAtLabel")}</dt>
              <dd>
                <time dateTime={data.created_at}>
                  {formatDate(data.created_at)}
                </time>
              </dd>
            </div>
            <div>
              <dt>{t("projects:updatedAtLabel")}</dt>
              <dd>
                <time dateTime={data.updated_at}>
                  {formatDate(data.updated_at)}
                </time>
              </dd>
            </div>
          </dl>
          <section
            className="project-info-description"
            aria-labelledby="project-info-description-title"
          >
            <h3 id="project-info-description-title">
              {t("projects:projectDescription")}
            </h3>
            <p>{data.description || t("projects:noDescription")}</p>
          </section>
        </div>
      </section>
    </main>
  );
}
