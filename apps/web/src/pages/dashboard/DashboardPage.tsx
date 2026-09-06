import { ArrowRight, BookOpenText, Brain, FileCode2, Plus } from "lucide-react";
import { Alert, Button, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../features/auth/useAuth";
import { listProjectsRequest } from "../../features/projects/projectsApi";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";
import type { ProjectSummary } from "../../shared/api/generated/types.gen";
import "./dashboard.css";

export function DashboardPage() {
  const { user } = useAuth();
  const { t } = useTranslation(["common", "console", "projects"]);
  const projects = useQuery({
    queryKey: ["projects", "dashboard", user?.id],
    queryFn: () => listProjectsRequest("active", 1, 4),
    enabled: Boolean(user),
  });
  const latest = projects.data?.items[0];
  return (
    <main
      className="dashboard-page bookshelf-dashboard"
      aria-labelledby="dashboard-title"
    >
      <header className="bookshelf-heading">
        <div>
          <h1 id="dashboard-title">{t("console:bookshelfTitle")}</h1>
          <p>
            {t("console:dashboardGreeting", {
              name: user?.nickname || user?.username,
            })}
          </p>
        </div>
        <div className="bookshelf-heading-actions">
          <Link to="/projects/new" className="dashboard-primary-link">
            <Plus aria-hidden size={18} />
            {t("projects:create")}
          </Link>
          <Link to="/projects" className="dashboard-secondary-link">
            {t("console:allWorks")}
          </Link>
        </div>
      </header>
      {projects.isPending ? (
        <section
          className="bookshelf-loading"
          aria-busy="true"
          aria-label={t("common:loading")}
        >
          <Skeleton active paragraph={{ rows: 6 }} />
        </section>
      ) : null}
      {projects.isError ? (
        <Alert
          showIcon
          type="error"
          title={t("common:requestFailed")}
          action={
            <Button onClick={() => void projects.refetch()}>
              {t("common:retry")}
            </Button>
          }
        />
      ) : null}
      {latest ? (
        <section
          className="bookshelf-resume"
          aria-label={t("console:continueWriting")}
        >
          <BookOpenText aria-hidden size={26} />
          <div>
            <h2>
              {t("console:recentlyUpdated")} · {latest.title}
            </h2>
            <p>{t("console:resumeDescription")}</p>
          </div>
          <Link to={`/projects/${latest.id}`} className="bookshelf-continue">
            {t("console:continueWriting")}
            <ArrowRight aria-hidden size={18} />
          </Link>
        </section>
      ) : null}
      {!projects.isPending && !projects.isError && !latest ? (
        <section className="bookshelf-empty">
          <BookOpenText aria-hidden size={36} />
          <h2>{t("console:emptyBookshelfTitle")}</h2>
          <p>{t("console:emptyBookshelfDescription")}</p>
        </section>
      ) : null}
      {latest ? (
        <section aria-labelledby="recent-works-title">
          <div className="bookshelf-section-heading">
            <h2 id="recent-works-title">{t("console:recentlyUpdated")}</h2>
          </div>
          <div className="bookshelf-grid">
            {projects.data?.items.map((project) => (
              <article className="bookshelf-book" key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  aria-label={`${t("console:continueWriting")} ${project.title}`}
                >
                  <BookCover project={project} />
                </Link>
                <h3>
                  <Link to={`/projects/${project.id}/details`}>
                    {project.title}
                  </Link>
                </h3>
                <p className="bookshelf-description">
                  {project.description || t("projects:noDescription")}
                </p>
                <p className="bookshelf-meta">
                  {t("projects:chapterCount", { count: project.chapter_count })}{" "}
                  · {t("projects:wordCount", { count: project.word_count })}
                </p>
                <Link
                  className="bookshelf-continue"
                  to={`/projects/${project.id}`}
                >
                  {t("console:continueWriting")}
                  <ArrowRight aria-hidden size={16} />
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      <nav className="bookshelf-tools" aria-label={t("console:creativeTools")}>
        <Link to="/ai-models">
          <Brain aria-hidden size={26} />
          <span>
            <strong>{t("console:aiModels")}</strong>
            <span>{t("console:aiModelsDescription")}</span>
          </span>
          <ArrowRight aria-hidden size={18} />
        </Link>
        <Link to="/skills">
          <FileCode2 aria-hidden size={26} />
          <span>
            <strong>{t("console:skills")}</strong>
            <span>{t("console:skillsDescription")}</span>
          </span>
          <ArrowRight aria-hidden size={18} />
        </Link>
      </nav>
    </main>
  );
}

function BookCover({ project }: { project: ProjectSummary }) {
  const { t } = useTranslation("projects");
  const src = resolveMediaUrl(project.cover_url);
  const [failedSource, setFailedSource] = useState<string>();
  return (
    <div className="bookshelf-cover">
      {src && src !== failedSource ? (
        <img
          alt=""
          src={src}
          referrerPolicy="no-referrer"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <div className="bookshelf-cover-fallback">
          <BookOpenText aria-hidden size={24} />
          <strong>{project.title}</strong>
          <span>{project.author || t("authorNotSet")}</span>
        </div>
      )}
    </div>
  );
}
