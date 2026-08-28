import {
  Alert,
  Button,
  Dropdown,
  Input,
  Modal,
  Skeleton,
  type MenuProps,
} from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BookOpenText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderInput,
  ListTree,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";

import type {
  DocumentCreateRequest,
  DocumentListData,
  DocumentReorderRequest,
  DocumentSummary,
  DocumentUpdateRequest,
} from "../../shared/api/generated/types.gen";
import { isApiError } from "../../shared/api/errors";
import {
  buildDocumentTree,
  descendantsOf,
  prepareDocumentMove,
  type DocumentTreeNode,
} from "./documentTree";
import {
  createProjectDocumentRequest,
  deleteProjectDocumentRequest,
  reorderProjectDocumentsRequest,
  updateProjectDocumentRequest,
} from "./documentsApi";
import {
  projectDocumentsQueryKey,
  useProjectDocuments,
} from "./useProjectDocuments";
import { useEditorNavigation } from "../editor/useEditorNavigation";

type EditorState =
  | {
      kind: "folder" | "manuscript" | "outline";
      mode: "create";
      parentId: string | null;
    }
  | { document: DocumentSummary; mode: "rename" };

type ConfirmState = {
  action: "archive" | "delete" | "restore";
  document: DocumentSummary;
};

function conflictReason(error: unknown): string | undefined {
  if (
    !isApiError(error) ||
    typeof error.data !== "object" ||
    error.data === null
  )
    return undefined;
  const envelope = error.data as { data?: unknown };
  if (typeof envelope.data !== "object" || envelope.data === null)
    return undefined;
  const reason = (envelope.data as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : undefined;
}

export function ProjectDocumentSidebar({ projectId }: { projectId: string }) {
  const { t } = useTranslation(["common", "projects"]);
  const queryClient = useQueryClient();
  const { requestDocumentChange } = useEditorNavigation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<"active" | "archived">("active");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [moveDocument, setMoveDocument] = useState<DocumentSummary | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const activeQuery = useProjectDocuments(projectId, "active");
  const archivedQuery = useProjectDocuments(
    projectId,
    "archived",
    view === "archived",
  );
  const activeDocuments = useMemo(
    () => activeQuery.data?.items ?? [],
    [activeQuery.data],
  );
  const displayedQuery = view === "active" ? activeQuery : archivedQuery;
  const displayedDocuments = useMemo(
    () => displayedQuery.data?.items ?? [],
    [displayedQuery.data],
  );
  const tree = useMemo(
    () => buildDocumentTree(displayedDocuments),
    [displayedDocuments],
  );
  const expanded = useMemo(
    () =>
      new Set(
        displayedDocuments
          .filter(
            (document) =>
              document.kind === "folder" && !collapsedFolders.has(document.id),
          )
          .map((document) => document.id),
      ),
    [collapsedFolders, displayedDocuments],
  );
  const selectedId = searchParams.get("document");

  useEffect(() => {
    if (!activeDocuments.length) return;
    const selectedExists = activeDocuments.some(
      (document) => document.id === selectedId,
    );
    if (!selectedExists) {
      const next = new URLSearchParams(searchParams);
      next.set("document", activeDocuments[0]!.id);
      setSearchParams(next, { replace: true });
    }
  }, [activeDocuments, searchParams, selectedId, setSearchParams]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        requestAnimationFrame(() => mobileTriggerRef.current?.focus());
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  function mutationError(errorValue: unknown) {
    const reason = conflictReason(errorValue);
    const key = reason
      ? `projects:documentErrors.${reason}`
      : "common:requestFailed";
    setError(t(key));
  }

  async function refreshTrees() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: projectDocumentsQueryKey(projectId, "active"),
      }),
      queryClient.invalidateQueries({
        queryKey: projectDocumentsQueryKey(projectId, "archived"),
      }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: (payload: DocumentCreateRequest) =>
      createProjectDocumentRequest(projectId, payload),
    onError: mutationError,
    onSuccess: async (document) => {
      setEditor(null);
      setError(null);
      await refreshTrees();
      void selectDocument(document.id);
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      documentId,
      payload,
    }: {
      documentId: string;
      payload: DocumentUpdateRequest;
    }) => updateProjectDocumentRequest(projectId, documentId, payload),
    onError: mutationError,
    onSuccess: async (document) => {
      setEditor(null);
      setConfirm(null);
      setError(null);
      await refreshTrees();
      if (document.status === "active") void selectDocument(document.id);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) =>
      deleteProjectDocumentRequest(projectId, documentId),
    onError: mutationError,
    onSuccess: async () => {
      setConfirm(null);
      setError(null);
      await refreshTrees();
    },
  });
  const reorderMutation = useMutation({
    mutationFn: ({
      payload,
    }: {
      next: DocumentSummary[];
      payload: DocumentReorderRequest;
    }) => reorderProjectDocumentsRequest(projectId, payload),
    onError: (errorValue, _variables, context) => {
      const previous = (context as { previous?: DocumentListData } | undefined)
        ?.previous;
      if (previous) {
        queryClient.setQueryData(
          projectDocumentsQueryKey(projectId, "active"),
          previous,
        );
      }
      mutationError(errorValue);
    },
    onMutate: async ({ next }) => {
      const key = projectDocumentsQueryKey(projectId, "active");
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DocumentListData>(key);
      queryClient.setQueryData<DocumentListData>(key, { items: next });
      return { previous };
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        projectDocumentsQueryKey(projectId, "active"),
        data,
      );
      setError(null);
      setMoveDocument(null);
    },
  });
  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending ||
    reorderMutation.isPending;

  async function selectDocument(documentId: string) {
    if (documentId === selectedId) return;
    if (!(await requestDocumentChange())) return;
    const next = new URLSearchParams(searchParams);
    next.set("document", documentId);
    setSearchParams(next);
    setMobileOpen(false);
  }

  function move(documentId: string, parentId: string | null, index: number) {
    if (reorderMutation.isPending) return;
    try {
      const prepared = prepareDocumentMove(
        activeDocuments,
        documentId,
        parentId,
        index,
      );
      reorderMutation.mutate({
        next: prepared.documents,
        payload: prepared.payload,
      });
    } catch {
      setError(t("common:requestFailed"));
    }
  }

  function moveByOffset(document: DocumentSummary, offset: -1 | 1) {
    const siblings = activeDocuments
      .filter((item) => item.parent_id === document.parent_id)
      .sort(
        (left, right) =>
          left.position - right.position || left.id.localeCompare(right.id),
      );
    const index = siblings.findIndex((item) => item.id === document.id);
    move(document.id, document.parent_id, index + offset);
  }

  function dropOn(sourceId: string, target: DocumentSummary) {
    const source = activeDocuments.find((document) => document.id === sourceId);
    if (!source || source.id === target.id) return;
    if (target.kind === "folder" && source.parent_id !== target.id) {
      const targetCount = activeDocuments.filter(
        (item) => item.parent_id === target.id,
      ).length;
      move(source.id, target.id, targetCount);
    } else {
      const siblings = activeDocuments
        .filter(
          (item) =>
            item.parent_id === target.parent_id && item.id !== source.id,
        )
        .sort(
          (left, right) =>
            left.position - right.position || left.id.localeCompare(right.id),
        );
      move(
        source.id,
        target.parent_id,
        siblings.findIndex((item) => item.id === target.id),
      );
    }
  }

  const panel = (
    <>
      <div className="document-sidebar-toolbar">
        <Dropdown
          menu={{
            items: [
              {
                key: "folder",
                label: t("projects:newFolder"),
                icon: <Folder aria-hidden size={17} />,
              },
              {
                key: "manuscript",
                label: t("projects:newManuscript"),
                icon: <FileText aria-hidden size={17} />,
              },
              {
                key: "outline",
                label: t("projects:newOutline"),
                icon: <ListTree aria-hidden size={17} />,
              },
            ],
            onClick: ({ key }) =>
              setEditor({
                kind: key as "folder" | "manuscript" | "outline",
                mode: "create",
                parentId: null,
              }),
          }}
          trigger={["click"]}
        >
          <Button icon={<Plus aria-hidden size={17} />} type="primary">
            {t("projects:newDocument")}
          </Button>
        </Dropdown>
        <div
          className="document-view-switch"
          role="group"
          aria-label={t("projects:documentView")}
        >
          <button
            aria-pressed={view === "active"}
            onClick={() => setView("active")}
            type="button"
          >
            {t("projects:activeDocuments")}
          </button>
          <button
            aria-pressed={view === "archived"}
            onClick={() => setView("archived")}
            type="button"
          >
            {t("projects:archivedDocuments")}
          </button>
        </div>
      </div>
      {error ? (
        <Alert
          closable
          onClose={() => setError(null)}
          showIcon
          title={error}
          type="error"
        />
      ) : null}
      <div className="document-tree-content">
        {displayedQuery.isPending ? (
          <Skeleton active paragraph={{ rows: 6 }} title={false} />
        ) : displayedQuery.isError ? (
          <div className="document-tree-state" role="alert">
            <p>{t("projects:documentTreeLoadFailed")}</p>
            <Button onClick={() => void displayedQuery.refetch()}>
              {t("common:retry")}
            </Button>
          </div>
        ) : displayedDocuments.length === 0 ? (
          <div className="document-tree-state">
            <p>
              {view === "active"
                ? t("projects:documentTreeEmpty")
                : t("projects:archivedDocumentsEmpty")}
            </p>
          </div>
        ) : !tree.ok ? (
          <div className="document-tree-state" role="alert">
            <p>{t("projects:documentTreeInvalid")}</p>
            <Button onClick={() => void displayedQuery.refetch()}>
              {t("common:retry")}
            </Button>
          </div>
        ) : (
          <div
            aria-label={t("projects:documentTree")}
            className="document-tree"
            role="tree"
          >
            {tree.roots.map((node) => (
              <DocumentTreeItem
                activeDocuments={activeDocuments}
                archived={view === "archived"}
                documentNode={node}
                draggingId={draggingId}
                dropTargetId={dropTargetId}
                expanded={expanded}
                key={node.document.id}
                onAction={(action, document) => {
                  if (
                    action === "new-folder" ||
                    action === "new-manuscript" ||
                    action === "new-outline"
                  )
                    setEditor({
                      kind:
                        action === "new-folder"
                          ? "folder"
                          : action === "new-outline"
                            ? "outline"
                            : "manuscript",
                      mode: "create",
                      parentId:
                        document.kind === "folder"
                          ? document.id
                          : document.parent_id,
                    });
                  else if (action === "rename")
                    setEditor({ document, mode: "rename" });
                  else if (action === "move") setMoveDocument(document);
                  else if (action === "up") moveByOffset(document, -1);
                  else if (action === "down") moveByOffset(document, 1);
                  else setConfirm({ action, document });
                }}
                onDragEnd={() => {
                  setDraggingId(null);
                  setDropTargetId(null);
                }}
                onDragStart={setDraggingId}
                onDrop={(target) => {
                  if (draggingId) dropOn(draggingId, target);
                  setDraggingId(null);
                  setDropTargetId(null);
                }}
                onDropTarget={setDropTargetId}
                onSelect={(id) => void selectDocument(id)}
                onToggle={(id) =>
                  setCollapsedFolders((current) => {
                    const next = new Set(current);
                    if (expanded.has(id)) next.add(id);
                    else next.delete(id);
                    return next;
                  })
                }
                selectedId={selectedId}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      <Button
        aria-label={t("projects:openDocumentTree")}
        className="mobile-navigation-trigger project-document-trigger"
        icon={<ListTree aria-hidden size={22} />}
        onClick={() => {
          setCollapsed(false);
          setMobileOpen(true);
        }}
        ref={mobileTriggerRef}
        type="text"
      />
      <aside
        aria-label={t("projects:documentTree")}
        className={[
          "console-sidebar",
          "document-sidebar",
          collapsed ? "console-sidebar-collapsed" : "",
          mobileOpen ? "console-sidebar-mobile-open" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="console-sidebar-header document-sidebar-header">
          {!collapsed ? (
            <Link to="/projects">
              <ArrowLeft aria-hidden size={17} />
              <span>{t("projects:documentStructure")}</span>
            </Link>
          ) : (
            <BookOpenText aria-hidden size={20} />
          )}
        </div>
        <Button
          aria-expanded={mobileOpen || !collapsed}
          aria-label={
            mobileOpen
              ? t("common:close")
              : collapsed
                ? t("projects:expandDocumentTree")
                : t("projects:collapseDocumentTree")
          }
          className="console-sidebar-toggle"
          icon={
            mobileOpen ? (
              <X aria-hidden size={18} />
            ) : collapsed ? (
              <ChevronRight aria-hidden size={18} />
            ) : (
              <ChevronLeft aria-hidden size={18} />
            )
          }
          onClick={() => {
            if (mobileOpen) {
              setMobileOpen(false);
              requestAnimationFrame(() => mobileTriggerRef.current?.focus());
            } else {
              setCollapsed((value) => !value);
            }
          }}
          type="text"
        />
        {!collapsed ? panel : null}
      </aside>
      {mobileOpen ? (
        <button
          aria-label={t("common:close")}
          className="console-sidebar-scrim"
          onClick={() => {
            setMobileOpen(false);
            requestAnimationFrame(() => mobileTriggerRef.current?.focus());
          }}
          type="button"
        />
      ) : null}
      <DocumentEditorDialog
        key={
          editor?.mode === "rename"
            ? `rename-${editor.document.id}`
            : `create-${editor?.kind ?? "none"}-${editor?.parentId ?? "root"}`
        }
        busy={busy}
        editor={editor}
        onCancel={() => setEditor(null)}
        onSubmit={(title) => {
          if (!editor) return;
          if (editor.mode === "create") {
            createMutation.mutate({
              kind: editor.kind,
              parent_id: editor.parentId,
              title,
            });
          } else {
            updateMutation.mutate({
              documentId: editor.document.id,
              payload: { title },
            });
          }
        }}
      />
      <MoveDocumentDialog
        key={moveDocument?.id ?? "no-move"}
        busy={busy}
        document={moveDocument}
        documents={activeDocuments}
        onCancel={() => setMoveDocument(null)}
        onSubmit={(parentId) => {
          if (!moveDocument) return;
          const index = activeDocuments.filter(
            (item) => item.parent_id === parentId,
          ).length;
          move(moveDocument.id, parentId, index);
        }}
      />
      <ConfirmDocumentDialog
        busy={busy}
        state={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.action === "delete")
            deleteMutation.mutate(confirm.document.id);
          else
            updateMutation.mutate({
              documentId: confirm.document.id,
              payload: {
                status: confirm.action === "archive" ? "archived" : "active",
              },
            });
        }}
      />
    </>
  );
}

type TreeAction =
  | "archive"
  | "delete"
  | "down"
  | "move"
  | "new-folder"
  | "new-manuscript"
  | "new-outline"
  | "rename"
  | "restore"
  | "up";

function DocumentTreeItem({
  activeDocuments,
  archived,
  documentNode,
  draggingId,
  dropTargetId,
  expanded,
  onAction,
  onDragEnd,
  onDragStart,
  onDrop,
  onDropTarget,
  onSelect,
  onToggle,
  selectedId,
}: {
  activeDocuments: DocumentSummary[];
  archived: boolean;
  documentNode: DocumentTreeNode;
  draggingId: string | null;
  dropTargetId: string | null;
  expanded: Set<string>;
  onAction: (action: TreeAction, document: DocumentSummary) => void;
  onDragEnd: () => void;
  onDragStart: (id: string) => void;
  onDrop: (document: DocumentSummary) => void;
  onDropTarget: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  selectedId: string | null;
}) {
  const { t } = useTranslation("projects");
  const document = documentNode.document;
  const isFolder = document.kind === "folder";
  const isExpanded = expanded.has(document.id);
  const siblings = activeDocuments.filter(
    (item) => item.parent_id === document.parent_id,
  );
  const menuItems: MenuProps["items"] = archived
    ? [
        {
          key: "restore",
          label: t("restore"),
          icon: <RotateCcw aria-hidden size={16} />,
        },
        { type: "divider" },
        {
          danger: true,
          key: "delete",
          label: t("deleteDocument"),
          icon: <Trash2 aria-hidden size={16} />,
        },
      ]
    : [
        {
          key: "new-folder",
          label: t("newFolder"),
          icon: <Folder aria-hidden size={16} />,
        },
        {
          key: "new-manuscript",
          label: t("newManuscript"),
          icon: <FileText aria-hidden size={16} />,
        },
        {
          key: "new-outline",
          label: t("newOutline"),
          icon: <ListTree aria-hidden size={16} />,
        },
        { type: "divider" },
        { key: "rename", label: t("renameDocument") },
        {
          key: "up",
          label: t("moveUp"),
          icon: <ArrowUp aria-hidden size={16} />,
          disabled: document.position === 0,
        },
        {
          key: "down",
          label: t("moveDown"),
          icon: <ArrowDown aria-hidden size={16} />,
          disabled: document.position >= siblings.length - 1,
        },
        {
          key: "move",
          label: t("moveTo"),
          icon: <FolderInput aria-hidden size={16} />,
        },
        { type: "divider" },
        {
          key: "archive",
          label: t("archive"),
          icon: <Archive aria-hidden size={16} />,
        },
        {
          danger: true,
          key: "delete",
          label: t("deleteDocument"),
          icon: <Trash2 aria-hidden size={16} />,
        },
      ];

  return (
    <div role="none">
      <div
        aria-current={selectedId === document.id ? "page" : undefined}
        aria-expanded={isFolder ? isExpanded : undefined}
        className={[
          "document-tree-row",
          selectedId === document.id ? "document-tree-row-selected" : "",
          draggingId === document.id ? "document-tree-row-dragging" : "",
          dropTargetId === document.id ? "document-tree-row-drop-target" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        draggable={!archived}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (!archived) {
            event.preventDefault();
            onDropTarget(document.id);
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", document.id);
          onDragStart(document.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDrop(document);
        }}
        onKeyDown={(event) => {
          if (!isFolder) return;
          if (event.key === "ArrowRight" && !isExpanded) {
            event.preventDefault();
            onToggle(document.id);
          }
          if (event.key === "ArrowLeft" && isExpanded) {
            event.preventDefault();
            onToggle(document.id);
          }
        }}
        role="treeitem"
      >
        <button
          aria-label={
            isFolder
              ? isExpanded
                ? t("collapseFolder")
                : t("expandFolder")
              : undefined
          }
          className="document-tree-expander"
          disabled={!isFolder}
          onClick={() => isFolder && onToggle(document.id)}
          tabIndex={isFolder ? 0 : -1}
          type="button"
        >
          {isFolder ? (
            isExpanded ? (
              <ChevronDown aria-hidden size={16} />
            ) : (
              <ChevronRight aria-hidden size={16} />
            )
          ) : null}
        </button>
        <button
          className="document-tree-select"
          onClick={() => onSelect(document.id)}
          title={document.title}
          type="button"
        >
          {isFolder ? (
            <Folder aria-hidden size={17} />
          ) : (
            <FileText aria-hidden size={17} />
          )}
          <span>{document.title}</span>
        </button>
        <Dropdown
          menu={{
            items: menuItems,
            onClick: ({ domEvent, key }) => {
              domEvent.stopPropagation();
              onAction(key as TreeAction, document);
            },
          }}
          trigger={["click"]}
        >
          <button
            aria-label={t("documentActions", { title: document.title })}
            className="document-tree-actions"
            onClick={(event) => event.stopPropagation()}
            type="button"
          >
            <MoreHorizontal aria-hidden size={18} />
          </button>
        </Dropdown>
      </div>
      {isFolder && isExpanded && documentNode.children.length ? (
        <div className="document-tree-group" role="group">
          {documentNode.children.map((child) => (
            <DocumentTreeItem
              activeDocuments={activeDocuments}
              archived={archived}
              documentNode={child}
              draggingId={draggingId}
              dropTargetId={dropTargetId}
              expanded={expanded}
              key={child.document.id}
              onAction={onAction}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onDrop={onDrop}
              onDropTarget={onDropTarget}
              onSelect={onSelect}
              onToggle={onToggle}
              selectedId={selectedId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DocumentEditorDialog({
  busy,
  editor,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  editor: EditorState | null;
  onCancel: () => void;
  onSubmit: (title: string) => void;
}) {
  const { t } = useTranslation(["common", "projects"]);
  const [title, setTitle] = useState(
    editor?.mode === "rename" ? editor.document.title : "",
  );
  const [validation, setValidation] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = title.trim();
    if (!normalized) {
      setValidation(t("projects:documentTitleRequired"));
      return;
    }
    if (normalized.length > 200) {
      setValidation(t("projects:documentTitleTooLong"));
      return;
    }
    onSubmit(normalized);
  }

  return (
    <Modal
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
      open={Boolean(editor)}
      title={
        editor?.mode === "rename"
          ? t("projects:renameDocument")
          : t(
              editor?.kind === "folder"
                ? "projects:newFolder"
                : editor?.kind === "outline"
                  ? "projects:newOutline"
                  : "projects:newManuscript",
            )
      }
    >
      <form className="document-dialog-form" onSubmit={submit}>
        <label htmlFor="document-title">{t("projects:documentTitle")}</label>
        <Input
          autoFocus
          id="document-title"
          maxLength={200}
          onChange={(event) => setTitle(event.target.value)}
          status={validation ? "error" : undefined}
          value={title}
        />
        {validation ? (
          <p className="field-error" role="alert">
            {validation}
          </p>
        ) : null}
        <div className="document-dialog-actions">
          <Button disabled={busy} onClick={onCancel}>
            {t("common:cancel")}
          </Button>
          <Button htmlType="submit" loading={busy} type="primary">
            {t("common:save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MoveDocumentDialog({
  busy,
  document,
  documents,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  document: DocumentSummary | null;
  documents: DocumentSummary[];
  onCancel: () => void;
  onSubmit: (parentId: string | null) => void;
}) {
  const { t } = useTranslation(["common", "projects"]);
  const [parentId, setParentId] = useState<string>(document?.parent_id ?? "");
  const excluded = document
    ? descendantsOf(documents, document.id)
    : new Set<string>();
  const folders = documents.filter(
    (item) =>
      item.kind === "folder" &&
      item.id !== document?.id &&
      !excluded.has(item.id),
  );
  return (
    <Modal
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
      open={Boolean(document)}
      title={t("projects:moveTo")}
    >
      <form
        className="document-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(parentId || null);
        }}
      >
        <label htmlFor="document-parent">{t("projects:destination")}</label>
        <select
          id="document-parent"
          onChange={(event) => setParentId(event.target.value)}
          value={parentId}
        >
          <option value="">{t("projects:rootLevel")}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.title}
            </option>
          ))}
        </select>
        <div className="document-dialog-actions">
          <Button disabled={busy} onClick={onCancel}>
            {t("common:cancel")}
          </Button>
          <Button htmlType="submit" loading={busy} type="primary">
            {t("projects:move")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmDocumentDialog({
  busy,
  onCancel,
  onConfirm,
  state,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  state: ConfirmState | null;
}) {
  const { t } = useTranslation(["common", "projects"]);
  return (
    <Modal
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
      open={Boolean(state)}
      title={state ? t(`projects:${state.action}Title`) : ""}
    >
      {state ? (
        <div className="document-confirm-dialog">
          <p>
            {t(`projects:${state.action}Description`, {
              title: state.document.title,
            })}
          </p>
          <div className="document-dialog-actions">
            <Button disabled={busy} onClick={onCancel}>
              {t("common:cancel")}
            </Button>
            <Button
              danger={state.action === "delete"}
              loading={busy}
              onClick={onConfirm}
              type="primary"
            >
              {t(`projects:${state.action}`)}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
