import { Alert, Button, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Brain, Folder, PanelRightOpen } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../features/auth/useAuth";
import { ProjectAiPanel } from "../../features/ai/ProjectAiPanel";
import { useProjectDocuments } from "../../features/documents/useProjectDocuments";
import { WritingEditor } from "../../features/editor/WritingEditor";
import { useEditorNavigation } from "../../features/editor/useEditorNavigation";
import { ProjectExportButton } from "../../features/planning/ProjectExportButton";
import { ProjectPlanningPanel } from "../../features/planning/ProjectPlanningPanel";
import { getProjectRequest } from "../../features/projects/projectsApi";
import { isApiError } from "../../shared/api/errors";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";

export function ProjectDetailPage() {
  const { t } = useTranslation(["common", "projects", "ai"]);
  const { user } = useAuth();
  const { blocked: editorBlocked } = useEditorNavigation();
  const { projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [planningOpen, setPlanningOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const planningTriggerRef = useRef<HTMLButtonElement>(null);
  const project = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProjectRequest(projectId),
    enabled: Boolean(projectId),
  });
  const documents = useProjectDocuments(projectId, "active");

  function closePlanning() {
    setPlanningOpen(false);
    requestAnimationFrame(() => planningTriggerRef.current?.focus());
  }

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

  const selectedId = searchParams.get("document");
  const selectedDocument =
    documents.data?.items.find((document) => document.id === selectedId) ??
    documents.data?.items[0];

  return (
    <main
      className="project-detail-page"
      aria-labelledby="project-detail-title"
    >
      <Link className="back-link" to="/projects">
        {t("projects:backToProjects")}
      </Link>
      <header className="page-heading project-workspace-heading">
        <div className="project-detail-identity">
          <div className="project-detail-cover">
            {project.data.cover_url ? (
              <img alt="" src={resolveMediaUrl(project.data.cover_url)} />
            ) : null}
          </div>
          <div>
            <h1 id="project-detail-title">{project.data.title}</h1>
            <p className="page-description">
              {project.data.description || t("projects:noDescription")}
            </p>
            <div className="project-row-meta">
              <span>
                {t("projects:author")}:{" "}
                {project.data.author || t("projects:authorNotSet")}
              </span>
              <span>
                {t("projects:bookNumber", { value: project.data.book_number })}
              </span>
              <span>
                {t("projects:chapterCount", {
                  count: project.data.chapter_count,
                })}
              </span>
              <span>
                {t("projects:wordCount", { count: project.data.word_count })}
              </span>
              <span>
                {t(`projects:updateStatus.${project.data.update_status}`)}
              </span>
            </div>
          </div>
        </div>
        <div className="project-workspace-actions">
          <ProjectExportButton projectId={projectId} />
          <Button
            aria-expanded={aiOpen}
            icon={<Brain aria-hidden size={17} />}
            onClick={() => {
              setPlanningOpen(false);
              setAiOpen((value) => !value);
            }}
          >
            {t("ai:assistantTitle")}
          </Button>
          <Button
            aria-expanded={planningOpen}
            icon={<PanelRightOpen aria-hidden size={17} />}
            onClick={() => {
              setAiOpen(false);
              setPlanningOpen((value) => !value);
            }}
            ref={planningTriggerRef}
          >
            {t("projects:planningAndSettings")}
          </Button>
        </div>
      </header>
      <div className="project-workspace-layout">
        <div className="project-workspace-main">
          {documents.isPending ? (
            <section aria-busy="true" className="writing-canvas-placeholder">
              <Skeleton active paragraph={{ rows: 7 }} title />
            </section>
          ) : documents.isError ? (
            <Alert
              action={
                <Button onClick={() => void documents.refetch()}>
                  {t("common:retry")}
                </Button>
              }
              showIcon
              title={t("projects:documentTreeLoadFailed")}
              type="error"
            />
          ) : selectedDocument?.kind === "folder" ? (
            <section
              className="writing-canvas-placeholder"
              aria-labelledby="selected-document-title"
            >
              <div className="writing-canvas-heading">
                <Folder aria-hidden size={20} />
                <div>
                  <h2 id="selected-document-title">{selectedDocument.title}</h2>
                  <p>{t(`projects:documentKind.${selectedDocument.kind}`)}</p>
                </div>
              </div>
              <div className="writing-canvas-empty">
                <p>{t("projects:folderSelected")}</p>
              </div>
            </section>
          ) : selectedDocument && user ? (
            <WritingEditor
              documentId={selectedDocument.id}
              documentTitle={selectedDocument.title}
              documentTypeLabel={t(
                `projects:documentKind.${selectedDocument.kind}`,
              )}
              projectId={projectId}
              userId={user.id}
            />
          ) : (
            <Alert
              showIcon
              title={t("projects:documentTreeEmpty")}
              type="warning"
            />
          )}
        </div>
        <ProjectPlanningPanel
          document={selectedDocument}
          onClose={closePlanning}
          open={planningOpen}
          projectId={projectId}
        />
        <ProjectAiPanel
          document={selectedDocument}
          editorBlocked={editorBlocked}
          onClose={() => setAiOpen(false)}
          open={aiOpen}
          projectId={projectId}
        />
      </div>
    </main>
  );
}
