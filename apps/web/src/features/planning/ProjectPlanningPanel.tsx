import { RecordTable } from "../../shared/ui/RecordTable";
import { Link, useNavigate } from "react-router-dom";
import { Alert, Button, Modal, Skeleton, Tooltip } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Link2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";

import type {
  CharacterData,
  DocumentSummary,
  WorldEntryData,
} from "../../shared/api/generated/types.gen";
import {
  deleteCharacterRequest,
  deleteWorldEntryRequest,
  getDocumentReferencesRequest,
  listCharactersRequest,
  listWorldEntriesRequest,
  reorderCharactersRequest,
  reorderWorldEntriesRequest,
} from "./planningApi";
import {
  flattenWorldEntries,
  prepareCharacterMove,
  prepareWorldMove,
} from "./planningState";

const characterKey = (projectId: string) =>
  ["projects", projectId, "characters"] as const;
const worldKey = (projectId: string) =>
  ["projects", projectId, "world-entries"] as const;
const referenceKey = (projectId: string, documentId: string) =>
  ["projects", projectId, "documents", documentId, "references"] as const;

export function ProjectPlanningPanel({
  document,
  onClose,
  open,
  projectId,
}: {
  document: DocumentSummary | undefined;
  onClose: () => void;
  open: boolean;
  projectId: string;
}) {
  const { t } = useTranslation("projects");
  const [tab, setTab] = useState<"characters" | "references" | "world">(
    "characters",
  );
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) requestAnimationFrame(() => closeRef.current?.focus());
  }, [open]);

  function handlePanelKeys(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((item) => !item.closest("[hidden]"));
    if (!focusable.length) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && window.document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && window.document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  return (
    <>
      <aside
        aria-hidden={!open}
        aria-label={t("planningPanel")}
        className={`planning-panel ${open ? "planning-panel-open" : ""}`}
        onKeyDown={handlePanelKeys}
        ref={panelRef}
      >
        <header className="planning-panel-header">
          <strong>{t("planningPanel")}</strong>
          <button
            aria-label={t("closePlanningPanel")}
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </header>
        <div
          aria-label={t("planningTabs")}
          className="planning-tabs"
          role="tablist"
        >
          {(["characters", "world", "references"] as const).map((item) => (
            <button
              aria-selected={tab === item}
              key={item}
              onClick={() => setTab(item)}
              role="tab"
              type="button"
            >
              {t(`planningTab.${item}`)}
            </button>
          ))}
        </div>
        <div className="planning-panel-content">
          <div hidden={tab !== "characters"}>
            <CharacterManager projectId={projectId} />
          </div>
          <div hidden={tab !== "world"}>
            <WorldManager projectId={projectId} />
          </div>
          <div hidden={tab !== "references"}>
            <ReferencesManager document={document} projectId={projectId} />
          </div>
        </div>
      </aside>
      {open ? (
        <button
          aria-label={t("closePlanningPanel")}
          className="planning-panel-scrim"
          onClick={onClose}
          type="button"
        />
      ) : null}
    </>
  );
}

function CharacterManager({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation(["common", "projects"]);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => listCharactersRequest(projectId),
    queryKey: characterKey(projectId),
  });
  const [deleting, setDeleting] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: characterKey(projectId) });
  const remove = useMutation({
    mutationFn: (id: string) => deleteCharacterRequest(projectId, id),
    onError: () => setError(t("common:requestFailed")),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (payload: ReturnType<typeof prepareCharacterMove>) =>
      reorderCharactersRequest(projectId, payload),
    onError: () => setError(t("projects:planningChanged")),
    onSuccess: (data) =>
      queryClient.setQueryData(characterKey(projectId), data),
  });
  const items = query.data?.items ?? [];
  return (
    <section className="planning-section">
      <div className="planning-section-actions">
        <Button
          icon={<Plus aria-hidden size={16} />}
          onClick={() => navigate(`/projects/${projectId}/characters/new`)}
          type="primary"
        >
          {t("projects:newCharacter")}
        </Button>
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
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 5 }} title={false} />
      ) : null}
      {query.isError ? (
        <PlanningError onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="planning-empty">{t("projects:noCharacters")}</p>
      ) : (
        <RecordTable
          items={items}
          columns={[
            {
              title: t("studio:title"),
              dataIndex: "name",
              width: 170,
              ellipsis: true,
              render: (value: string, character) => (
                <Link to={`/projects/${projectId}/characters/${character.id}`}>
                  {value}
                </Link>
              ),
            },
            {
              title: t("studio:body"),
              dataIndex: "summary",
              width: 250,
              ellipsis: true,
            },
            {
              title: t("studio:aliases"),
              key: "aliases",
              width: 170,
              ellipsis: true,
              render: (_, character) => character.aliases.join("、"),
            },
            {
              title: t("admin:actions"),
              key: "actions",
              width: 208,
              fixed: "right",
              align: "center",
              render: (_, character, index) => (
                <div className="record-actions">
                  <IconAction
                    disabled={index === 0}
                    label={t("projects:moveUp")}
                    onClick={() =>
                      reorder.mutate(
                        prepareCharacterMove(items, character.id, index - 1),
                      )
                    }
                  >
                    <ArrowUp aria-hidden size={16} />
                  </IconAction>
                  <IconAction
                    disabled={index === items.length - 1}
                    label={t("projects:moveDown")}
                    onClick={() =>
                      reorder.mutate(
                        prepareCharacterMove(items, character.id, index + 1),
                      )
                    }
                  >
                    <ArrowDown aria-hidden size={16} />
                  </IconAction>
                  <IconAction
                    label={t("projects:editCharacter")}
                    onClick={() =>
                      navigate(
                        `/projects/${projectId}/characters/${character.id}/edit`,
                      )
                    }
                  >
                    <Pencil aria-hidden size={16} />
                  </IconAction>
                  <IconAction
                    label={t("projects:deleteCharacter")}
                    onClick={() => setDeleting(character)}
                  >
                    <Trash2 aria-hidden size={16} />
                  </IconAction>
                </div>
              ),
            },
          ]}
        />
      )}

      <DeleteDialog
        busy={remove.isPending}
        description={
          deleting
            ? t("projects:deleteCharacterDescription", { name: deleting.name })
            : ""
        }
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        open={Boolean(deleting)}
        title={t("projects:deleteCharacter")}
      />
    </section>
  );
}

function WorldManager({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { t } = useTranslation(["common", "projects"]);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => listWorldEntriesRequest(projectId),
    queryKey: worldKey(projectId),
  });
  const [deleting, setDeleting] = useState<WorldEntryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: worldKey(projectId) });
  const remove = useMutation({
    mutationFn: (id: string) => deleteWorldEntryRequest(projectId, id),
    onError: () => setError(t("projects:worldEntryNotEmpty")),
    onSuccess: async () => {
      setDeleting(null);
      await refresh();
    },
  });
  const reorder = useMutation({
    mutationFn: (payload: ReturnType<typeof prepareWorldMove>) =>
      reorderWorldEntriesRequest(projectId, payload),
    onError: () => setError(t("projects:planningChanged")),
    onSuccess: (data) => {
      queryClient.setQueryData(worldKey(projectId), data);
    },
  });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const flattened = useMemo(() => flattenWorldEntries(items), [items]);
  return (
    <section className="planning-section">
      <div className="planning-section-actions">
        <Button
          icon={<Plus aria-hidden size={16} />}
          onClick={() => navigate(`/projects/${projectId}/world/new`)}
          type="primary"
        >
          {t("projects:newWorldEntry")}
        </Button>
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
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 5 }} title={false} />
      ) : null}
      {query.isError ? (
        <PlanningError onRetry={() => void query.refetch()} />
      ) : flattened.length === 0 ? (
        <p className="planning-empty">{t("projects:noWorldEntries")}</p>
      ) : (
        <RecordTable
          items={flattened}
          columns={[
            {
              title: t("studio:title"),
              dataIndex: "title",
              width: 190,
              ellipsis: true,
              render: (value: string, entry) => (
                <Link to={`/projects/${projectId}/world/${entry.id}`}>
                  {value}
                </Link>
              ),
            },
            {
              title: t("studio:category"),
              dataIndex: "category",
              width: 130,
              render: (value: string) => t(`projects:worldCategory.${value}`),
            },
            {
              title: t("studio:body"),
              dataIndex: "content",
              width: 250,
              ellipsis: true,
            },
            {
              title: t("studio:parent"),
              key: "parent",
              width: 170,
              ellipsis: true,
              render: (_, entry) =>
                items.find((item) => item.id === entry.parent_id)?.title ??
                t("studio:root"),
            },
            {
              title: t("admin:actions"),
              key: "actions",
              width: 304,
              fixed: "right",
              align: "center",
              render: (_, entry) => {
                const siblings = items
                  .filter((item) => item.parent_id === entry.parent_id)
                  .sort(
                    (a, b) =>
                      a.position - b.position || a.id.localeCompare(b.id),
                  );
                const index = siblings.findIndex(
                  (item) => item.id === entry.id,
                );
                return (
                  <div className="record-actions">
                    <IconAction
                      disabled={index === 0}
                      label={t("projects:moveUp")}
                      onClick={() =>
                        reorder.mutate(
                          prepareWorldMove(
                            items,
                            entry.id,
                            entry.parent_id,
                            index - 1,
                          ),
                        )
                      }
                    >
                      <ArrowUp aria-hidden size={16} />
                    </IconAction>
                    <IconAction
                      disabled={index === siblings.length - 1}
                      label={t("projects:moveDown")}
                      onClick={() =>
                        reorder.mutate(
                          prepareWorldMove(
                            items,
                            entry.id,
                            entry.parent_id,
                            index + 1,
                          ),
                        )
                      }
                    >
                      <ArrowDown aria-hidden size={16} />
                    </IconAction>
                    <IconAction
                      label={t("projects:newChildWorldEntry")}
                      onClick={() =>
                        navigate(
                          `/projects/${projectId}/world/new?parent=${entry.id}`,
                        )
                      }
                    >
                      <Plus aria-hidden size={16} />
                    </IconAction>
                    <IconAction
                      label={t("projects:moveTo")}
                      onClick={() =>
                        navigate(
                          `/projects/${projectId}/world/${entry.id}/move`,
                        )
                      }
                    >
                      <Link2 aria-hidden size={16} />
                    </IconAction>
                    <IconAction
                      label={t("projects:editWorldEntry")}
                      onClick={() =>
                        navigate(
                          `/projects/${projectId}/world/${entry.id}/edit`,
                        )
                      }
                    >
                      <Pencil aria-hidden size={16} />
                    </IconAction>
                    <IconAction
                      label={t("projects:deleteWorldEntry")}
                      onClick={() => setDeleting(entry)}
                    >
                      <Trash2 aria-hidden size={16} />
                    </IconAction>
                  </div>
                );
              },
            },
          ]}
        />
      )}

      <DeleteDialog
        busy={remove.isPending}
        description={
          deleting
            ? t("projects:deleteWorldEntryDescription", {
                title: deleting.title,
              })
            : ""
        }
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        open={Boolean(deleting)}
        title={t("projects:deleteWorldEntry")}
      />
    </section>
  );
}

function ReferencesManager({
  document,
  projectId,
}: {
  document: DocumentSummary | undefined;
  projectId: string;
}) {
  const { t } = useTranslation("projects");
  const characters = useQuery({
    queryFn: () => listCharactersRequest(projectId),
    queryKey: characterKey(projectId),
  });
  const world = useQuery({
    queryFn: () => listWorldEntriesRequest(projectId),
    queryKey: worldKey(projectId),
  });
  const references = useQuery({
    enabled: document?.kind === "manuscript",
    queryFn: () => getDocumentReferencesRequest(projectId, document!.id),
    queryKey: referenceKey(projectId, document?.id ?? "none"),
  });
  if (!document || document.kind !== "manuscript") {
    return <p className="planning-empty">{t("referencesRequireManuscript")}</p>;
  }
  if (characters.isPending || world.isPending || references.isPending) {
    return <Skeleton active paragraph={{ rows: 6 }} title={false} />;
  }
  if (characters.isError || world.isError || references.isError) {
    return (
      <PlanningError
        onRetry={() =>
          void Promise.all([
            characters.refetch(),
            world.refetch(),
            references.refetch(),
          ])
        }
      />
    );
  }
  return (
    <div>
      <ul>
        {characters.data.items
          .filter((item) => references.data.character_ids.includes(item.id))
          .map((item) => (
            <li key={item.id}>
              <Link to={`/projects/${projectId}/characters/${item.id}`}>
                {item.name}
              </Link>
            </li>
          ))}
        {world.data.items
          .filter((item) => references.data.world_entry_ids.includes(item.id))
          .map((item) => (
            <li key={item.id}>
              <Link to={`/projects/${projectId}/world/${item.id}`}>
                {item.title}
              </Link>
            </li>
          ))}
      </ul>
      <Link
        className="studio-link-button"
        to={`/projects/${projectId}/references/${document.id}`}
      >
        {t("studio:details")}
      </Link>
      <Link
        className="studio-link-button"
        to={`/projects/${projectId}/references/${document.id}/edit`}
      >
        {t("studio:edit")}
      </Link>
    </div>
  );
}

function DeleteDialog({
  busy,
  description,
  onCancel,
  onConfirm,
  open,
  title,
}: {
  busy: boolean;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
}) {
  const { t } = useTranslation("common");
  return (
    <Modal footer={null} onCancel={onCancel} open={open} title={title}>
      <p>{description}</p>
      <div className="document-dialog-actions">
        <Button disabled={busy} onClick={onCancel}>
          {t("cancel")}
        </Button>
        <Button danger loading={busy} onClick={onConfirm} type="primary">
          {title}
        </Button>
      </div>
    </Modal>
  );
}

function IconAction({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip title={label} trigger={["hover", "focus"]}>
      <button
        className="record-action"
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function PlanningError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <Alert
      action={<Button onClick={onRetry}>{t("retry")}</Button>}
      showIcon
      title={t("requestFailed")}
      type="error"
    />
  );
}
