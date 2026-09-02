import {
  BookOpenText,
  Archive,
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  HardDrive,
  Menu,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { themeValues, type ColorScheme } from "@xnovel/theme";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AiCandidate,
  DesktopContent,
  DesktopDocument,
  DesktopDraft,
  DesktopPreferences,
  DesktopProject,
  LocalSkill,
  LocalSkillDetail,
  ProviderSummary,
  ThemeMode,
  ThemePalette,
} from "../../shared/contracts";

type View = "writing" | "skills" | "settings";
type SaveState = "clean" | "dirty" | "saving" | "saved" | "failed";
type PendingAction = {
  allowStash: boolean;
  run: () => void | Promise<void>;
};
type TitleRequest = {
  heading: string;
  label: string;
  initialValue: string;
  submitLabel: string;
  onSubmit: (title: string) => Promise<void>;
};
type ConfirmRequest = {
  heading: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
};

function deleteErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("DOCUMENT_LAST_MANUSCRIPT"))
    return "作品需要保留至少一个当前正文，请先新建正文再删除。";
  if (
    message.includes("DOCUMENT_NOT_FOUND") ||
    message.includes("PROJECT_NOT_FOUND")
  )
    return "内容已变化，请重新加载。";
  return "删除失败，请稍后重试。";
}

export function App() {
  const [projects, setProjects] = useState<DesktopProject[]>([]);
  const [project, setProject] = useState<DesktopProject>();
  const [documentItem, setDocumentItem] = useState<DesktopDocument>();
  const [documents, setDocuments] = useState<DesktopDocument[]>([]);
  const [archivedDocuments, setArchivedDocuments] = useState<DesktopDocument[]>(
    [],
  );
  const [showArchived, setShowArchived] = useState(false);
  const [content, setContent] = useState<DesktopContent>();
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [view, setView] = useState<View>("writing");
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [frameless, setFrameless] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [preferences, setPreferences] = useState<DesktopPreferences>({
    themePalette: "manuscript-brown",
    themeMode: "system",
  });
  const [skills, setSkills] = useState<LocalSkill[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [error, setError] = useState<string>();
  const [draftCandidate, setDraftCandidate] = useState<DesktopDraft>();
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [titleRequest, setTitleRequest] = useState<TitleRequest>();
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest>();
  const draftRef = useRef("");
  const contentRef = useRef<DesktopContent | undefined>(undefined);
  const saveInFlightRef = useRef<Promise<boolean> | null>(null);
  const saveDraftRef = useRef<() => Promise<boolean>>(async () => false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const unsavedDialogRef = useRef<HTMLElement>(null);

  const refreshProjects = useCallback(async () => {
    const items = await window.xnovelDesktop.projects.list();
    setProjects(items);
  }, []);

  async function openDocument(nextDocument: DesktopDocument) {
    if (nextDocument.kind === "folder") return;
    const [nextContent, storedDraft] = await Promise.all([
      window.xnovelDesktop.projects.content(nextDocument.id),
      window.xnovelDesktop.drafts.get(nextDocument.id),
    ]);
    setDocumentItem(nextDocument);
    setContent(nextContent);
    contentRef.current = nextContent;
    setDraft(nextContent.content);
    draftRef.current = nextContent.content;
    setDraftCandidate(
      storedDraft && storedDraft.content !== nextContent.content
        ? storedDraft
        : undefined,
    );
    setSaveState("clean");
  }

  async function openProject(next: DesktopProject) {
    const [nextDocuments, nextArchived] = await Promise.all([
      window.xnovelDesktop.projects.documents(next.id),
      window.xnovelDesktop.projects.archivedDocuments(next.id),
    ]);
    const first = nextDocuments.find((item) => item.kind !== "folder");
    setProject(next);
    setDocuments(nextDocuments);
    setArchivedDocuments(nextArchived);
    setShowArchived(false);
    setMenuOpen(false);
    requestAnimationFrame(() => menuTriggerRef.current?.focus());
    setView("writing");
    if (first) await openDocument(first);
  }

  useEffect(() => {
    Promise.all([
      window.xnovelDesktop.preferences.get(),
      window.xnovelDesktop.projects.list(),
      window.xnovelDesktop.skills.scan(),
      window.xnovelDesktop.providers.list(),
    ])
      .then(async ([prefs, items, skillItems, providerItems]) => {
        setPreferences(prefs);
        setProjects(items);
        setSkills(skillItems);
        setProviders(providerItems);
        if (items[0]) {
          const [nextDocuments, nextArchived] = await Promise.all([
            window.xnovelDesktop.projects.documents(items[0].id),
            window.xnovelDesktop.projects.archivedDocuments(items[0].id),
          ]);
          setProject(items[0]);
          setDocuments(nextDocuments);
          setArchivedDocuments(nextArchived);
          const first = nextDocuments.find((item) => item.kind !== "folder");
          if (first) {
            const [nextContent, storedDraft] = await Promise.all([
              window.xnovelDesktop.projects.content(first.id),
              window.xnovelDesktop.drafts.get(first.id),
            ]);
            setDocumentItem(first);
            setContent(nextContent);
            contentRef.current = nextContent;
            setDraft(nextContent.content);
            draftRef.current = nextContent.content;
            setDraftCandidate(
              storedDraft && storedDraft.content !== nextContent.content
                ? storedDraft
                : undefined,
            );
          }
        }
      })
      .catch(() => setError("本地工作区初始化失败，请重新启动应用。"));
  }, []);

  useEffect(() => {
    const unsubscribe =
      window.xnovelDesktop.window.onMaximizedChange(setMaximized);
    void window.xnovelDesktop.window.info().then((info) => {
      setFrameless(info.frameless);
      setMaximized(info.maximized);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    document.documentElement.dataset.themePalette = preferences.themePalette;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const scheme: ColorScheme =
        preferences.themeMode === "system"
          ? media.matches
            ? "dark"
            : "light"
          : preferences.themeMode;
      document.documentElement.dataset.colorScheme = scheme;
      const values = themeValues[preferences.themePalette][scheme];
      const styles = document.documentElement.style;
      styles.setProperty("--canvas", values.canvas);
      styles.setProperty("--surface", values.surface);
      styles.setProperty("--muted", values.surfaceMuted);
      styles.setProperty("--ink", values.ink);
      styles.setProperty("--text", values.text);
      styles.setProperty("--soft", values.textMuted);
      styles.setProperty("--accent", values.accent);
      styles.setProperty("--on-accent", values.onAccent);
      styles.setProperty("--border", values.border);
      styles.setProperty("--danger", values.danger);
      styles.setProperty("--ai", values.aiSurface);
      styles.setProperty("--ai-accent", values.aiAccent);
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences]);

  useEffect(() => {
    if (!menuOpen) return;
    const bodyStyle = document.body.style;
    const previousOverflow = bodyStyle.getPropertyValue("overflow");
    bodyStyle.setProperty("overflow", "hidden");
    requestAnimationFrame(() =>
      sidebarRef.current
        ?.querySelector<HTMLElement>("button:not([disabled])")
        ?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      requestAnimationFrame(() => menuTriggerRef.current?.focus());
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      bodyStyle.setProperty("overflow", previousOverflow);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!pendingAction) return;
    requestAnimationFrame(() =>
      unsavedDialogRef.current?.querySelector<HTMLElement>("button")?.focus(),
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingAction(undefined);
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        unsavedDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not([disabled])",
        ) ?? [],
      );
      if (!buttons.length) return;
      const first = buttons[0]!;
      const last = buttons.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingAction]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (saveInFlightRef.current) {
      await saveInFlightRef.current;
    }
    const currentDocument = documentItem;
    const confirmed = contentRef.current;
    if (
      !currentDocument ||
      !confirmed ||
      draftRef.current === confirmed.content
    )
      return true;
    const snapshot = draftRef.current;
    const baseVersion = confirmed.version;
    setSaveState("saving");
    const operation = (async () => {
      try {
        const saved = await window.xnovelDesktop.projects.save(
          currentDocument.id,
          snapshot,
          baseVersion,
        );
        contentRef.current = saved;
        setContent(saved);
        if (draftRef.current === snapshot) {
          setSaveState("saved");
          await window.xnovelDesktop.drafts.remove(currentDocument.id);
        } else {
          setSaveState("dirty");
        }
        await refreshProjects();
        return true;
      } catch {
        setSaveState("failed");
        await window.xnovelDesktop.drafts.save(
          currentDocument.id,
          draftRef.current,
          contentRef.current?.version ?? baseVersion,
        );
        return false;
      }
    })();
    saveInFlightRef.current = operation;
    const result = await operation;
    if (saveInFlightRef.current === operation) saveInFlightRef.current = null;
    if (
      result &&
      contentRef.current &&
      draftRef.current !== contentRef.current.content
    ) {
      return saveDraftRef.current();
    }
    return result;
  }, [documentItem, refreshProjects]);

  useEffect(() => {
    saveDraftRef.current = saveDraft;
  }, [saveDraft]);

  function requestChange(run: PendingAction["run"], allowStash = true) {
    if (
      !contentRef.current ||
      draftRef.current === contentRef.current.content
    ) {
      void run();
      return;
    }
    setPendingAction({ allowStash, run });
  }

  async function saveAndContinue() {
    const pending = pendingAction;
    if (!pending) return;
    if (await saveDraft()) {
      setPendingAction(undefined);
      await pending.run();
    }
  }

  async function stashAndContinue() {
    const pending = pendingAction;
    const currentDocument = documentItem;
    const confirmed = contentRef.current;
    if (!pending || !currentDocument || !confirmed) return;
    await window.xnovelDesktop.drafts.save(
      currentDocument.id,
      draftRef.current,
      confirmed.version,
    );
    setPendingAction(undefined);
    await pending.run();
  }

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(() => void saveDraft(), 900);
    return () => clearTimeout(timer);
  }, [saveDraft, saveState]);

  useEffect(() => {
    if (
      !documentItem ||
      !content ||
      draft === content.content ||
      saveState === "saving"
    )
      return;
    const timer = setTimeout(
      () =>
        void window.xnovelDesktop.drafts.save(
          documentItem.id,
          draft,
          content.version,
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [content, documentItem, draft, saveState]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDraft();
      }
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, [saveDraft]);

  function requestTitle(request: TitleRequest) {
    requestChange(() => setTitleRequest(request));
  }

  function requestCreateProject() {
    requestTitle({
      heading: "新建作品",
      label: "作品名称",
      initialValue: "",
      submitLabel: "创建作品",
      onSubmit: createProject,
    });
  }

  async function createProject(title: string) {
    const created = await window.xnovelDesktop.projects.create(title);
    await refreshProjects();
    await openProject(created.project);
  }

  async function refreshDocuments(projectId = project?.id) {
    if (!projectId) return;
    setDocuments(await window.xnovelDesktop.projects.documents(projectId));
  }

  function requestCreateDocument(kind: DesktopDocument["kind"]) {
    if (!project) return;
    requestTitle({
      heading:
        kind === "folder"
          ? "新建文件夹"
          : kind === "outline"
            ? "新建大纲"
            : "新建正文",
      label:
        kind === "folder"
          ? "文件夹名称"
          : kind === "outline"
            ? "大纲名称"
            : "章节名称",
      initialValue: "",
      submitLabel: "创建",
      onSubmit: (title) => createLocalDocument(kind, title),
    });
  }

  async function createLocalDocument(
    kind: DesktopDocument["kind"],
    title: string,
  ) {
    if (!project) return;
    const created = await window.xnovelDesktop.projects.createDocument({
      projectId: project.id,
      parentId: null,
      title,
      kind,
    });
    await refreshDocuments(project.id);
    if (created.kind !== "folder") await openDocument(created);
  }

  function requestRenameDocument(item: DesktopDocument) {
    requestTitle({
      heading: "重命名文档",
      label: "文档名称",
      initialValue: item.title,
      submitLabel: "保存名称",
      onSubmit: (title) => renameLocalDocument(item, title),
    });
  }

  async function renameLocalDocument(item: DesktopDocument, title: string) {
    const updated = await window.xnovelDesktop.projects.renameDocument(
      item.id,
      title,
    );
    setDocuments((items) =>
      items.map((entry) => (entry.id === updated.id ? updated : entry)),
    );
    if (documentItem?.id === updated.id) setDocumentItem(updated);
  }

  async function archiveLocalDocument(item: DesktopDocument) {
    const archived = await window.xnovelDesktop.projects.setDocumentArchived(
      item.id,
      true,
    );
    setArchivedDocuments((items) => [...items, archived]);
    const next = documents.filter((entry) => entry.id !== item.id);
    setDocuments(next);
    if (documentItem?.id === item.id) {
      const fallback = next.find((entry) => entry.kind !== "folder");
      if (fallback) await openDocument(fallback);
      else {
        setDocumentItem(undefined);
        setContent(undefined);
        contentRef.current = undefined;
        setDraft("");
        draftRef.current = "";
      }
    }
  }

  async function restoreLocalDocument(item: DesktopDocument) {
    const restored = await window.xnovelDesktop.projects.setDocumentArchived(
      item.id,
      false,
    );
    setArchivedDocuments((items) =>
      items.filter((entry) => entry.id !== item.id),
    );
    setDocuments((items) => [...items, restored]);
  }

  function countDescendants(item: DesktopDocument): number {
    const all = [...documents, ...archivedDocuments];
    let total = 0;
    const queue = [item.id];
    while (queue.length) {
      const parentId = queue.shift()!;
      for (const entry of all) {
        if (entry.parentId !== parentId) continue;
        total += 1;
        queue.push(entry.id);
      }
    }
    return total;
  }

  async function refreshDocumentLists(projectId: string) {
    const [active, archived] = await Promise.all([
      window.xnovelDesktop.projects.documents(projectId),
      window.xnovelDesktop.projects.archivedDocuments(projectId),
    ]);
    setDocuments(active);
    setArchivedDocuments(archived);
    return active;
  }

  function clearEditor() {
    setDocumentItem(undefined);
    setContent(undefined);
    contentRef.current = undefined;
    setDraft("");
    draftRef.current = "";
    setDraftCandidate(undefined);
    setSaveState("clean");
  }

  async function deleteLocalDocument(item: DesktopDocument) {
    try {
      await window.xnovelDesktop.projects.deleteDocument(item.id);
      const next = await refreshDocumentLists(item.projectId);
      if (documentItem && !next.some((entry) => entry.id === documentItem.id)) {
        const fallback = next.find((entry) => entry.kind !== "folder");
        if (fallback) await openDocument(fallback);
        else clearEditor();
      }
    } catch (error) {
      setError(deleteErrorMessage(error));
    }
  }

  async function deleteLocalProject(item: DesktopProject) {
    try {
      await window.xnovelDesktop.projects.remove(item.id);
      await refreshProjects();
      if (project?.id === item.id) closeProject();
    } catch (error) {
      setError(deleteErrorMessage(error));
    }
  }

  function requestDeleteDocument(item: DesktopDocument) {
    requestChange(() =>
      setConfirmRequest({
        heading: item.kind === "folder" ? "删除文件夹" : "删除文档",
        description:
          item.kind === "folder"
            ? `将同时删除「${item.title}」内的 ${countDescendants(item)} 个文档，删除后不可恢复。`
            : `「${item.title}」的正文与历史版本将被彻底删除，不可恢复。`,
        confirmLabel: "彻底删除",
        onConfirm: async () => {
          setConfirmRequest(undefined);
          await deleteLocalDocument(item);
        },
      }),
    );
  }

  function requestDeleteProject(item: DesktopProject) {
    requestChange(() =>
      setConfirmRequest({
        heading: "删除作品",
        description: `「${item.title}」及其全部文档、正文、历史版本与本地草稿将被彻底删除，不可恢复。`,
        confirmLabel: "彻底删除",
        onConfirm: async () => {
          setConfirmRequest(undefined);
          await deleteLocalProject(item);
        },
      }),
    );
  }

  async function moveLocalDocument(item: DesktopDocument, offset: -1 | 1) {
    const siblings = documents
      .filter((entry) => entry.parentId === item.parentId)
      .sort((left, right) => left.position - right.position);
    const index = siblings.findIndex((entry) => entry.id === item.id);
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= siblings.length) return;
    setDocuments(
      await window.xnovelDesktop.projects.moveDocument(
        item.id,
        item.parentId,
        nextIndex,
      ),
    );
  }

  async function dropLocalDocument(
    source: DesktopDocument,
    target: DesktopDocument,
  ) {
    try {
      const parentId = target.kind === "folder" ? target.id : target.parentId;
      const position =
        target.kind === "folder"
          ? documents.filter((item) => item.parentId === target.id).length
          : target.position;
      setDocuments(
        await window.xnovelDesktop.projects.moveDocument(
          source.id,
          parentId,
          position,
        ),
      );
    } catch {
      setError("无法移动文档，请确认目标不是它自己的子目录。");
    }
  }

  function closeProject() {
    setProject(undefined);
    setDocumentItem(undefined);
    setDocuments([]);
    setArchivedDocuments([]);
    setContent(undefined);
    contentRef.current = undefined;
    setDraft("");
    draftRef.current = "";
    setSaveState("clean");
  }

  return (
    <div className="desktop-app">
      <header
        className="desktop-topbar"
        data-frameless={frameless ? "true" : undefined}
      >
        <button
          className="icon-button mobile-only"
          aria-label="打开作品列表"
          onClick={() => setMenuOpen(true)}
          ref={menuTriggerRef}
        >
          <Menu />
        </button>
        <div className="desktop-brand">xnovel</div>
        <div className="local-badge">
          <HardDrive aria-hidden size={15} />
          <span>本地工作区</span>
          <small>离线可用</small>
        </div>
        <div className="topbar-actions">
          <button
            aria-pressed={view === "skills"}
            className={view === "skills" ? "active" : ""}
            onClick={() => setView("skills")}
          >
            <ShieldCheck aria-hidden size={16} />
            Skills
          </button>
          <button
            aria-pressed={view === "settings"}
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <Settings aria-hidden size={16} />
            设置
          </button>
        </div>
        {frameless ? (
          <div className="window-controls">
            <button
              aria-label="最小化"
              className="window-control"
              onClick={() => void window.xnovelDesktop.window.minimize()}
            >
              <Minus aria-hidden size={16} />
            </button>
            <button
              aria-label={maximized ? "向下还原" : "最大化"}
              className="window-control"
              onClick={async () => {
                const next = await window.xnovelDesktop.window.toggleMaximize();
                setMaximized(next.maximized);
              }}
            >
              {maximized ? (
                <Copy aria-hidden size={15} />
              ) : (
                <Square aria-hidden size={15} />
              )}
            </button>
            <button
              aria-label="关闭"
              className="window-control close"
              onClick={() => void window.xnovelDesktop.window.close()}
            >
              <X aria-hidden size={17} />
            </button>
          </div>
        ) : null}
      </header>
      <div className="desktop-body">
        <aside
          className={`project-sidebar ${menuOpen ? "open" : ""}`}
          ref={sidebarRef}
        >
          <div className="sidebar-heading">
            <strong>{project ? "作品结构" : "作品"}</strong>
            <button
              className="icon-button mobile-only"
              aria-label="关闭作品列表"
              onClick={() => {
                setMenuOpen(false);
                requestAnimationFrame(() => menuTriggerRef.current?.focus());
              }}
            >
              <X />
            </button>
          </div>
          {project ? (
            <>
              <button
                className="back-to-projects full"
                onClick={() => requestChange(closeProject)}
              >
                <ChevronLeft aria-hidden size={17} />
                返回作品列表
              </button>
              <div className="document-create-actions">
                <button onClick={() => requestCreateDocument("manuscript")}>
                  <Plus aria-hidden size={16} />
                  正文
                </button>
                <button onClick={() => requestCreateDocument("folder")}>
                  文件夹
                </button>
                <button onClick={() => requestCreateDocument("outline")}>
                  大纲
                </button>
              </div>
              <button
                aria-pressed={showArchived}
                className="full archived-toggle"
                onClick={() => setShowArchived((value) => !value)}
              >
                {showArchived
                  ? "查看当前文档"
                  : `已归档（${archivedDocuments.length}）`}
              </button>
              {showArchived ? (
                <div className="archived-document-list">
                  {archivedDocuments.length ? (
                    archivedDocuments.map((item) => (
                      <div key={item.id}>
                        <span>{item.title}</span>
                        <div className="archived-document-actions">
                          <button
                            onClick={() => void restoreLocalDocument(item)}
                          >
                            恢复
                          </button>
                          <button
                            aria-label={`彻底删除${item.title}`}
                            onClick={() => requestDeleteDocument(item)}
                          >
                            彻底删除
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p>没有已归档文档。</p>
                  )}
                </div>
              ) : (
                <DesktopDocumentTree
                  documents={documents}
                  selectedId={documentItem?.id}
                  onArchive={(item) =>
                    requestChange(() => archiveLocalDocument(item))
                  }
                  onDelete={requestDeleteDocument}
                  onDrop={(source, target) =>
                    void dropLocalDocument(source, target)
                  }
                  onMove={(item, offset) =>
                    void moveLocalDocument(item, offset)
                  }
                  onOpen={(item) => requestChange(() => openDocument(item))}
                  onRename={requestRenameDocument}
                />
              )}
            </>
          ) : (
            <>
              <button className="primary full" onClick={requestCreateProject}>
                <Plus aria-hidden size={17} />
                新建作品
              </button>
              <nav aria-label="本地作品">
                {projects.map((item) => (
                  <div className="project-link-row" key={item.id}>
                    <button
                      className="project-link"
                      onClick={() => requestChange(() => openProject(item))}
                    >
                      <BookOpenText aria-hidden size={17} />
                      <span>{item.title}</span>
                    </button>
                    <button
                      aria-label={`删除作品${item.title}`}
                      className="icon-button"
                      onClick={() => requestDeleteProject(item)}
                    >
                      <Trash2 aria-hidden size={16} />
                    </button>
                  </div>
                ))}
              </nav>
            </>
          )}
          {!project && projects.length === 0 ? (
            <div className="sidebar-empty">
              还没有作品。
              <br />
              从一个标题开始。
            </div>
          ) : null}
        </aside>
        {menuOpen ? (
          <button
            className="scrim"
            aria-label="关闭作品列表"
            onClick={() => {
              setMenuOpen(false);
              requestAnimationFrame(() => menuTriggerRef.current?.focus());
            }}
          />
        ) : null}
        <main className="desktop-main">
          {error ? (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button onClick={() => window.location.reload()}>重新加载</button>
            </div>
          ) : null}
          {view === "writing" ? (
            <WritingView
              project={project}
              documentItem={documentItem}
              content={content}
              draft={draft}
              saveState={saveState}
              onDraft={(value) => {
                draftRef.current = value;
                setDraft(value);
                setSaveState(value === content?.content ? "clean" : "dirty");
              }}
              onSave={() => void saveDraft()}
              onAi={() => requestChange(() => setAiOpen(true), false)}
              onCreate={requestCreateProject}
              draftCandidate={draftCandidate}
              onDiscardDraft={async () => {
                if (!documentItem) return;
                await window.xnovelDesktop.drafts.remove(documentItem.id);
                setDraftCandidate(undefined);
              }}
              onRestoreDraft={() => {
                if (!draftCandidate) return;
                draftRef.current = draftCandidate.content;
                setDraft(draftCandidate.content);
                setSaveState("dirty");
                setDraftCandidate(undefined);
              }}
            />
          ) : view === "skills" ? (
            <SkillsView
              skills={skills}
              onRefresh={async () =>
                setSkills(await window.xnovelDesktop.skills.scan())
              }
              onToggle={async (skill, enabled) =>
                setSkills(
                  await window.xnovelDesktop.skills.setEnabled(
                    skill.directoryKey,
                    enabled,
                    skill.contentFingerprint,
                  ),
                )
              }
            />
          ) : (
            <SettingsView
              value={preferences}
              onChange={async (value) => {
                const saved = await window.xnovelDesktop.preferences.set(value);
                setPreferences(saved);
              }}
            />
          )}
        </main>
        <AiPanel
          blocked={Boolean(content && draft !== content.content)}
          open={aiOpen}
          project={project}
          documentItem={documentItem}
          content={content}
          providers={providers}
          skills={skills}
          onClose={() => setAiOpen(false)}
          onProvider={async (input) => {
            await window.xnovelDesktop.providers.save(input);
            setProviders(await window.xnovelDesktop.providers.list());
          }}
          onApplied={async () => {
            if (documentItem) {
              const next = await window.xnovelDesktop.projects.content(
                documentItem.id,
              );
              setContent(next);
              contentRef.current = next;
              setDraft(next.content);
              draftRef.current = next.content;
              setSaveState("clean");
            }
          }}
        />
        {pendingAction ? (
          <div className="dialog-scrim" role="presentation">
            <section
              aria-labelledby="unsaved-title"
              aria-modal="true"
              className="unsaved-dialog"
              ref={unsavedDialogRef}
              role="dialog"
            >
              <h2 id="unsaved-title">正文尚未保存</h2>
              <p>先处理当前正文，再继续这项操作。</p>
              {saveState === "failed" ? (
                <p className="dialog-error">
                  保存失败，正文仍保留在本地草稿中。
                </p>
              ) : null}
              <div>
                <button onClick={() => setPendingAction(undefined)}>
                  留在当前正文
                </button>
                {pendingAction.allowStash ? (
                  <button onClick={() => void stashAndContinue()}>
                    保留草稿并继续
                  </button>
                ) : null}
                <button
                  className="primary"
                  onClick={() => void saveAndContinue()}
                >
                  保存并继续
                </button>
              </div>
            </section>
          </div>
        ) : null}
        {titleRequest ? (
          <TitleDialog
            request={titleRequest}
            onCancel={() => setTitleRequest(undefined)}
          />
        ) : null}
        {confirmRequest ? (
          <ConfirmDialog
            request={confirmRequest}
            onCancel={() => setConfirmRequest(undefined)}
          />
        ) : null}
      </div>
    </div>
  );
}

function useDialogKeyboard(
  ref: { current: HTMLElement | null },
  onClose: () => void,
): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          "input, button:not([disabled])",
        ) ?? [],
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, ref]);
}

function ConfirmDialog({
  request,
  onCancel,
}: {
  request: ConfirmRequest;
  onCancel: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  useDialogKeyboard(dialogRef, onCancel);

  useEffect(() => {
    requestAnimationFrame(() =>
      dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus(),
    );
  }, []);

  return (
    <div className="dialog-scrim" role="presentation">
      <section
        aria-labelledby="confirm-dialog-heading"
        aria-modal="true"
        className="unsaved-dialog confirm-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="confirm-dialog-heading">{request.heading}</h2>
        <p>{request.description}</p>
        <div>
          <button onClick={onCancel}>取消</button>
          <button className="danger" onClick={() => void request.onConfirm()}>
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function TitleDialog({
  request,
  onCancel,
}: {
  request: TitleRequest;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(request.initialValue);
  const dialogRef = useRef<HTMLElement>(null);
  const title = value.trim();
  useDialogKeyboard(dialogRef, onCancel);

  function submit() {
    if (!title) return;
    onCancel();
    void request.onSubmit(title);
  }

  useEffect(() => {
    requestAnimationFrame(() => {
      const input = dialogRef.current?.querySelector<HTMLInputElement>("input");
      input?.focus();
      input?.select();
    });
  }, []);

  return (
    <div className="dialog-scrim" role="presentation">
      <section
        aria-labelledby="title-dialog-heading"
        aria-modal="true"
        className="unsaved-dialog title-dialog"
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="title-dialog-heading">{request.heading}</h2>
        <label htmlFor="title-dialog-input">
          {request.label}
          <input
            autoComplete="off"
            id="title-dialog-input"
            maxLength={120}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            value={value}
          />
        </label>
        <div>
          <button onClick={onCancel}>取消</button>
          <button className="primary" disabled={!title} onClick={submit}>
            {request.submitLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function DesktopDocumentTree({
  documents,
  selectedId,
  onArchive,
  onDelete,
  onDrop,
  onMove,
  onOpen,
  onRename,
}: {
  documents: DesktopDocument[];
  selectedId?: string;
  onArchive(item: DesktopDocument): void;
  onDelete(item: DesktopDocument): void;
  onDrop(source: DesktopDocument, target: DesktopDocument): void;
  onMove(item: DesktopDocument, offset: -1 | 1): void;
  onOpen(item: DesktopDocument): void;
  onRename(item: DesktopDocument): void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const byParent = new Map<string | null, DesktopDocument[]>();
  for (const item of documents) {
    const siblings = byParent.get(item.parentId) ?? [];
    siblings.push(item);
    byParent.set(item.parentId, siblings);
  }
  for (const siblings of byParent.values())
    siblings.sort((left, right) => left.position - right.position);

  function render(parentId: string | null, depth = 0): ReactNode {
    return (byParent.get(parentId) ?? []).map((item) => {
      const isFolder = item.kind === "folder";
      const isCollapsed = collapsed.has(item.id);
      const Icon = isFolder ? Folder : FileText;
      return (
        <div
          key={item.id}
          role="treeitem"
          aria-expanded={isFolder ? !isCollapsed : undefined}
        >
          <div
            className={`desktop-document-row ${selectedId === item.id ? "selected" : ""}`}
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData("text/plain", item.id)
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const source = documents.find(
                (entry) =>
                  entry.id === event.dataTransfer.getData("text/plain"),
              );
              if (source && source.id !== item.id) onDrop(source, item);
            }}
            style={{ paddingInlineStart: `${8 + depth * 16}px` }}
          >
            <button
              aria-label={
                isFolder
                  ? isCollapsed
                    ? `展开${item.title}`
                    : `收起${item.title}`
                  : undefined
              }
              className="tree-expander"
              disabled={!isFolder}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })
              }
            >
              {isFolder ? (
                isCollapsed ? (
                  <ChevronRight aria-hidden />
                ) : (
                  <ChevronDown aria-hidden />
                )
              ) : null}
            </button>
            <button
              aria-current={selectedId === item.id ? "page" : undefined}
              className="document-title-button"
              onClick={() => (isFolder ? undefined : onOpen(item))}
            >
              <Icon aria-hidden size={16} />
              <span>{item.title}</span>
            </button>
            <div className="document-row-actions">
              <button
                aria-label={`上移${item.title}`}
                onClick={() => onMove(item, -1)}
              >
                <ArrowUp aria-hidden />
              </button>
              <button
                aria-label={`下移${item.title}`}
                onClick={() => onMove(item, 1)}
              >
                <ArrowDown aria-hidden />
              </button>
              <button
                aria-label={`重命名${item.title}`}
                onClick={() => onRename(item)}
              >
                <Pencil aria-hidden />
              </button>
              <button
                aria-label={`归档${item.title}`}
                onClick={() => onArchive(item)}
              >
                <Archive aria-hidden />
              </button>
              <button
                aria-label={`删除${item.title}`}
                onClick={() => onDelete(item)}
              >
                <Trash2 aria-hidden />
              </button>
            </div>
          </div>
          {isFolder && !isCollapsed ? render(item.id, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <div className="desktop-document-tree" role="tree" aria-label="作品文档树">
      {render(null)}
    </div>
  );
}

function WritingView({
  project,
  documentItem,
  content,
  draft,
  saveState,
  onDraft,
  onSave,
  onAi,
  onCreate,
  draftCandidate,
  onDiscardDraft,
  onRestoreDraft,
}: {
  project?: DesktopProject;
  documentItem?: DesktopDocument;
  content?: DesktopContent;
  draft: string;
  saveState: SaveState;
  onDraft(value: string): void;
  onSave(): void;
  onAi(): void;
  onCreate(): void;
  draftCandidate?: DesktopDraft;
  onDiscardDraft(): Promise<void>;
  onRestoreDraft(): void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [replacementText, setReplacementText] = useState("");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const editorRef = useRef<HTMLTextAreaElement>(null);

  function selectMatch(direction: "next" | "previous") {
    if (!searchText) return;
    const haystack = draft.toLocaleLowerCase();
    const needle = searchText.toLocaleLowerCase();
    let index =
      direction === "next"
        ? haystack.indexOf(needle, selection.end)
        : haystack.lastIndexOf(needle, Math.max(0, selection.start - 1));
    if (index < 0)
      index =
        direction === "next"
          ? haystack.indexOf(needle)
          : haystack.lastIndexOf(needle);
    if (index < 0) return;
    const next = { start: index, end: index + searchText.length };
    setSelection(next);
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current?.setSelectionRange(next.start, next.end);
    });
  }

  function replaceCurrent() {
    const selected = draft.slice(selection.start, selection.end);
    if (
      !searchText ||
      selected.toLocaleLowerCase() !== searchText.toLocaleLowerCase()
    ) {
      selectMatch("next");
      return;
    }
    const next =
      draft.slice(0, selection.start) +
      replacementText +
      draft.slice(selection.end);
    onDraft(next);
  }

  function replaceAll() {
    if (!searchText) return;
    const escaped = searchText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    onDraft(draft.replace(new RegExp(escaped, "giu"), replacementText));
  }
  if (!project)
    return (
      <section className="welcome">
        <span className="eyebrow">你的本地小说工作室</span>
        <h1>故事留在你的设备上</h1>
        <p>无需登录，也不需要网络。创建一个作品，随时开始写作。</p>
        <button className="primary" onClick={onCreate}>
          <Plus aria-hidden size={18} />
          创建第一个作品
        </button>
      </section>
    );
  return (
    <section className="writing-workspace">
      <header className="writing-heading">
        <div>
          <span className="back-label" aria-label="当前作品">
            <ChevronLeft aria-hidden size={16} />
            本地作品
          </span>
          <h1>{project.title}</h1>
        </div>
        <div className="writing-actions">
          <span aria-live="polite" className={`save-state ${saveState}`}>
            {saveLabel(saveState)}
          </span>
          <button
            aria-pressed={searchOpen}
            onClick={() => setSearchOpen((value) => !value)}
          >
            <Search aria-hidden size={16} />
            查找
          </button>
          <button
            onClick={onSave}
            disabled={saveState === "clean" || saveState === "saving"}
          >
            <Save aria-hidden size={16} />
            保存
          </button>
          <button onClick={onAi}>
            <Sparkles aria-hidden size={16} />
            AI 候选
          </button>
        </div>
      </header>
      {draftCandidate ? (
        <section className="draft-banner" role="status">
          <div>
            <strong>发现未保存草稿</strong>
            <span>草稿不会自动覆盖已保存正文。</span>
          </div>
          <button onClick={onRestoreDraft}>恢复草稿</button>
          <button onClick={() => void onDiscardDraft()}>放弃草稿</button>
        </section>
      ) : null}
      {saveState === "failed" ? (
        <section className="draft-banner error" role="alert">
          <div>
            <strong>保存失败</strong>
            <span>正文仍保留在编辑器和本地草稿中。</span>
          </div>
          <button onClick={onSave}>重试</button>
          <button onClick={() => void navigator.clipboard.writeText(draft)}>
            复制正文
          </button>
        </section>
      ) : null}
      {searchOpen ? (
        <div className="desktop-find-bar" role="search">
          <input
            aria-label="查找"
            onChange={(event) => setSearchText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter")
                selectMatch(event.shiftKey ? "previous" : "next");
            }}
            placeholder="查找正文"
            value={searchText}
          />
          {replaceOpen ? (
            <input
              aria-label="替换为"
              onChange={(event) => setReplacementText(event.target.value)}
              placeholder="替换内容"
              value={replacementText}
            />
          ) : null}
          <button onClick={() => selectMatch("previous")}>上一个</button>
          <button onClick={() => selectMatch("next")}>下一个</button>
          {replaceOpen ? (
            <>
              <button onClick={replaceCurrent}>替换当前</button>
              <button onClick={replaceAll}>全部替换</button>
            </>
          ) : (
            <button onClick={() => setReplaceOpen(true)}>替换</button>
          )}
          <button onClick={() => setSearchOpen(false)}>关闭</button>
        </div>
      ) : null}
      <article className="editor-surface">
        <div className="document-heading">
          <FileText aria-hidden size={18} />
          <div>
            <strong>{documentItem?.title ?? "正文"}</strong>
            <small>
              {countWords(draft)} 字
              {selection.end > selection.start
                ? ` · 选中 ${countWords(draft.slice(selection.start, selection.end))} 字`
                : ""}
              {` · 版本 ${content?.version ?? 1}`}
            </small>
          </div>
        </div>
        <textarea
          aria-label="正文编辑器"
          placeholder="从这里开始写作……"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              (event.ctrlKey || event.metaKey) &&
              event.key.toLowerCase() === "f"
            ) {
              event.preventDefault();
              setSearchOpen(true);
            } else if (
              (event.ctrlKey || event.metaKey) &&
              event.key.toLowerCase() === "h"
            ) {
              event.preventDefault();
              setSearchOpen(true);
              setReplaceOpen(true);
            } else if (event.key === "Escape" && searchOpen) {
              setSearchOpen(false);
            }
          }}
          onSelect={(event) =>
            setSelection({
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            })
          }
          ref={editorRef}
        />
      </article>
    </section>
  );
}

function SkillsView({
  skills,
  onRefresh,
  onToggle,
}: {
  skills: LocalSkill[];
  onRefresh(): Promise<void>;
  onToggle(skill: LocalSkill, enabled: boolean): Promise<void>;
}) {
  const [detail, setDetail] = useState<LocalSkillDetail>();
  return (
    <section className="tool-view">
      <header className="page-heading">
        <div>
          <span className="eyebrow">只读本地能力</span>
          <h1>本地 Skills</h1>
          <p>
            扫描 ~/.agents/skills
            一级目录；内容变化时自动禁用，绝不执行其中的脚本。
          </p>
        </div>
        <button onClick={() => void onRefresh()}>
          <RefreshCw aria-hidden size={16} />
          重新扫描
        </button>
      </header>
      {skills.length === 0 ? (
        <div className="empty-state">
          <ShieldCheck aria-hidden size={30} />
          <h2>没有发现本地 Skill</h2>
          <p>原目录不会被 xnovel 创建或修改。</p>
        </div>
      ) : (
        <div className="row-list">
          {skills.map((skill) => (
            <article className="data-row" key={skill.directoryKey}>
              <div>
                <strong>{skill.name}</strong>
                <p>{skill.description || skill.directoryName}</p>
                <small>
                  {skill.status === "ready"
                    ? skill.contentFingerprint.slice(0, 12) + "…"
                    : statusLabel(skill.status)}
                </small>
              </div>
              <div className="row-actions">
                <button
                  onClick={async () =>
                    setDetail(
                      await window.xnovelDesktop.skills.detail(
                        skill.directoryKey,
                      ),
                    )
                  }
                >
                  查看
                </button>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={skill.enabled}
                    disabled={skill.status !== "ready"}
                    onChange={(event) =>
                      void onToggle(skill, event.target.checked)
                    }
                  />
                  <span>{skill.enabled ? "已启用" : "未启用"}</span>
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
      {detail ? (
        <div
          className="detail-dialog"
          role="dialog"
          aria-labelledby="skill-detail-title"
        >
          <header>
            <div>
              <span className="eyebrow">只读详情</span>
              <h2 id="skill-detail-title">{detail.skill.name}</h2>
            </div>
            <button
              className="icon-button"
              aria-label="关闭 Skill 详情"
              onClick={() => setDetail(undefined)}
            >
              <X />
            </button>
          </header>
          <pre>{detail.skillMarkdown}</pre>
        </div>
      ) : null}
    </section>
  );
}

function SettingsView({
  value,
  onChange,
}: {
  value: DesktopPreferences;
  onChange(value: DesktopPreferences): Promise<void>;
}) {
  async function checkAndUpdate() {
    const result = await window.xnovelDesktop.update.check();
    if (result.status !== "available") {
      alert("当前无需更新");
      return;
    }
    if (!confirm(`发现版本 ${result.version}，现在下载？`)) return;
    const downloaded = await window.xnovelDesktop.update.download();
    if (
      downloaded.status === "downloaded" &&
      confirm("更新已完成签名校验并下载。现在重启安装？")
    ) {
      await window.xnovelDesktop.update.install();
    }
  }
  const palettes: Array<[ThemePalette, string]> = [
    ["manuscript-brown", "手稿棕"],
    ["pine-green", "松林绿"],
    ["harbor-blue", "港湾蓝"],
    ["grape-purple", "葡萄紫"],
    ["graphite", "石墨灰"],
  ];
  const modes: Array<[ThemeMode, string]> = [
    ["system", "跟随系统"],
    ["light", "浅色"],
    ["dark", "深色"],
  ];
  return (
    <section className="tool-view">
      <header className="page-heading">
        <div>
          <span className="eyebrow">设备偏好</span>
          <h1>外观与数据</h1>
          <p>设置只保存在本机，不与 Web 自动同步。</p>
        </div>
      </header>
      <div className="settings-section">
        <h2>主题家族</h2>
        <div className="choice-grid">
          {palettes.map(([key, label]) => (
            <button
              aria-pressed={value.themePalette === key}
              className={value.themePalette === key ? "selected" : ""}
              key={key}
              onClick={() => void onChange({ ...value, themePalette: key })}
            >
              <span className={`palette-swatch ${key}`} />
              {label}
              {value.themePalette === key ? (
                <Check aria-hidden size={16} />
              ) : null}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section">
        <h2>显示模式</h2>
        <div className="segmented">
          {modes.map(([key, label]) => (
            <button
              aria-pressed={value.themeMode === key}
              className={value.themeMode === key ? "selected" : ""}
              key={key}
              onClick={() => void onChange({ ...value, themeMode: key })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-section data-safety">
        <h2>数据安全</h2>
        <p>备份使用 SQLite 一致性快照，不包含 AI 凭据。</p>
        <button
          onClick={async () =>
            alert(`备份已创建：${await window.xnovelDesktop.backup.create()}`)
          }
        >
          立即创建备份
        </button>
        <button onClick={() => void checkAndUpdate()}>检查更新</button>
        <button
          onClick={async () => {
            if (
              confirm(
                "恢复最近备份会替换当前本地数据库并重启应用。当前数据库会先自动备份。是否继续？",
              )
            ) {
              const restored =
                await window.xnovelDesktop.backup.restoreLatest();
              if (!restored) alert("还没有可恢复的备份。");
            }
          }}
        >
          恢复最近备份
        </button>
      </div>
    </section>
  );
}

function AiPanel({
  blocked,
  open,
  project,
  documentItem,
  content,
  providers,
  skills,
  onClose,
  onProvider,
  onApplied,
}: {
  blocked: boolean;
  open: boolean;
  project?: DesktopProject;
  documentItem?: DesktopDocument;
  content?: DesktopContent;
  providers: ProviderSummary[];
  skills: LocalSkill[];
  onClose(): void;
  onProvider(input: {
    displayName: string;
    protocol: "openai_chat";
    baseUrl: string;
    model: string;
    apiKey?: string;
  }): Promise<void>;
  onApplied(): Promise<void>;
}) {
  const [instruction, setInstruction] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [providerId, setProviderId] = useState("");
  const [candidate, setCandidate] = useState<AiCandidate>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerForm, setProviderForm] = useState({
    displayName: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "",
    apiKey: "",
  });
  async function addProvider() {
    if (
      !providerForm.displayName ||
      !providerForm.baseUrl ||
      !providerForm.model
    )
      return;
    await onProvider({
      ...providerForm,
      protocol: "openai_chat",
      apiKey: providerForm.apiKey || undefined,
    });
    setProviderForm((value) => ({ ...value, model: "", apiKey: "" }));
    setShowProviderForm(false);
  }
  async function run() {
    if (blocked) {
      setError("请先保存正文，再生成 AI 候选。");
      return;
    }
    if (!project || !documentItem || !instruction.trim()) return;
    setWorking(true);
    setError(undefined);
    try {
      const result = await window.xnovelDesktop.ai.run({
        projectId: project.id,
        documentId: documentItem.id,
        providerId: providerId || providers[0]?.id || "",
        instruction,
        skillKeys: selectedSkills,
      });
      setCandidate(result);
    } catch {
      setError("AI 调用失败。正文与输入均未改变。");
    } finally {
      setWorking(false);
    }
  }
  async function decide(decision: "apply" | "reject") {
    if (!candidate || !documentItem || !content) return;
    if (decision === "apply" && blocked) {
      setError("正文已在候选生成后变化；请复制候选或保存后重新生成。");
      return;
    }
    if (
      decision === "apply" &&
      !confirm("将候选替换到当前正文？版本变化时操作会被拒绝。")
    )
      return;
    try {
      await window.xnovelDesktop.ai.decide({
        resultId: candidate.resultId,
        decision,
        documentId: documentItem.id,
        version: decision === "apply" ? content.version : undefined,
      });
      setCandidate(undefined);
      if (decision === "apply") await onApplied();
    } catch {
      setError("正文版本已变化，候选未应用；请复制候选或重新生成。");
    }
  }
  return (
    <aside
      className={`ai-drawer ${open ? "open" : ""}`}
      aria-hidden={!open}
      aria-label="AI 候选工具"
    >
      <header>
        <div>
          <Bot aria-hidden size={19} />
          <div>
            <strong>AI 候选</strong>
            <small>不会自动覆盖正文</small>
          </div>
        </div>
        <button
          className="icon-button"
          aria-label="关闭 AI 工具"
          onClick={onClose}
        >
          <X />
        </button>
      </header>
      <div className="drawer-content">
        {providers.length === 0 ? (
          <div className="empty-state compact">
            <Bot aria-hidden size={28} />
            <h2>还没有模型连接</h2>
            <p>密钥只在主进程加密保存。</p>
            <button
              className="primary"
              onClick={() => setShowProviderForm(true)}
            >
              添加 OpenAI 兼容连接
            </button>
          </div>
        ) : (
          <>
            <label>
              模型连接
              <select
                value={providerId || providers[0]?.id}
                onChange={(event) => setProviderId(event.target.value)}
              >
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.displayName} · {item.model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              你的要求
              <textarea
                rows={5}
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="例如：给出三个更有张力的冲突方向"
              />
            </label>
            {skills.some((item) => item.enabled) ? (
              <fieldset>
                <legend>本次使用的 Skills</legend>
                {skills
                  .filter((item) => item.enabled)
                  .map((skill) => (
                    <label className="checkbox" key={skill.directoryKey}>
                      <input
                        type="checkbox"
                        checked={selectedSkills.includes(skill.directoryKey)}
                        onChange={(event) =>
                          setSelectedSkills((items) =>
                            event.target.checked
                              ? [...items, skill.directoryKey]
                              : items.filter(
                                  (item) => item !== skill.directoryKey,
                                ),
                          )
                        }
                      />
                      {skill.name}
                    </label>
                  ))}
              </fieldset>
            ) : null}
            <button
              className="primary full"
              disabled={blocked || working || !instruction.trim()}
              onClick={() => void run()}
            >
              {working ? "生成中…" : "生成候选"}
            </button>
          </>
        )}
        {error ? <div className="error-banner">{error}</div> : null}
        {candidate ? (
          <section className="candidate">
            <div>
              <strong>AI 候选</strong>
              <span>等待你的决定</span>
            </div>
            <pre>{candidate.content}</pre>
            <footer>
              <button onClick={() => void decide("reject")}>舍弃</button>
              <button
                className="primary"
                disabled={blocked}
                onClick={() => void decide("apply")}
              >
                应用到正文
              </button>
            </footer>
          </section>
        ) : null}
        {showProviderForm ? (
          <div
            className="drawer-modal"
            role="dialog"
            aria-labelledby="provider-form-title"
          >
            <div className="drawer-modal-heading">
              <strong id="provider-form-title">添加模型连接</strong>
              <button
                className="icon-button"
                aria-label="关闭连接表单"
                onClick={() => setShowProviderForm(false)}
              >
                <X />
              </button>
            </div>
            <label>
              连接名称
              <input
                value={providerForm.displayName}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    displayName: event.target.value,
                  })
                }
              />
            </label>
            <label>
              HTTPS API 地址
              <input
                value={providerForm.baseUrl}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    baseUrl: event.target.value,
                  })
                }
              />
            </label>
            <label>
              模型 ID
              <input
                value={providerForm.model}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    model: event.target.value,
                  })
                }
              />
            </label>
            <label>
              API Key
              <input
                autoComplete="new-password"
                type="password"
                value={providerForm.apiKey}
                onChange={(event) =>
                  setProviderForm({
                    ...providerForm,
                    apiKey: event.target.value,
                  })
                }
              />
            </label>
            <p>密钥通过系统安全能力加密，不会返回 renderer。</p>
            <button
              className="primary full"
              disabled={
                !providerForm.displayName ||
                !providerForm.baseUrl ||
                !providerForm.model
              }
              onClick={() => void addProvider()}
            >
              保存连接
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

const saveLabel = (state: SaveState) =>
  ({
    clean: "已保存",
    dirty: "尚未保存",
    saving: "保存中",
    saved: "刚刚保存",
    failed: "保存失败",
  })[state];
const statusLabel = (status: LocalSkill["status"]) =>
  ({
    ready: "可用",
    changed: "内容已变化，请重新确认",
    invalid: "校验失败",
    missing: "目录已移除",
  })[status];

const countWords = (value: string): number => {
  const cjk =
    value.match(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
    )?.length ?? 0;
  const latin = value
    .replace(
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu,
      " ",
    )
    .trim()
    .split(/\s+/u)
    .filter(Boolean).length;
  return cjk + latin;
};
