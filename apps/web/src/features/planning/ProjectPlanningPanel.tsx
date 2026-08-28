import { Alert, Button, Checkbox, Input, Modal, Skeleton } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Link2,
  Pencil,
  Plus,
  Trash2,
  UserRound,
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
  CharacterCreateRequest,
  CharacterData,
  CharacterUpdateRequest,
  DocumentReferencesData,
  DocumentSummary,
  WorldEntryCreateRequest,
  WorldEntryData,
  WorldEntryUpdateRequest,
} from "../../shared/api/generated/types.gen";
import {
  createCharacterRequest,
  createWorldEntryRequest,
  deleteCharacterRequest,
  deleteWorldEntryRequest,
  getDocumentReferencesRequest,
  listCharactersRequest,
  listWorldEntriesRequest,
  reorderCharactersRequest,
  reorderWorldEntriesRequest,
  updateCharacterRequest,
  updateDocumentReferencesRequest,
  updateWorldEntryRequest,
} from "./planningApi";
import {
  flattenWorldEntries,
  prepareCharacterMove,
  prepareWorldMove,
  worldDescendants,
} from "./planningState";

const characterKey = (projectId: string) =>
  ["projects", projectId, "characters"] as const;
const worldKey = (projectId: string) =>
  ["projects", projectId, "world-entries"] as const;
const referenceKey = (projectId: string, documentId: string) =>
  ["projects", projectId, "documents", documentId, "references"] as const;
type KeyValuePair = [string, string];

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
  const { t } = useTranslation(["common", "projects"]);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => listCharactersRequest(projectId),
    queryKey: characterKey(projectId),
  });
  const [editing, setEditing] = useState<CharacterData | "new" | null>(null);
  const [deleting, setDeleting] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: characterKey(projectId) });
  const create = useMutation({
    mutationFn: (payload: CharacterCreateRequest) =>
      createCharacterRequest(projectId, payload),
    onError: () => setError(t("common:requestFailed")),
    onSuccess: async () => {
      setEditing(null);
      setError(null);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CharacterUpdateRequest;
    }) => updateCharacterRequest(projectId, id, payload),
    onError: () => setError(t("common:requestFailed")),
    onSuccess: async () => {
      setEditing(null);
      setError(null);
      await refresh();
    },
  });
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
          onClick={() => setEditing("new")}
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
        <div className="planning-list">
          {items.map((character, index) => (
            <div className="planning-row" key={character.id}>
              <div className="planning-row-main">
                <UserRound aria-hidden size={17} />
                <div>
                  <strong>{character.name}</strong>
                  <span>{character.summary || t("projects:noSummary")}</span>
                </div>
              </div>
              <div className="planning-row-actions">
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
                  onClick={() => setEditing(character)}
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
            </div>
          ))}
        </div>
      )}
      <CharacterDialog
        busy={create.isPending || update.isPending}
        initial={editing === "new" ? undefined : (editing ?? undefined)}
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        onCancel={() => setEditing(null)}
        onSubmit={(payload) =>
          editing && editing !== "new"
            ? update.mutate({ id: editing.id, payload })
            : create.mutate(payload as CharacterCreateRequest)
        }
        open={Boolean(editing)}
      />
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
  const { t } = useTranslation(["common", "projects"]);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => listWorldEntriesRequest(projectId),
    queryKey: worldKey(projectId),
  });
  const [editing, setEditing] = useState<{
    initial?: WorldEntryData;
    parentId?: string | null;
  } | null>(null);
  const [moving, setMoving] = useState<WorldEntryData | null>(null);
  const [deleting, setDeleting] = useState<WorldEntryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: worldKey(projectId) });
  const create = useMutation({
    mutationFn: (payload: WorldEntryCreateRequest) =>
      createWorldEntryRequest(projectId, payload),
    onError: () => setError(t("common:requestFailed")),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
  const update = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: WorldEntryUpdateRequest;
    }) => updateWorldEntryRequest(projectId, id, payload),
    onError: () => setError(t("common:requestFailed")),
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });
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
      setMoving(null);
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
          onClick={() => setEditing({ parentId: null })}
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
        <div className="planning-list">
          {flattened.map((entry) => {
            const siblings = items
              .filter((item) => item.parent_id === entry.parent_id)
              .sort(
                (a, b) => a.position - b.position || a.id.localeCompare(b.id),
              );
            const index = siblings.findIndex((item) => item.id === entry.id);
            return (
              <div
                className={`planning-row planning-depth-${Math.min(entry.depth, 5)}`}
                key={entry.id}
              >
                <div className="planning-row-main planning-tree-row-main">
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{t(`projects:worldCategory.${entry.category}`)}</span>
                  </div>
                </div>
                <div className="planning-row-actions">
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
                    onClick={() => setEditing({ parentId: entry.id })}
                  >
                    <Plus aria-hidden size={16} />
                  </IconAction>
                  <IconAction
                    label={t("projects:moveTo")}
                    onClick={() => setMoving(entry)}
                  >
                    <Link2 aria-hidden size={16} />
                  </IconAction>
                  <IconAction
                    label={t("projects:editWorldEntry")}
                    onClick={() => setEditing({ initial: entry })}
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
              </div>
            );
          })}
        </div>
      )}
      <WorldEntryDialog
        busy={create.isPending || update.isPending}
        initial={editing?.initial}
        key={editing?.initial?.id ?? `new-${editing?.parentId ?? "root"}`}
        onCancel={() => setEditing(null)}
        onSubmit={(payload) =>
          editing?.initial
            ? update.mutate({ id: editing.initial.id, payload })
            : create.mutate({
                ...payload,
                parent_id: editing?.parentId ?? null,
              } as WorldEntryCreateRequest)
        }
        open={Boolean(editing)}
      />
      <MoveWorldDialog
        busy={reorder.isPending}
        entries={items}
        entry={moving}
        key={moving?.id ?? "closed"}
        onCancel={() => setMoving(null)}
        onSubmit={(parentId) => {
          if (!moving) return;
          const index = items.filter(
            (item) => item.parent_id === parentId && item.id !== moving.id,
          ).length;
          reorder.mutate(prepareWorldMove(items, moving.id, parentId, index));
        }}
      />
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
    <ReferencesEditor
      characters={characters.data.items}
      documentId={document.id}
      initial={references.data}
      key={`${document.id}-${references.data.updated_at}`}
      projectId={projectId}
      worldEntries={world.data.items}
    />
  );
}

function ReferencesEditor({
  characters,
  documentId,
  initial,
  projectId,
  worldEntries,
}: {
  characters: CharacterData[];
  documentId: string;
  initial: DocumentReferencesData;
  projectId: string;
  worldEntries: WorldEntryData[];
}) {
  const { t } = useTranslation("projects");
  const queryClient = useQueryClient();
  const [characterIds, setCharacterIds] = useState(
    new Set(initial.character_ids),
  );
  const [worldIds, setWorldIds] = useState(new Set(initial.world_entry_ids));
  const [search, setSearch] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      updateDocumentReferencesRequest(projectId, documentId, {
        character_ids: [...characterIds],
        world_entry_ids: [...worldIds],
      }),
    onSuccess: (data) =>
      queryClient.setQueryData(referenceKey(projectId, documentId), data),
  });
  const filter = search.trim().toLocaleLowerCase();
  const visibleCharacters = characters.filter((item) =>
    item.name.toLocaleLowerCase().includes(filter),
  );
  const visibleWorld = worldEntries.filter((item) =>
    item.title.toLocaleLowerCase().includes(filter),
  );
  return (
    <section className="reference-editor">
      <label htmlFor="reference-search">{t("searchReferences")}</label>
      <Input
        id="reference-search"
        onChange={(event) => setSearch(event.target.value)}
        value={search}
      />
      {mutation.isError ? (
        <Alert showIcon title={t("referenceSaveFailed")} type="error" />
      ) : null}
      <ReferenceGroup
        items={visibleCharacters.map((item) => ({
          id: item.id,
          label: item.name,
        }))}
        onChange={setCharacterIds}
        selected={characterIds}
        title={t("planningTab.characters")}
      />
      <ReferenceGroup
        items={visibleWorld.map((item) => ({ id: item.id, label: item.title }))}
        onChange={setWorldIds}
        selected={worldIds}
        title={t("planningTab.world")}
      />
      <Button
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
        type="primary"
      >
        {t("saveReferences")}
      </Button>
    </section>
  );
}

function ReferenceGroup({
  items,
  onChange,
  selected,
  title,
}: {
  items: Array<{ id: string; label: string }>;
  onChange: (value: Set<string>) => void;
  selected: Set<string>;
  title: string;
}) {
  return (
    <fieldset className="reference-group">
      <legend>{title}</legend>
      {items.length ? (
        items.map((item) => (
          <Checkbox
            checked={selected.has(item.id)}
            key={item.id}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.target.checked) next.add(item.id);
              else next.delete(item.id);
              onChange(next);
            }}
          >
            {item.label}
          </Checkbox>
        ))
      ) : (
        <span className="reference-empty">-</span>
      )}
    </fieldset>
  );
}

function CharacterDialog({
  busy,
  initial,
  onCancel,
  onSubmit,
  open,
}: {
  busy: boolean;
  initial?: CharacterData;
  onCancel: () => void;
  onSubmit: (payload: CharacterCreateRequest | CharacterUpdateRequest) => void;
  open: boolean;
}) {
  const { t } = useTranslation("projects");
  const [name, setName] = useState(initial?.name ?? "");
  const [aliases, setAliases] = useState(initial?.aliases.join("，") ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [profile, setProfile] = useState<KeyValuePair[]>(
    Object.entries(initial?.profile ?? {}),
  );
  return (
    <Modal
      footer={null}
      onCancel={onCancel}
      open={open}
      title={t(initial ? "editCharacter" : "newCharacter")}
    >
      <form
        className="planning-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            aliases: aliases
              .split(/[，,]/)
              .map((item) => item.trim())
              .filter(Boolean),
            name: name.trim(),
            profile: Object.fromEntries(
              profile
                .filter(([key]) => key.trim())
                .map(([key, value]) => [key.trim(), value]),
            ),
            summary,
          });
        }}
      >
        <label>
          {t("characterName")}
          <Input
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </label>
        <label>
          {t("characterAliases")}
          <Input
            onChange={(event) => setAliases(event.target.value)}
            value={aliases}
          />
        </label>
        <label>
          {t("characterSummary")}
          <Input.TextArea
            maxLength={5000}
            onChange={(event) => setSummary(event.target.value)}
            rows={4}
            value={summary}
          />
        </label>
        <KeyValueEditor
          label={t("characterProfile")}
          onChange={setProfile}
          values={profile}
        />
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </Modal>
  );
}

function WorldEntryDialog({
  busy,
  initial,
  onCancel,
  onSubmit,
  open,
}: {
  busy: boolean;
  initial?: WorldEntryData;
  onCancel: () => void;
  onSubmit: (
    payload: WorldEntryCreateRequest | WorldEntryUpdateRequest,
  ) => void;
  open: boolean;
}) {
  const { t } = useTranslation("projects");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [category, setCategory] = useState<WorldEntryData["category"]>(
    initial?.category ?? "other",
  );
  const [content, setContent] = useState(initial?.content ?? "");
  const [attributes, setAttributes] = useState<KeyValuePair[]>(
    Object.entries(initial?.attributes ?? {}),
  );
  return (
    <Modal
      footer={null}
      onCancel={onCancel}
      open={open}
      title={t(initial ? "editWorldEntry" : "newWorldEntry")}
    >
      <form
        className="planning-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({
            attributes: Object.fromEntries(
              attributes
                .filter(([key]) => key.trim())
                .map(([key, value]) => [key.trim(), value]),
            ),
            category,
            content,
            title: title.trim(),
          });
        }}
      >
        <label>
          {t("worldEntryTitle")}
          <Input
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        <label>
          {t("worldEntryCategory")}
          <select
            onChange={(event) =>
              setCategory(event.target.value as WorldEntryData["category"])
            }
            value={category}
          >
            {(
              ["location", "faction", "item", "rule", "event", "other"] as const
            ).map((value) => (
              <option key={value} value={value}>
                {t(`worldCategory.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("worldEntryContent")}
          <Input.TextArea
            maxLength={50000}
            onChange={(event) => setContent(event.target.value)}
            rows={6}
            value={content}
          />
        </label>
        <KeyValueEditor
          label={t("worldEntryAttributes")}
          onChange={setAttributes}
          values={attributes}
        />
        <FormActions busy={busy} onCancel={onCancel} />
      </form>
    </Modal>
  );
}

function KeyValueEditor({
  label,
  onChange,
  values,
}: {
  label: string;
  onChange: (values: KeyValuePair[]) => void;
  values: KeyValuePair[];
}) {
  const { t } = useTranslation("projects");
  return (
    <fieldset className="key-value-editor">
      <legend>{label}</legend>
      {values.map(([key, value], index) => (
        <div className="key-value-row" key={index}>
          <Input
            aria-label={t("attributeKey")}
            onChange={(event) =>
              onChange(
                values.map((item, itemIndex): KeyValuePair =>
                  itemIndex === index ? [event.target.value, item[1]] : item,
                ),
              )
            }
            value={key}
          />
          <Input
            aria-label={t("attributeValue")}
            onChange={(event) =>
              onChange(
                values.map((item, itemIndex): KeyValuePair =>
                  itemIndex === index ? [item[0], event.target.value] : item,
                ),
              )
            }
            value={value}
          />
          <button
            aria-label={t("removeAttribute")}
            onClick={() =>
              onChange(values.filter((_, itemIndex) => itemIndex !== index))
            }
            type="button"
          >
            <X aria-hidden size={16} />
          </button>
        </div>
      ))}
      <Button onClick={() => onChange([...values, ["", ""]])}>
        {t("addAttribute")}
      </Button>
    </fieldset>
  );
}

function MoveWorldDialog({
  busy,
  entries,
  entry,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  entries: WorldEntryData[];
  entry: WorldEntryData | null;
  onCancel: () => void;
  onSubmit: (parentId: string | null) => void;
}) {
  const { t } = useTranslation("projects");
  const [parentId, setParentId] = useState(entry?.parent_id ?? "");
  const excluded = entry
    ? worldDescendants(entries, entry.id)
    : new Set<string>();
  const choices = entries.filter(
    (item) => item.id !== entry?.id && !excluded.has(item.id),
  );
  return (
    <Modal
      footer={null}
      onCancel={onCancel}
      open={Boolean(entry)}
      title={t("moveTo")}
    >
      <form
        className="planning-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(parentId || null);
        }}
      >
        <label>
          {t("destination")}
          <select
            onChange={(event) => setParentId(event.target.value)}
            value={parentId}
          >
            <option value="">{t("rootLevel")}</option>
            {choices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <FormActions busy={busy} onCancel={onCancel} submitLabel={t("move")} />
      </form>
    </Modal>
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

function FormActions({
  busy,
  onCancel,
  submitLabel,
}: {
  busy: boolean;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const { t } = useTranslation("common");
  return (
    <div className="document-dialog-actions">
      <Button disabled={busy} onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button htmlType="submit" loading={busy} type="primary">
        {submitLabel ?? t("save")}
      </Button>
    </div>
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
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
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
