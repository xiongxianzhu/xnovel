import { RecallPanel } from "../studio/RecallPage";
import { BookOpenText } from "lucide-react";
import "./writing-workspace.css";
import { Alert, Button, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import {
  Brain,
  Folder,
  PanelRightOpen,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { useAuth } from "../../features/auth/useAuth";
import {
  ProjectAiPanel,
  type ProjectAiPanelHandle,
} from "../../features/ai/ProjectAiPanel";
import { useProjectDocuments } from "../../features/documents/useProjectDocuments";
import { WritingEditor } from "../../features/editor/WritingEditor";
import { useEditorNavigation } from "../../features/editor/useEditorNavigation";
import { ProjectExportButton } from "../../features/planning/ProjectExportButton";
import { ProjectPlanningPanel } from "../../features/planning/ProjectPlanningPanel";
import { getProjectRequest } from "../../features/projects/projectsApi";
import { isApiError } from "../../shared/api/errors";

export function ProjectDetailPage() {
  const { t } = useTranslation(["common", "projects", "ai"]);
  const { user } = useAuth();
  const { blocked: editorBlocked } = useEditorNavigation();
  const { projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [planningOpen, setPlanningOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [recallOpen, setRecallOpen] = useState(false);
  const recallTriggerRef = useRef<HTMLButtonElement>(null);
  const [focused, setFocused] = useState(false);
  const aiPanelRef = useRef<ProjectAiPanelHandle>(null);
  const closeAi = useCallback(() => setAiOpen(false), []);
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

  const workspaceActions = (
    <div className="project-workspace-actions">
      <Button
        ref={recallTriggerRef}
        aria-expanded={recallOpen && !focused}
        icon={<BookOpenText aria-hidden size={17} />}
        onClick={() => {
          setFocused(false);
          setAiOpen(false);
          setPlanningOpen(false);
          setRecallOpen((value) => !value);
        }}
      >
        {t("studio:recall")}
      </Button>
      <ProjectExportButton projectId={projectId} />
      <Button
        aria-expanded={aiOpen && !focused}
        icon={<Brain aria-hidden size={17} />}
        onClick={() => {
          setFocused(false);
          setPlanningOpen(false);
          setRecallOpen(false);
          setAiOpen((value) => !value);
        }}
      >
        {t("ai:assistantTitle")}
      </Button>
      <Button
        aria-expanded={planningOpen && !focused}
        icon={<PanelRightOpen aria-hidden size={17} />}
        onClick={() => {
          setFocused(false);
          setAiOpen(false);
          setRecallOpen(false);
          setPlanningOpen((value) => !value);
        }}
        ref={planningTriggerRef}
      >
        {t("projects:planningAndSettings")}
      </Button>
      <Button
        aria-pressed={focused}
        icon={
          focused ? (
            <Minimize2 aria-hidden size={17} />
          ) : (
            <Maximize2 aria-hidden size={17} />
          )
        }
        onClick={() => setFocused((value) => !value)}
      >
        {t(focused ? "projects:exitFocus" : "projects:focusMode")}
      </Button>
    </div>
  );

  return (
    <main
      className={`project-detail-page writing-workspace ${focused ? "writing-workspace-focused" : ""}`}
      aria-label={project.data.title}
    >
      {!selectedDocument || selectedDocument.kind === "folder"
        ? workspaceActions
        : null}
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
              initialSearch={searchParams.get("find") ?? ""}
              actions={workspaceActions}
              onSelectionAction={(selection) => {
                if (aiPanelRef.current) {
                  aiPanelRef.current.prepareSelection(selection);
                  setFocused(false);
                  setFocused(false);
                  setPlanningOpen(false);
                  setAiOpen(true);
                }
              }}
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
        <RecallPanel
          projectId={projectId}
          documentId={selectedDocument?.id ?? ""}
          open={recallOpen && !focused}
          onClose={() => {
            setRecallOpen(false);
            requestAnimationFrame(() => recallTriggerRef.current?.focus());
          }}
        />
        <ProjectPlanningPanel
          document={selectedDocument}
          onClose={closePlanning}
          open={planningOpen && !focused}
          projectId={projectId}
        />
        <ProjectAiPanel
          ref={aiPanelRef}
          document={selectedDocument}
          editorBlocked={editorBlocked}
          onClose={closeAi}
          open={aiOpen && !focused}
          projectId={projectId}
        />
      </div>
    </main>
  );
}
