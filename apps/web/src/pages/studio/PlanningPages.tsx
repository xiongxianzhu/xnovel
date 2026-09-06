import { useAuth } from "../../features/auth/useAuth";
import {
  clearFormDraft,
  parseFormDraft,
  readFormDraft,
} from "../../features/studio/formDrafts";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Modal, Pagination } from "antd";
import { useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as sdk from "../../shared/api/generated/sdk.gen";
import type {
  CharacterData,
  DocumentSummary,
  WorldEntryData,
  WorldEntryCreateRequest,
} from "../../shared/api/generated/types.gen";
import { apiClient } from "../../shared/api/client";
import {
  DraftNotice,
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";
import { useFormProtection } from "../../features/studio/useFormProtection";
import { prepareDocumentMove } from "../../features/documents/documentTree";
import {
  prepareWorldMove,
  worldDescendants,
} from "../../features/planning/planningState";

type Resource = "characters" | "world" | "documents";
type PlanningRecord = CharacterData | WorldEntryData | DocumentSummary;
const apis = {
  characters: {
    list: sdk.searchProjectCharacters,
    get: sdk.getProjectCharacter,
    remove: sdk.deleteProjectCharacter,
  },
  world: {
    list: sdk.searchProjectWorldEntries,
    get: sdk.getProjectWorldEntry,
    remove: sdk.deleteProjectWorldEntry,
  },
  documents: {
    list: sdk.searchProjectDocuments,
    get: sdk.getProjectDocument,
    remove: sdk.deleteProjectDocument,
  },
};
function resourceFromPath(path: string): Resource {
  return path.includes("/characters")
    ? "characters"
    : path.includes("/world")
      ? "world"
      : "documents";
}
function paths(projectId: string, recordId = "") {
  return {
    project_id: projectId,
    character_id: recordId,
    entry_id: recordId,
    document_id: recordId,
  };
}
function nameOf(record: PlanningRecord) {
  return "name" in record ? record.name : record.title;
}

export function PlanningListPage() {
  const { projectId = "" } = useParams();
  const resource = resourceFromPath(useLocation().pathname);
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = useQuery({
    queryKey: ["planning-list", projectId, resource, page, debouncedQ],
    queryFn: async () =>
      (
        await apis[resource].list({
          client: apiClient,
          path: paths(projectId),
          query: { q: debouncedQ, page, page_size: 50 },
        })
      ).data.data,
  });
  const base = `/projects/${projectId}/${resource}`;
  return (
    <StudioFrame
      title={t(resource)}
      back={`/projects/${projectId}/studio`}
      actions={
        <Link className="studio-link-button" to={`${base}/new`}>
          {t("create")}
        </Link>
      }
    >
      <div className="studio-filter">
        <label>
          {t("keyword")}
          <input
            value={q}
            onChange={(event) =>
              setParams({ q: event.target.value, page: "1" }, { replace: true })
            }
          />
        </label>
      </div>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <ul className="studio-list">
            {query.data.items.map((record) => (
              <li key={record.id}>
                <div>
                  <h2>
                    <Link to={`${base}/${record.id}`}>{nameOf(record)}</Link>
                  </h2>
                </div>
                <Link
                  className="studio-link-button"
                  to={`${base}/${record.id}/edit`}
                >
                  {t("edit")}
                </Link>
              </li>
            ))}
          </ul>
          {!query.data.items.length ? <p>{t("empty")}</p> : null}
          <div className="studio-pagination">
            <Pagination
              current={page}
              pageSize={50}
              total={query.data.total}
              showSizeChanger={false}
              showQuickJumper
              onChange={(value) => setParams({ q, page: String(value) })}
            />
          </div>
        </>
      )}
    </StudioFrame>
  );
}

export function PlanningRecordPage() {
  const { projectId = "", recordId = "new" } = useParams();
  const location = useLocation();
  const resource = resourceFromPath(location.pathname);
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const creating = recordId === "new";
  const editing = creating || location.pathname.endsWith("/edit");
  const query = useQuery({
    queryKey: ["planning-record", projectId, resource, recordId],
    enabled: !creating,
    queryFn: async () =>
      (
        await apis[resource].get({
          client: apiClient,
          path: paths(projectId, recordId),
        })
      ).data.data,
  });
  const base = `/projects/${projectId}/${resource}`;
  const remove = useMutation({
    mutationFn: () =>
      apis[resource].remove({
        client: apiClient,
        path: paths(projectId, recordId),
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["planning-list", projectId],
      });
      await client.invalidateQueries({ queryKey: ["projects", projectId] });
      navigate(base);
    },
  });
  return (
    <StudioFrame
      title={
        editing
          ? `${t(creating ? "create" : "edit")} · ${t(resource)}`
          : query.data
            ? nameOf(query.data)
            : t(resource)
      }
      back={base}
      actions={
        !editing ? (
          <>
            <Link
              className="studio-link-button"
              to={`${base}/${recordId}/edit`}
            >
              {t("edit")}
            </Link>
            <Button danger onClick={() => setConfirm(true)}>
              {t("delete")}
            </Button>
          </>
        ) : undefined
      }
    >
      {!creating && query.isPending ? (
        <StudioLoading />
      ) : !creating && query.isError ? (
        <StudioError />
      ) : editing ? (
        <PlanningForm
          key={`${resource}:${recordId}`}
          resource={resource}
          projectId={projectId}
          record={query.data}
        />
      ) : query.data ? (
        <>
          <div className="studio-record-body">
            {"summary" in query.data
              ? query.data.summary
              : "content" in query.data
                ? query.data.content
                : t(query.data.kind)}
          </div>
          {"kind" in query.data ? (
            <dl className="studio-meta">
              <div>
                <dt>{t("kind")}</dt>
                <dd>{t(query.data.kind)}</dd>
              </div>
              <div>
                <dt>{t("status")}</dt>
                <dd>{t(query.data.status)}</dd>
              </div>
              <div>
                <dt>{t("createdAt")}</dt>
                <dd>{new Date(query.data.created_at).toLocaleString()}</dd>
              </div>
            </dl>
          ) : null}
          {"aliases" in query.data && query.data.aliases.length ? (
            <p>
              {t("aliases")}: {query.data.aliases.join("、")}
            </p>
          ) : null}
          {"profile" in query.data || "attributes" in query.data ? (
            <dl className="studio-meta">
              {Object.entries(
                "profile" in query.data
                  ? (query.data.profile ?? {})
                  : (query.data.attributes ?? {}),
              ).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {resource !== "documents" ? (
            <SettingImpact
              projectId={projectId}
              recordId={recordId}
              kind={resource === "characters" ? "character" : "world"}
            />
          ) : (
            <div className="studio-actions">
              <Link
                className="studio-link-button"
                to={`/projects/${projectId}?document=${recordId}`}
              >
                {t("writing")}
              </Link>
              {"kind" in query.data && query.data.kind !== "folder" ? (
                <Link
                  className="studio-link-button"
                  to={`${base}/${recordId}/revisions`}
                >
                  {t("history")}
                </Link>
              ) : null}
              {"kind" in query.data && query.data.kind === "manuscript" ? (
                <Link
                  className="studio-link-button"
                  to={`/projects/${projectId}/references/${recordId}`}
                >
                  {t("references")}
                </Link>
              ) : null}
              <Link
                className="studio-link-button"
                to={`${base}/${recordId}/move`}
              >
                {t("projects:move")}
              </Link>
            </div>
          )}
        </>
      ) : null}
      {remove.isError ? <StudioError /> : null}
      <Modal
        open={confirm}
        title={t("delete")}
        okText={t("delete")}
        cancelText={t("cancel")}
        confirmLoading={remove.isPending}
        okButtonProps={{ danger: true }}
        onOk={() => remove.mutate()}
        onCancel={() => setConfirm(false)}
      >
        {t("deleteConfirm")}
      </Modal>
    </StudioFrame>
  );
}

function PlanningForm({
  resource,
  projectId,
  record,
}: {
  resource: Resource;
  projectId: string;
  record?: PlanningRecord;
}) {
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const { user } = useAuth();
  const draftKey = `xnovel:planning-draft:${user?.id}:${projectId}:${resource}:${record?.id ?? "new"}`;
  const [storedDraft, setStoredDraft] = useState(() => readFormDraft(draftKey));
  const client = useQueryClient();
  const [params] = useSearchParams();
  const [title, setTitle] = useState(record ? nameOf(record) : "");
  const [body, setBody] = useState(
    record && "summary" in record
      ? record.summary
      : record && "content" in record
        ? record.content
        : "",
  );
  const [aliases, setAliases] = useState(
    record && "aliases" in record ? record.aliases.join("\n") : "",
  );
  const [category, setCategory] = useState<WorldEntryCreateRequest["category"]>(
    record && "category" in record ? record.category : "other",
  );
  const [kind, setKind] = useState<"folder" | "manuscript" | "outline">(
    params.get("kind") === "folder"
      ? "folder"
      : params.get("kind") === "outline"
        ? "outline"
        : "manuscript",
  );
  const [parent, setParent] = useState(params.get("parent") ?? "");
  const [fields, setFields] = useState<[string, string][]>(
    Object.entries(
      record && "profile" in record
        ? (record.profile ?? {})
        : record && "attributes" in record
          ? (record.attributes ?? {})
          : {},
    ),
  );
  const initial = useRef(
    JSON.stringify({ title, body, aliases, category, fields, parent, kind }),
  );
  const values = { title, body, aliases, category, fields, parent, kind };
  const docs = useQuery({
    queryKey: ["planning-documents", projectId],
    enabled: resource === "documents" && !record,
    queryFn: async () =>
      (
        await sdk.listProjectDocuments({
          client: apiClient,
          path: paths(projectId),
        })
      ).data.data,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const path = paths(projectId, record?.id);
      const map = Object.fromEntries(
        fields
          .filter(([key]) => key.trim())
          .map(([key, value]) => [key.trim(), value]),
      );
      if (resource === "characters") {
        const payload = {
          name: title.trim(),
          summary: body,
          aliases: aliases
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          profile: map,
        };
        return (
          record
            ? await sdk.updateProjectCharacter({
                client: apiClient,
                path,
                body: payload,
              })
            : await sdk.createProjectCharacter({
                client: apiClient,
                path,
                body: payload,
              })
        ).data.data;
      }
      if (resource === "world") {
        const payload = {
          title: title.trim(),
          content: body,
          category,
          attributes: map,
        };
        return (
          record
            ? await sdk.updateProjectWorldEntry({
                client: apiClient,
                path,
                body: payload,
              })
            : await sdk.createProjectWorldEntry({
                client: apiClient,
                path,
                body: { ...payload, parent_id: parent || null },
              })
        ).data.data;
      }
      return (
        record
          ? await sdk.updateProjectDocument({
              client: apiClient,
              path,
              body: { title: title.trim() },
            })
          : await sdk.createProjectDocument({
              client: apiClient,
              path,
              body: { title: title.trim(), kind, parent_id: parent || null },
            })
      ).data.data;
    },
  });
  async function save() {
    try {
      const data = await mutation.mutateAsync();
      initial.current = JSON.stringify(values);
      clearFormDraft(draftKey);
      await client.invalidateQueries({
        queryKey: ["planning-list", projectId],
      });
      await client.invalidateQueries({
        queryKey: ["planning-record", projectId],
      });
      await client.invalidateQueries({ queryKey: ["projects", projectId] });
      return data;
    } catch {
      return null;
    }
  }
  useFormProtection(
    () => JSON.stringify(values) !== initial.current,
    async () => Boolean(await save()),
    () => sessionStorage.setItem(draftKey, JSON.stringify(values)),
  );
  return (
    <form
      className="studio-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save().then((data) => {
          if (data) navigate(`/projects/${projectId}/${resource}/${data.id}`);
        });
      }}
    >
      <fieldset className="studio-form-fields" disabled={mutation.isPending}>
        {storedDraft ? (
          <DraftNotice
            onDiscard={() => {
              clearFormDraft(draftKey);
              setStoredDraft(null);
            }}
            onRestore={() => {
              const data = parseFormDraft(storedDraft);
              if (data) {
                if (typeof data.title === "string") setTitle(data.title);
                if (typeof data.body === "string") setBody(data.body);
                if (typeof data.aliases === "string") setAliases(data.aliases);
                if (typeof data.parent === "string") setParent(data.parent);
                if (
                  ["folder", "manuscript", "outline"].includes(
                    String(data.kind),
                  )
                )
                  setKind(data.kind as typeof kind);
                if (
                  [
                    "location",
                    "faction",
                    "item",
                    "rule",
                    "event",
                    "other",
                  ].includes(String(data.category))
                )
                  setCategory(data.category as typeof category);
                if (
                  Array.isArray(data.fields) &&
                  data.fields.every(
                    (pair) =>
                      Array.isArray(pair) &&
                      pair.length === 2 &&
                      pair.every((value) => typeof value === "string"),
                  )
                )
                  setFields(data.fields as [string, string][]);
              }
              setStoredDraft(null);
            }}
          />
        ) : null}
        <label className="studio-field">
          {t("title")}
          <input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        {resource !== "documents" ? (
          <label className="studio-field">
            {t("body")}
            <textarea
              className="studio-body"
              maxLength={resource === "characters" ? 5000 : 50000}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
        ) : !record ? (
          <>
            <label className="studio-field">
              {t("kind")}
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as typeof kind)}
              >
                {["manuscript", "outline", "folder"].map((value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="studio-field">
              {t("parent")}
              <select
                value={parent}
                onChange={(event) => setParent(event.target.value)}
              >
                <option value="">{t("root")}</option>
                {docs.data?.items
                  .filter((doc) => doc.kind === "folder")
                  .map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : null}
        {resource === "characters" ? (
          <label className="studio-field">
            {t("aliases")}
            <textarea
              value={aliases}
              onChange={(event) => setAliases(event.target.value)}
            />
          </label>
        ) : resource === "world" ? (
          <label className="studio-field">
            {t("category")}
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as typeof category)
              }
            >
              {["location", "faction", "item", "rule", "event", "other"].map(
                (value) => (
                  <option key={value} value={value}>
                    {t(value)}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}
        {resource !== "documents" ? (
          <section>
            <h2>{t("profile")}</h2>
            {fields.map(([key, value], index) => (
              <div className="studio-key-value studio-field" key={index}>
                <input
                  aria-label={`${t("fieldName")} ${index + 1}`}
                  maxLength={100}
                  value={key}
                  onChange={(event) =>
                    setFields((previous) =>
                      previous.map((item, i) =>
                        i === index ? [event.target.value, item[1]] : item,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`${t("fieldValue")} ${index + 1}`}
                  maxLength={2000}
                  value={value}
                  onChange={(event) =>
                    setFields((previous) =>
                      previous.map((item, i) =>
                        i === index ? [item[0], event.target.value] : item,
                      ),
                    )
                  }
                />
                <Button
                  danger
                  onClick={() =>
                    setFields((previous) =>
                      previous.filter((_, i) => i !== index),
                    )
                  }
                >
                  {t("delete")}
                </Button>
              </div>
            ))}
            <Button
              disabled={fields.length >= 50}
              onClick={() => setFields((previous) => [...previous, ["", ""]])}
            >
              {t("addField")}
            </Button>
          </section>
        ) : null}
        {mutation.isError ? <StudioError /> : null}
        <div>
          <Button htmlType="submit" type="primary" loading={mutation.isPending}>
            {t("save")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

export function ReferencesPage() {
  const { projectId = "", documentId = "" } = useParams();
  const { t } = useTranslation("studio");
  const referencePath = useLocation().pathname;
  const editing =
    referencePath.endsWith("/edit") || referencePath.endsWith("/new");
  const navigate = useNavigate();
  const client = useQueryClient();
  const { user } = useAuth();
  const draftKey = `xnovel:references-draft:${user?.id}:${projectId}:${documentId}`;
  const [draft, setDraft] = useState(() => readFormDraft(draftKey));
  const saved = useRef(false);
  const [characterIds, setCharacterIds] = useState<string[] | null>(null);
  const [worldIds, setWorldIds] = useState<string[] | null>(null);
  const query = useQuery({
    queryKey: ["document-references", projectId, documentId],
    queryFn: async () =>
      (
        await sdk.getProjectDocumentReferences({
          client: apiClient,
          path: paths(projectId, documentId),
        })
      ).data.data,
  });
  const characters = useQuery({
    queryKey: ["characters", projectId],
    queryFn: async () =>
      (
        await sdk.listProjectCharacters({
          client: apiClient,
          path: paths(projectId),
        })
      ).data.data,
  });
  const world = useQuery({
    queryKey: ["world", projectId],
    queryFn: async () =>
      (
        await sdk.listProjectWorldEntries({
          client: apiClient,
          path: paths(projectId),
        })
      ).data.data,
  });
  const selectedCharacters = characterIds ?? query.data?.character_ids ?? [];
  const selectedWorld = worldIds ?? query.data?.world_entry_ids ?? [];
  const mutation = useMutation({
    mutationFn: () =>
      sdk.updateProjectDocumentReferences({
        client: apiClient,
        path: paths(projectId, documentId),
        body: {
          character_ids: selectedCharacters,
          world_entry_ids: selectedWorld,
        },
      }),
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["document-references", projectId, documentId],
      });
      saved.current = true;
      clearFormDraft(draftKey);
    },
  });
  useFormProtection(
    () =>
      editing && !saved.current && (characterIds !== null || worldIds !== null),
    async () => {
      try {
        await mutation.mutateAsync();
        return true;
      } catch {
        return false;
      }
    },
    () =>
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          characterIds: selectedCharacters,
          worldIds: selectedWorld,
        }),
      ),
  );
  return (
    <StudioFrame
      title={t("references")}
      back={`/projects/${projectId}/documents/${documentId}`}
      actions={
        !editing ? (
          <Link
            className="studio-link-button"
            to={`/projects/${projectId}/references/${documentId}/edit`}
          >
            {t("edit")}
          </Link>
        ) : undefined
      }
    >
      {editing && draft ? (
        <DraftNotice
          onDiscard={() => {
            clearFormDraft(draftKey);
            setDraft(null);
          }}
          onRestore={() => {
            const data = parseFormDraft(draft);
            if (
              Array.isArray(data?.characterIds) &&
              data.characterIds.every((id) => typeof id === "string")
            )
              setCharacterIds(data.characterIds);
            if (
              Array.isArray(data?.worldIds) &&
              data.worldIds.every((id) => typeof id === "string")
            )
              setWorldIds(data.worldIds);
            saved.current = false;
            setDraft(null);
          }}
        />
      ) : null}
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError || characters.isError || world.isError ? (
        <StudioError />
      ) : (
        <form
          className="studio-form"
          onSubmit={(event) => {
            event.preventDefault();
            void mutation
              .mutateAsync()
              .then(() =>
                navigate(`/projects/${projectId}/references/${documentId}`),
              )
              .catch(() => undefined);
          }}
        >
          <fieldset
            className="studio-form-fields"
            disabled={mutation.isPending}
          >
            <h2>{t("characters")}</h2>
            <div className="studio-source-list">
              {characters.data?.items
                .filter(
                  (item) => editing || selectedCharacters.includes(item.id),
                )
                .map((item) => (
                  <label key={item.id}>
                    {editing ? (
                      <input
                        type="checkbox"
                        checked={selectedCharacters.includes(item.id)}
                        onChange={(event) => {
                          saved.current = false;
                          setCharacterIds(
                            event.target.checked
                              ? [...selectedCharacters, item.id]
                              : selectedCharacters.filter(
                                  (id) => id !== item.id,
                                ),
                          );
                        }}
                      />
                    ) : null}
                    <Link to={`/projects/${projectId}/characters/${item.id}`}>
                      {item.name}
                    </Link>
                  </label>
                ))}
            </div>
            <h2>{t("world")}</h2>
            <div className="studio-source-list">
              {world.data?.items
                .filter((item) => editing || selectedWorld.includes(item.id))
                .map((item) => (
                  <label key={item.id}>
                    {editing ? (
                      <input
                        type="checkbox"
                        checked={selectedWorld.includes(item.id)}
                        onChange={(event) => {
                          saved.current = false;
                          setWorldIds(
                            event.target.checked
                              ? [...selectedWorld, item.id]
                              : selectedWorld.filter((id) => id !== item.id),
                          );
                        }}
                      />
                    ) : null}
                    <Link to={`/projects/${projectId}/world/${item.id}`}>
                      {item.title}
                    </Link>
                  </label>
                ))}
            </div>
            {mutation.isError ? <StudioError /> : null}
            {editing ? (
              <div>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={mutation.isPending}
                >
                  {t("save")}
                </Button>
              </div>
            ) : null}
          </fieldset>
        </form>
      )}
    </StudioFrame>
  );
}

export function DocumentMovePage() {
  const { projectId = "", documentId = "" } = useParams();
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [parent, setParent] = useState("");
  const query = useQuery({
    queryKey: ["move-documents", projectId],
    queryFn: async () =>
      (
        await sdk.listProjectDocuments({
          client: apiClient,
          path: paths(projectId),
        })
      ).data.data,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      const docs = query.data!.items;
      const result = prepareDocumentMove(
        docs,
        documentId,
        parent || null,
        docs.filter(
          (item) =>
            item.parent_id === (parent || null) && item.id !== documentId,
        ).length,
      );
      return sdk.reorderProjectDocuments({
        client: apiClient,
        path: paths(projectId),
        body: result.payload,
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["projects", projectId] });
      navigate(`/projects/${projectId}/documents/${documentId}`);
    },
  });
  return (
    <StudioFrame
      title={t("projects:move")}
      back={`/projects/${projectId}/documents/${documentId}`}
    >
      <form
        className="studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <fieldset className="studio-form-fields" disabled={mutation.isPending}>
          <label className="studio-field">
            {t("parent")}
            <select
              value={parent}
              onChange={(event) => setParent(event.target.value)}
            >
              <option value="">{t("root")}</option>
              {query.data?.items
                .filter(
                  (item) => item.kind === "folder" && item.id !== documentId,
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
          {mutation.isError || query.isError ? <StudioError /> : null}
          <div>
            <Button
              htmlType="submit"
              loading={mutation.isPending}
              disabled={!query.data}
            >
              {t("save")}
            </Button>
          </div>
        </fieldset>
      </form>
    </StudioFrame>
  );
}

export function WorldMovePage() {
  const { projectId = "", recordId = "" } = useParams();
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [parent, setParent] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["world-move", projectId],
    queryFn: async () =>
      (
        await sdk.listProjectWorldEntries({
          client: apiClient,
          path: paths(projectId),
        })
      ).data.data,
  });
  const current = query.data?.items.find((item) => item.id === recordId);
  const selected = parent ?? current?.parent_id ?? "";
  const excluded = worldDescendants(query.data?.items ?? [], recordId);
  const mutation = useMutation({
    mutationFn: () => {
      const items = query.data!.items;
      return sdk.reorderProjectWorldEntries({
        client: apiClient,
        path: paths(projectId),
        body: prepareWorldMove(
          items,
          recordId,
          selected || null,
          items.filter(
            (item) =>
              item.parent_id === (selected || null) && item.id !== recordId,
          ).length,
        ),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["world", projectId] });
      await client.invalidateQueries({
        queryKey: ["planning-list", projectId],
      });
      navigate(`/projects/${projectId}/world/${recordId}`);
    },
  });
  return (
    <StudioFrame
      title={t("projects:move")}
      back={`/projects/${projectId}/world/${recordId}`}
    >
      <form
        className="studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <fieldset className="studio-form-fields" disabled={mutation.isPending}>
          <label className="studio-field">
            {t("parent")}
            <select
              value={selected}
              onChange={(event) => setParent(event.target.value)}
            >
              <option value="">{t("root")}</option>
              {query.data?.items
                .filter(
                  (item) => item.id !== recordId && !excluded.has(item.id),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
            </select>
          </label>
          {mutation.isError || query.isError ? <StudioError /> : null}
          <div>
            <Button
              htmlType="submit"
              disabled={!current}
              loading={mutation.isPending}
            >
              {t("save")}
            </Button>
          </div>
        </fieldset>
      </form>
    </StudioFrame>
  );
}

function SettingImpact({
  projectId,
  recordId,
  kind,
}: {
  projectId: string;
  recordId: string;
  kind: string;
}) {
  const { t } = useTranslation("studio");
  const [previous, setPrevious] = useState("");
  const query = useMutation({
    mutationFn: async () =>
      (
        await sdk.getSettingImpact({
          client: apiClient,
          path: paths(projectId),
          query: { entity_id: recordId, kind, previous_name: previous },
        })
      ).data.data,
  });
  return (
    <section>
      <h2>{t("impact")}</h2>
      <p className="studio-notice">{t("impactNotice")}</p>
      <form
        className="studio-filter"
        onSubmit={(event) => {
          event.preventDefault();
          query.mutate();
        }}
      >
        <fieldset className="studio-form-fields" disabled={query.isPending}>
          <label>
            {t("previousName")}
            <input
              value={previous}
              onChange={(event) => setPrevious(event.target.value)}
            />
          </label>
          <Button htmlType="submit" loading={query.isPending}>
            {t("impact")}
          </Button>
        </fieldset>
      </form>
      {query.isError ? <StudioError /> : null}
      <ul className="studio-list">
        {query.data?.map((item) => (
          <li key={item.document_id}>
            <div>
              <Link to={`/projects/${projectId}?document=${item.document_id}`}>
                {item.title}
              </Link>
              <p className="studio-excerpt">{item.evidence}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
