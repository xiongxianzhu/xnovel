import {
  BookOpenText,
  Bot,
  Check,
  ChevronLeft,
  FileText,
  HardDrive,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { themeValues, type ColorScheme } from "@xnovel/theme";
import { useCallback, useEffect, useState } from "react";

import type {
  AiCandidate,
  DesktopContent,
  DesktopDocument,
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

export function App() {
  const [projects, setProjects] = useState<DesktopProject[]>([]);
  const [project, setProject] = useState<DesktopProject>();
  const [documentItem, setDocumentItem] = useState<DesktopDocument>();
  const [content, setContent] = useState<DesktopContent>();
  const [draft, setDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("clean");
  const [view, setView] = useState<View>("writing");
  const [menuOpen, setMenuOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [preferences, setPreferences] = useState<DesktopPreferences>({
    themePalette: "manuscript-brown",
    themeMode: "system",
  });
  const [skills, setSkills] = useState<LocalSkill[]>([]);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [error, setError] = useState<string>();

  const refreshProjects = useCallback(async () => {
    const items = await window.xnovelDesktop.projects.list();
    setProjects(items);
    if (!project && items[0]) await openProject(items[0]);
  }, [project]);

  async function openProject(next: DesktopProject) {
    const documents = await window.xnovelDesktop.projects.documents(next.id);
    const first = documents.find((item) => item.kind !== "folder");
    setProject(next);
    setDocumentItem(first);
    setMenuOpen(false);
    setView("writing");
    if (first) {
      const nextContent = await window.xnovelDesktop.projects.content(first.id);
      setContent(nextContent);
      setDraft(nextContent.content);
      setSaveState("clean");
    }
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
        if (items[0]) await openProject(items[0]);
      })
      .catch(() => setError("本地工作区初始化失败，请重新启动应用。"));
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

  const saveDraft = useCallback(async () => {
    if (!documentItem || !content || draft === content.content) return;
    setSaveState("saving");
    try {
      const saved = await window.xnovelDesktop.projects.save(
        documentItem.id,
        draft,
        content.version,
      );
      setContent(saved);
      setSaveState("saved");
      await refreshProjects();
    } catch {
      setSaveState("failed");
    }
  }, [content, documentItem, draft, refreshProjects]);

  useEffect(() => {
    if (saveState !== "dirty") return;
    const timer = setTimeout(() => void saveDraft(), 900);
    return () => clearTimeout(timer);
  }, [saveDraft, saveState]);

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

  async function createProject() {
    const title = prompt("作品名称");
    if (!title?.trim()) return;
    const created = await window.xnovelDesktop.projects.create(title);
    await refreshProjects();
    await openProject(created.project);
  }

  return (
    <div className="desktop-app">
      <header className="desktop-topbar">
        <button
          className="icon-button mobile-only"
          aria-label="打开作品列表"
          onClick={() => setMenuOpen(true)}
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
            className={view === "skills" ? "active" : ""}
            onClick={() => setView("skills")}
          >
            <ShieldCheck aria-hidden size={16} />
            Skills
          </button>
          <button
            className={view === "settings" ? "active" : ""}
            onClick={() => setView("settings")}
          >
            <Settings aria-hidden size={16} />
            设置
          </button>
        </div>
      </header>
      <div className="desktop-body">
        <aside className={`project-sidebar ${menuOpen ? "open" : ""}`}>
          <div className="sidebar-heading">
            <strong>作品</strong>
            <button
              className="icon-button mobile-only"
              aria-label="关闭作品列表"
              onClick={() => setMenuOpen(false)}
            >
              <X />
            </button>
          </div>
          <button className="primary full" onClick={() => void createProject()}>
            <Plus aria-hidden size={17} />
            新建作品
          </button>
          <nav aria-label="本地作品">
            {projects.map((item) => (
              <button
                className={`project-link ${item.id === project?.id ? "selected" : ""}`}
                key={item.id}
                onClick={() => void openProject(item)}
              >
                <BookOpenText aria-hidden size={17} />
                <span>{item.title}</span>
              </button>
            ))}
          </nav>
          {projects.length === 0 ? (
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
            onClick={() => setMenuOpen(false)}
          />
        ) : null}
        <main className="desktop-main">
          {error ? <div className="error-banner">{error}</div> : null}
          {view === "writing" ? (
            <WritingView
              project={project}
              documentItem={documentItem}
              content={content}
              draft={draft}
              saveState={saveState}
              onDraft={(value) => {
                setDraft(value);
                setSaveState(value === content?.content ? "clean" : "dirty");
              }}
              onSave={() => void saveDraft()}
              onAi={() => setAiOpen(true)}
              onCreate={() => void createProject()}
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
              setDraft(next.content);
              setSaveState("clean");
            }
          }}
        />
      </div>
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
}) {
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
          <button className="back-label" aria-label="当前作品">
            <ChevronLeft aria-hidden size={16} />
            本地作品
          </button>
          <h1>{project.title}</h1>
        </div>
        <div className="writing-actions">
          <span className={`save-state ${saveState}`}>
            {saveLabel(saveState)}
          </span>
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
      <article className="editor-surface">
        <div className="document-heading">
          <FileText aria-hidden size={18} />
          <div>
            <strong>{documentItem?.title ?? "正文"}</strong>
            <small>
              {content?.wordCount ?? 0} 字 · 版本 {content?.version ?? 1}
            </small>
          </div>
        </div>
        <textarea
          aria-label="正文编辑器"
          placeholder="从这里开始写作……"
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
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
    if (
      decision === "apply" &&
      !confirm("将候选替换到当前正文？版本变化时操作会被拒绝。")
    )
      return;
    await window.xnovelDesktop.ai.decide({
      resultId: candidate.resultId,
      decision,
      documentId: documentItem.id,
      version: decision === "apply" ? content.version : undefined,
    });
    setCandidate(undefined);
    if (decision === "apply") await onApplied();
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
              disabled={working || !instruction.trim()}
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
              <button className="primary" onClick={() => void decide("apply")}>
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
