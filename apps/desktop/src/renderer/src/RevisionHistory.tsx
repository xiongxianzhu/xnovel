import { useCallback, useEffect, useRef, useState } from "react";
import { compareText } from "@xnovel/text-diff";
import type {
  DesktopContent,
  DesktopRevisionDetail,
  DesktopRevisionPage,
} from "../../shared/contracts";
import { useDialogKeyboard } from "./useDialogKeyboard";
import "./history.css";

export function RevisionHistory({
  current,
  onClose,
  onRestored,
}: {
  current: DesktopContent;
  onClose: () => void;
  onRestored: (content: DesktopContent) => void;
}) {
  const [page, setPage] = useState<DesktopRevisionPage>();
  const [selected, setSelected] = useState<DesktopRevisionDetail>();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const close = useCallback(() => {
    if (!busy) onClose();
  }, [busy, onClose]);
  useDialogKeyboard(dialog, close);
  useEffect(() => {
    let active = true;
    const previous = document.activeElement as HTMLElement | null;
    void window.xnovelDesktop.projects
      .revisions(current.documentId, 1)
      .then((value) => {
        if (active) setPage(value);
      })
      .catch(() => {
        if (active) setError("历史加载失败，请重试。");
      });
    requestAnimationFrame(() =>
      dialog.current?.querySelector<HTMLInputElement>("input")?.focus(),
    );
    return () => {
      active = false;
      previous?.focus();
    };
  }, [current.documentId]);
  async function load(next: number) {
    setBusy(true);
    setError("");
    try {
      setPage(
        await window.xnovelDesktop.projects.revisions(current.documentId, next),
      );
    } catch {
      setError("历史加载失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  async function checkpoint() {
    setBusy(true);
    setError("");
    try {
      await window.xnovelDesktop.projects.checkpoint(
        current.documentId,
        name,
        current.version,
      );
      setName("");
      setPage(
        await window.xnovelDesktop.projects.revisions(current.documentId, 1),
      );
    } catch {
      setError("检查点创建失败。若正文版本已改变，请关闭历史后重新打开文档。");
    } finally {
      setBusy(false);
    }
  }
  async function choose(id: string) {
    setBusy(true);
    setError("");
    try {
      setSelected(
        await window.xnovelDesktop.projects.revision(current.documentId, id),
      );
      setConfirm(false);
    } catch {
      setError("该历史版本已不可用，请刷新列表。");
    } finally {
      setBusy(false);
    }
  }
  async function restore() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.xnovelDesktop.projects.restoreRevision(
        current.documentId,
        selected.id,
        current.version,
      );
      onRestored(result);
      onClose();
    } catch {
      setError(
        "恢复失败或正文版本已变化。当前正文与历史均已保留，请重新核对。",
      );
    } finally {
      setBusy(false);
    }
  }
  const comparison = selected
    ? compareText(selected.content, current.content)
    : null;
  return (
    <div className="dialog-scrim" role="presentation">
      <section
        ref={dialog}
        className="unsaved-dialog desktop-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
      >
        <header>
          <h2 id="history-title">版本历史</h2>
          <button disabled={busy} onClick={onClose}>
            关闭
          </button>
        </header>
        <p>自动历史保留90天；命名检查点不自动清理。恢复前会保留当前正文。</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void checkpoint();
          }}
        >
          <label>
            检查点名称
            <input
              required
              maxLength={100}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <button disabled={busy || !name.trim()}>创建检查点</button>
        </form>
        {error ? (
          <p className="dialog-error" role="alert">
            {error}
            <button disabled={busy} onClick={() => void load(page?.page ?? 1)}>
              重试
            </button>
          </p>
        ) : null}
        <ul>
          {page?.items.map((item) => (
            <li key={item.id}>
              <span>
                {item.checkpointName || "自动快照"} · v{item.version} ·{" "}
                {new Date(item.createdAt).toLocaleString()}
              </span>
              <button
                disabled={busy || confirm}
                onClick={() => void choose(item.id)}
              >
                比较
              </button>
            </li>
          ))}
        </ul>
        {page?.total === 0 ? <p>还没有历史版本，可以先创建检查点。</p> : null}
        <nav aria-label="历史分页">
          <button
            disabled={busy || !page || page.page <= 1}
            onClick={() => void load(page!.page - 1)}
          >
            上一页
          </button>
          <span>
            {page?.page ?? 1} /{" "}
            {Math.max(1, Math.ceil((page?.total ?? 0) / 50))}
          </span>
          <button
            disabled={busy || !page || page.page * 50 >= page.total}
            onClick={() => void load(page!.page + 1)}
          >
            下一页
          </button>
        </nav>
        {comparison ? (
          <>
            <div className="desktop-history-comparison">
              <section>
                <h3>历史正文 · v{selected?.version}</h3>
                <pre tabIndex={0}>
                  {comparison.before.map((line, i) => (
                    <span key={i}>
                      {line.kind === "removed" ? (
                        <del>{line.text || " "}</del>
                      ) : (
                        line.text
                      )}
                      {"\n"}
                    </span>
                  ))}
                </pre>
              </section>
              <section>
                <h3>当前正文 · v{current.version}</h3>
                <pre tabIndex={0}>
                  {comparison.after.map((line, i) => (
                    <span key={i}>
                      {line.kind === "added" ? (
                        <ins>{line.text || " "}</ins>
                      ) : (
                        line.text
                      )}
                      {"\n"}
                    </span>
                  ))}
                </pre>
              </section>
            </div>
            {!comparison.precise ? (
              <p>此文档较长，采用完整正文并排比较。</p>
            ) : null}
            {confirm ? (
              <div className="history-confirm">
                <p>
                  将恢复 v{selected?.version}，并为当前稿保留快照。确认恢复？
                </p>
                <button disabled={busy} onClick={() => setConfirm(false)}>
                  取消
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void restore()}
                >
                  确认恢复
                </button>
              </div>
            ) : (
              <button
                className="danger"
                disabled={busy}
                onClick={() => setConfirm(true)}
              >
                恢复这个版本
              </button>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
}
