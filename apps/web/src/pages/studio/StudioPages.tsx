import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import { SelectField } from "../../shared/ui/SelectField";
import {
  clearFormDraft,
  parseFormDraft,
  readFormDraft,
} from "../../features/studio/formDrafts";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { recordField } from "../../features/studio/recordField";
import { Alert, Button, Modal, Pagination } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileText, Eye, Pencil, Plus } from "lucide-react";
import { useAuth } from "../../features/auth/useAuth";
import {
  studioFields,
  studioKinds,
  isStudioKind,
  type StudioKind,
} from "../../features/studio/studioConfig";
import {
  deleteStudioRecord,
  getStudioRecord,
  listStudioRecords,
  saveStudioRecord,
  type StudioFormValues,
  type StudioRecord,
} from "../../features/studio/studioApi";
import {
  SourceLabel,
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";
import { useFormProtection } from "../../features/studio/useFormProtection";
import { apiClient } from "../../shared/api/client";
import {
  checkProjectStyle,
  createStudioNote,
  getProjectDocumentContent,
  listProjectCharacters,
  listProjectDocuments,
  listThreadUpdates,
} from "../../shared/api/generated/sdk.gen";

export function StudioHubPage() {
  const { projectId = "" } = useParams();
  const { t } = useTranslation("studio");
  const base = `/projects/${projectId}`;
  const links = [
    ...studioKinds.map((kind) => ({ key: kind, to: `${base}/studio/${kind}` })),
    ...[
      "recall",
      "search",
      "documents",
      "characters",
      "world",
      "batches",
      "schedule",
      "import",
      "export",
      "ai-history",
    ].map((key) => ({
      key: key === "ai-history" ? "aiHistory" : key,
      to: `${base}/${key}`,
    })),
  ];
  return (
    <StudioFrame title={t("studio")} back={base}>
      <p className="studio-notice">{t("plannedOnly")}</p>
      <nav className="studio-hub">
        {links.map((item) => (
          <Link key={item.key} to={item.to}>
            <FileText size={18} aria-hidden />
            {t(item.key)}
          </Link>
        ))}
      </nav>
    </StudioFrame>
  );
}

export function StudioListPage() {
  const { projectId = "", kind } = useParams();
  return isStudioKind(kind) ? (
    <StudioList projectId={projectId} kind={kind} />
  ) : (
    <StudioError />
  );
}

function StudioList({
  projectId,
  kind,
}: {
  projectId: string;
  kind: StudioKind;
}) {
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const sourceId = params.get("source") ?? "";
  const sources = useQuery({
    queryKey: ["documents", projectId, "active"],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const page = Math.max(1, Number(params.get("page")) || 1);
  const relatedCharacters = useQuery({
    queryKey: ["characters", projectId],
    enabled: studioFields[kind].some((field) => field.type === "character"),
    queryFn: async () =>
      (
        await listProjectCharacters({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const query = useQuery({
    queryKey: ["studio", projectId, kind, page, debouncedQ, sourceId],
    queryFn: () =>
      listStudioRecords(
        kind,
        projectId,
        page,
        debouncedQ,
        sourceId || undefined,
      ),
  });
  const base = `/projects/${projectId}/studio/${kind}`;
  return (
    <StudioFrame
      title={t(kind)}
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
              setParams(
                { q: event.target.value, page: "1", source: sourceId },
                { replace: true },
              )
            }
          />
        </label>
        <label>
          {t("source")}
          <SelectField
            value={sourceId}
            onValueChange={(value) =>
              setParams({ q, page: "1", source: value })
            }
          >
            <option value="">{t("all")}</option>
            {sources.data?.items
              .filter((doc) => doc.kind !== "folder")
              .map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
          </SelectField>
        </label>
      </div>
      {kind === "rules" ? <StyleCheck projectId={projectId} /> : null}
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError retry={() => void query.refetch()} />
      ) : (
        <>
          {!query.data.items.length ? (
            <p>{t("empty")}</p>
          ) : (
            <RecordTable<StudioRecord>
              items={query.data.items}
              columns={[
                {
                  title: t("title"),
                  dataIndex: "title",
                  width: 220,
                  ellipsis: true,
                  render: (value: string, row) => (
                    <Link to={`${base}/${row.id}`}>{value}</Link>
                  ),
                },
                {
                  title: t("body"),
                  dataIndex: "body",
                  width: 300,
                  ellipsis: true,
                },
                {
                  title: t("source"),
                  dataIndex: "source_title",
                  width: 190,
                  ellipsis: true,
                  render: (value: string | null) => value || t("manual"),
                },
                {
                  title: t("sourceVersion"),
                  dataIndex: "source_version",
                  width: 110,
                  render: (value: number | null) => value ?? "—",
                },
                {
                  title: t("sourceState"),
                  key: "sourceState",
                  width: 170,
                  render: (_, row) => (
                    <SourceLabel
                      stale={row.source_stale}
                      missing={row.source_missing}
                      manual={!row.source_document_id}
                    />
                  ),
                },
                ...studioFields[kind].map((field) => ({
                  title: t(field.key),
                  key: field.key,
                  width: field.type === "textarea" ? 260 : 160,
                  ellipsis: true,
                  render: (_: unknown, row: StudioRecord) =>
                    field.options
                      ? t(recordField(row, field.key) || "unknown")
                      : field.type === "document"
                        ? (sources.data?.items.find(
                            (doc) => doc.id === recordField(row, field.key),
                          )?.title ?? "—")
                        : field.type === "character"
                          ? (relatedCharacters.data?.items.find(
                              (character) =>
                                character.id === recordField(row, field.key),
                            )?.name ?? "—")
                          : recordField(row, field.key) || "—",
                })),
                {
                  title: t("admin:actions"),
                  key: "actions",
                  width: 112,
                  fixed: "right",
                  align: "center",
                  render: (_, row) => (
                    <div className="record-actions">
                      <RowAction
                        label={t("details")}
                        icon={Eye}
                        to={`${base}/${row.id}`}
                      />
                      <RowAction
                        label={t("edit")}
                        icon={Pencil}
                        to={`${base}/${row.id}/edit`}
                      />
                    </div>
                  ),
                },
              ]}
            />
          )}
          <div className="studio-pagination">
            <Pagination
              current={page}
              pageSize={50}
              total={query.data.total}
              showSizeChanger={false}
              showQuickJumper
              onChange={(next) =>
                setParams({ q, page: String(next), source: sourceId })
              }
            />
          </div>
        </>
      )}
    </StudioFrame>
  );
}

export function StudioRecordPage() {
  const { projectId = "", kind, recordId } = useParams();
  return isStudioKind(kind) ? (
    <StudioRecordView projectId={projectId} kind={kind} recordId={recordId} />
  ) : (
    <StudioError />
  );
}

function StudioRecordView({
  projectId,
  kind,
  recordId,
}: {
  projectId: string;
  kind: StudioKind;
  recordId?: string;
}) {
  const { t } = useTranslation("studio");
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const creating = !recordId || recordId === "new";
  const editing = creating || location.pathname.endsWith("/edit");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const query = useQuery({
    queryKey: ["studio", projectId, kind, recordId],
    queryFn: () => getStudioRecord(kind, projectId, recordId!),
    enabled: !creating,
  });
  const relatedDocuments = useQuery({
    queryKey: ["documents", projectId, "active"],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const relatedCharacters = useQuery({
    queryKey: ["characters", projectId],
    queryFn: async () =>
      (
        await listProjectCharacters({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const remove = useMutation({
    mutationFn: () => deleteStudioRecord(kind, projectId, recordId!),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["studio", projectId] });
      navigate(`/projects/${projectId}/studio/${kind}`);
    },
  });
  const base = `/projects/${projectId}/studio/${kind}`;
  if (!creating && query.isPending)
    return (
      <StudioFrame title={t(kind)} back={base}>
        <StudioLoading />
      </StudioFrame>
    );
  if (!creating && query.isError)
    return (
      <StudioFrame title={t(kind)} back={base}>
        <StudioError />
      </StudioFrame>
    );
  return (
    <StudioFrame
      title={
        editing
          ? `${t(creating ? "create" : "edit")} · ${t(kind)}`
          : (query.data?.title ?? t(kind))
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
            <Button danger onClick={() => setConfirmDelete(true)}>
              {t("delete")}
            </Button>
          </>
        ) : undefined
      }
    >
      {editing ? (
        <StudioRecordForm
          key={`${kind}:${recordId}:${query.data?.version}`}
          projectId={projectId}
          kind={kind}
          record={query.data}
        />
      ) : query.data ? (
        <>
          <SourceLabel
            stale={query.data.source_stale}
            missing={query.data.source_missing}
            manual={!query.data.source_document_id}
          />
          {query.data.source_document_id ? (
            <p>
              <Link
                to={`/projects/${projectId}?document=${query.data.source_document_id}`}
              >
                {t("openSource")} · {query.data.source_title ?? t("missing")}
              </Link>
            </p>
          ) : null}
          <div className="studio-record-body">{query.data.body}</div>
          <dl className="studio-meta">
            {studioFields[kind].map((field) => (
              <div key={field.key}>
                <dt>{t(field.key)}</dt>
                <dd>
                  {field.options
                    ? t(recordField(query.data!, field.key))
                    : field.type === "document"
                      ? (relatedDocuments.data?.items.find(
                          (doc) =>
                            doc.id === recordField(query.data!, field.key),
                        )?.title ?? "—")
                      : field.type === "character"
                        ? (relatedCharacters.data?.items.find(
                            (character) =>
                              character.id ===
                              recordField(query.data!, field.key),
                          )?.name ?? "—")
                        : recordField(query.data!, field.key) || "—"}
                </dd>
              </div>
            ))}
          </dl>
          {kind === "threads" ? (
            <ThreadHistory projectId={projectId} recordId={recordId!} />
          ) : null}
        </>
      ) : null}
      {remove.isError ? <StudioError /> : null}
      <Modal
        open={confirmDelete}
        title={t("delete")}
        okText={t("delete")}
        cancelText={t("cancel")}
        okButtonProps={{ danger: true }}
        confirmLoading={remove.isPending}
        onOk={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      >
        {t("deleteConfirm")}
      </Modal>
    </StudioFrame>
  );
}

function StudioRecordForm({
  projectId,
  kind,
  record,
}: {
  projectId: string;
  kind: StudioKind;
  record?: StudioRecord;
}) {
  const { t } = useTranslation("studio");
  const { user } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const initial = Object.fromEntries(
    [
      "title",
      "body",
      "source_document_id",
      "source_version",
      ...studioFields[kind].map((field) => field.key),
    ].map((key) => [
      key,
      record
        ? recordField(record, key)
        : (studioFields[kind].find((field) => field.key === key)
            ?.options?.[0] ?? ""),
    ]),
  );
  initial._record_version = String(record?.version ?? 1);
  const [values, setValues] = useState<StudioFormValues>(initial);
  const saved = useRef(JSON.stringify(initial));
  const key = `xnovel:studio-draft:${user?.id}:${projectId}:${kind}:${record?.id ?? "new"}`;
  const [draft, setDraft] = useState<string | null>(() => readFormDraft(key));
  const docs = useQuery({
    queryKey: ["documents", projectId, "active"],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const characters = useQuery({
    queryKey: ["characters", projectId],
    queryFn: async () =>
      (
        await listProjectCharacters({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const source = useQuery({
    queryKey: ["document", projectId, values.source_document_id],
    enabled: Boolean(values.source_document_id),
    queryFn: async () =>
      (
        await getProjectDocumentContent({
          client: apiClient,
          path: {
            project_id: projectId,
            document_id: values.source_document_id,
          },
        })
      ).data.data,
  });
  const mutation = useMutation({
    mutationFn: () =>
      saveStudioRecord(
        kind,
        projectId,
        record?.id,
        values,
        Number(values._record_version ?? record?.version ?? 1),
      ),
  });
  async function save() {
    try {
      const result = await mutation.mutateAsync();
      saved.current = JSON.stringify(values);
      clearFormDraft(key);
      await client.invalidateQueries({ queryKey: ["studio", projectId] });
      return result;
    } catch {
      return null;
    }
  }
  useFormProtection(
    () => JSON.stringify(values) !== saved.current,
    async () => Boolean(await save()),
    () => window.sessionStorage.setItem(key, JSON.stringify(values)),
  );
  const set = (field: string, value: string) =>
    setValues((previous) => ({
      ...previous,
      [field]: value,
      ...(field === "source_document_id" ? { source_version: "" } : {}),
    }));
  return (
    <form
      className="studio-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save().then((result) => {
          if (result)
            navigate(`/projects/${projectId}/studio/${kind}/${result.id}`);
        });
      }}
    >
      <fieldset className="studio-form-fields" disabled={mutation.isPending}>
        {draft ? (
          <Alert
            type="info"
            title={t("draft")}
            action={
              <div className="studio-actions">
                <Button
                  onClick={() => {
                    try {
                      const parsed = parseFormDraft(draft);
                      if (
                        parsed &&
                        typeof parsed === "object" &&
                        Object.values(parsed).every(
                          (value) => typeof value === "string",
                        )
                      )
                        setValues(parsed as StudioFormValues);
                    } finally {
                      setDraft(null);
                    }
                  }}
                >
                  {t("restore")}
                </Button>
                <Button
                  onClick={() => {
                    clearFormDraft(key);
                    setDraft(null);
                  }}
                >
                  {t("delete")}
                </Button>
              </div>
            }
          />
        ) : null}
        {record && Number(values._record_version) !== record.version ? (
          <Alert
            type="warning"
            title={t("recordChanged")}
            description={
              <div>
                <h3>{record.title}</h3>
                <p className="studio-excerpt">{record.body}</p>
                <Button
                  onClick={() => set("_record_version", String(record.version))}
                >
                  {t("recheckRecord")}
                </Button>
              </div>
            }
          />
        ) : null}
        {record?.source_stale ? (
          <Alert type="warning" showIcon title={t("stale")} />
        ) : null}
        <label className="studio-field" htmlFor="studio-title">
          {t("title")}
          <input
            id="studio-title"
            required
            maxLength={200}
            value={values.title}
            onChange={(event) => set("title", event.target.value)}
          />
        </label>
        <label className="studio-field" htmlFor="studio-body">
          {t("body")}
          <textarea
            required={kind === "summaries"}
            id="studio-body"
            className="studio-body"
            maxLength={20000}
            value={values.body}
            onChange={(event) => set("body", event.target.value)}
          />
        </label>
        <label className="studio-field" htmlFor="studio-source">
          {t("source")}
          <SelectField
            required={kind === "summaries"}
            id="studio-source"
            value={values.source_document_id}
            onValueChange={(value) => set("source_document_id", value)}
          >
            <option value="">{t("noSource")}</option>
            {docs.data?.items
              .filter((doc) =>
                kind === "summaries"
                  ? doc.kind === "manuscript"
                  : doc.kind !== "folder",
              )
              .map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
          </SelectField>
        </label>
        {values.source_document_id ? (
          <div className="studio-actions">
            <span>
              {t("sourceVersion")}:{" "}
              {values.source_version || source.data?.version || "—"}
            </span>
            <Button
              disabled={!source.data}
              onClick={() =>
                set("source_version", String(source.data!.version))
              }
            >
              {t("recheck")}
            </Button>
          </div>
        ) : null}
        {studioFields[kind].map((field) => (
          <label
            key={field.key}
            className="studio-field"
            htmlFor={`studio-${field.key}`}
          >
            {t(field.key)}
            {field.options ? (
              <SelectField
                id={`studio-${field.key}`}
                value={values[field.key]}
                onValueChange={(value) => set(field.key, value)}
              >
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {t(option)}
                  </option>
                ))}
              </SelectField>
            ) : field.type === "document" || field.type === "character" ? (
              <SelectField
                id={`studio-${field.key}`}
                value={values[field.key]}
                required={field.required}
                onValueChange={(value) => set(field.key, value)}
              >
                <option value="">—</option>
                {field.type === "document"
                  ? docs.data?.items
                      .filter((doc) => doc.kind !== "folder")
                      .map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.title}
                        </option>
                      ))
                  : characters.data?.items.map((character) => (
                      <option key={character.id} value={character.id}>
                        {character.name}
                      </option>
                    ))}
              </SelectField>
            ) : field.type === "textarea" ? (
              <textarea
                id={`studio-${field.key}`}
                maxLength={
                  field.key.includes("evidence") || field.key === "quote"
                    ? 1000
                    : 2000
                }
                value={values[field.key]}
                onChange={(event) => set(field.key, event.target.value)}
              />
            ) : (
              <input
                id={`studio-${field.key}`}
                type={field.type === "number" ? "number" : "text"}
                min={0}
                maxLength={200}
                value={values[field.key]}
                onChange={(event) => set(field.key, event.target.value)}
              />
            )}
          </label>
        ))}
        {mutation.isError ? <StudioError /> : null}
        <div className="studio-actions">
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            {t("save")}
          </Button>
          <Link
            className="studio-link-button"
            to={`/projects/${projectId}/studio/${kind}`}
          >
            {t("cancel")}
          </Link>
        </div>
      </fieldset>
    </form>
  );
}

function ThreadHistory({
  projectId,
  recordId,
}: {
  projectId: string;
  recordId: string;
}) {
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("historyPage")) || 1);
  const query = useQuery({
    queryKey: ["thread-updates", recordId, page],
    queryFn: async () =>
      (
        await listThreadUpdates({
          client: apiClient,
          path: { project_id: projectId, record_id: recordId },
          query: { page, page_size: 50 },
        })
      ).data.data,
  });
  if (query.isPending) return <StudioLoading />;
  if (query.isError) return <StudioError retry={() => void query.refetch()} />;
  return (
    <>
      <RecordTable
        items={query.data.items}
        columns={[
          {
            title: t("status"),
            dataIndex: "status",
            width: 140,
            render: (value: string) => t(value),
          },
          { title: t("body"), dataIndex: "note", width: 360, ellipsis: true },
          {
            title: t("createdAt"),
            dataIndex: "created_at",
            width: 190,
            render: (value: string) => new Date(value).toLocaleString(),
          },
        ]}
      />
      <div className="studio-pagination">
        <Pagination
          current={page}
          pageSize={50}
          total={query.data.total}
          showSizeChanger={false}
          onChange={(value) =>
            setParams({
              ...Object.fromEntries(params),
              historyPage: String(value),
            })
          }
        />
      </div>
    </>
  );
}

function StyleCheck({ projectId }: { projectId: string }) {
  const { t } = useTranslation("studio");
  const client = useQueryClient();
  const [documentId, setDocumentId] = useState("");
  const [added, setAdded] = useState<string[]>([]);
  const documents = useQuery({
    queryKey: ["documents", projectId, "active"],
    queryFn: async () =>
      (
        await listProjectDocuments({
          client: apiClient,
          path: { project_id: projectId },
        })
      ).data.data,
  });
  const check = useMutation({
    mutationFn: async () => {
      const source = (
        await getProjectDocumentContent({
          client: apiClient,
          path: { project_id: projectId, document_id: documentId },
        })
      ).data.data;
      const warnings = (
        await checkProjectStyle({
          client: apiClient,
          path: { project_id: projectId },
          query: { document_id: documentId },
        })
      ).data.data;
      return { source, warnings, documentId };
    },
    onSuccess: () => setAdded([]),
  });
  const note = useMutation({
    mutationFn: async (title: string) =>
      createStudioNote({
        client: apiClient,
        path: { project_id: projectId },
        body: {
          title: title.slice(0, 200),
          body: title,
          source_document_id: check.data!.documentId,
          source_version: check.data!.source.version,
          status: "open",
        },
      }),
    onSuccess: async (_, title) => {
      setAdded((previous) => [...previous, title]);
      await client.invalidateQueries({
        queryKey: ["studio", projectId, "notes"],
      });
    },
  });
  return (
    <section>
      <p>{t("styleCheckNotice")}</p>
      <div className="studio-filter">
        <label>
          {t("chooseChapter")}
          <SelectField
            value={documentId}
            onValueChange={(value) => {
              setDocumentId(value);
              check.reset();
            }}
          >
            <option value="">—</option>
            {documents.data?.items
              .filter((doc) => doc.kind === "manuscript")
              .map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.title}
                </option>
              ))}
          </SelectField>
        </label>
        <Button
          disabled={!documentId || note.isPending}
          loading={check.isPending}
          onClick={() => check.mutate()}
        >
          {t("styleCheck")}
        </Button>
      </div>
      {check.isError || note.isError ? <StudioError /> : null}
      {check.data ? (
        <RecordTable
          items={check.data.warnings.map((warning, index) => ({
            ...warning,
            id: String(index),
          }))}
          emptyText={t("noWarnings")}
          columns={[
            {
              title: t("body"),
              dataIndex: "title",
              width: 400,
              ellipsis: true,
            },
            {
              title: t("admin:actions"),
              key: "actions",
              width: 88,
              fixed: "right",
              align: "center",
              render: (_, row) => (
                <RowAction
                  label={t(added.includes(row.title) ? "saved" : "addNote")}
                  icon={Plus}
                  disabled={added.includes(row.title)}
                  loading={note.isPending}
                  onClick={() => note.mutate(row.title)}
                />
              ),
            },
          ]}
        />
      ) : null}
    </section>
  );
}
