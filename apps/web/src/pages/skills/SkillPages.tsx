import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Pagination } from "antd";
import { useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  getSkillResourceRequest,
  updateSkillMarkdownRequest,
  uploadSkillRequest,
} from "../../features/skills/skillsApi";
import {
  getSkill,
  getSkillVersion,
  listSkillFiles,
  listSkillVersions,
} from "../../shared/api/generated/sdk.gen";
import { apiClient } from "../../shared/api/client";
import {
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";
import { useFormProtection } from "../../features/studio/useFormProtection";

export function SkillCreatePage() {
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [file, setFile] = useState<File>();
  const mutation = useMutation({
    mutationFn: () => uploadSkillRequest(file!),
    onSuccess: async (skill) => {
      await client.invalidateQueries({ queryKey: ["skills"] });
      navigate(`/skills/${skill.id}`);
    },
  });
  return (
    <StudioFrame title={`${t("create")} · Skills`} back="/skills">
      <form
        className="studio-form"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <fieldset className="studio-form-fields" disabled={mutation.isPending}>
          <label className="studio-field">
            {t("skills:upload")}（.zip / .skill，10 MiB）
            <input
              type="file"
              accept=".zip,.skill"
              required
              disabled={mutation.isPending}
              onChange={(event) => setFile(event.target.files?.[0])}
            />
          </label>
          {mutation.isError ? <StudioError /> : null}
          <div>
            <Button
              type="primary"
              htmlType="submit"
              disabled={!file || file.size > 10 * 1024 * 1024}
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

export function SkillRecordPage() {
  const { skillId = "" } = useParams();
  const { t } = useTranslation("studio");
  const editing = useLocation().pathname.endsWith("/edit");
  const query = useQuery({
    queryKey: ["skill", skillId],
    queryFn: async () =>
      (await getSkill({ client: apiClient, path: { skill_id: skillId } })).data
        .data,
  });
  const text = useQuery({
    queryKey: ["skill-text", skillId, query.data?.current_version.id],
    enabled: query.data?.status === "ready",
    queryFn: () => getSkillResourceRequest(skillId, "SKILL.md"),
  });
  return (
    <StudioFrame
      title={query.data?.name ?? "Skills"}
      back="/skills"
      actions={
        !editing ? (
          <>
            <Link className="studio-link-button" to={`/skills/${skillId}/edit`}>
              {t("edit")}
            </Link>
            <Link
              className="studio-link-button"
              to={`/skills/${skillId}/versions`}
            >
              {t("versions")}
            </Link>
          </>
        ) : undefined
      }
    >
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <p>{query.data.description}</p>
          <dl className="studio-meta">
            <dt>{t("status")}</dt>
            <dd>{query.data.enabled ? t("enabled") : t("disabled")}</dd>
            <dt>{t("versions")}</dt>
            <dd>{query.data.current_version.version_number}</dd>
            <dt>SHA-256</dt>
            <dd>{query.data.current_version.content_sha256}</dd>
            <dt>{t("resources")}</dt>
            <dd>{query.data.current_version.file_count}</dd>
          </dl>
          {text.isError ? (
            <StudioError />
          ) : text.isPending ? (
            query.data.status === "ready" ? (
              <StudioLoading />
            ) : (
              <p>{t("readOnly")}</p>
            )
          ) : editing ? (
            <SkillEditor
              key={query.data.current_version.id}
              skillId={skillId}
              versionId={query.data.current_version.id}
              initial={text.data.content}
            />
          ) : (
            <SkillResourceBrowser
              skillId={skillId}
              versionId={query.data.current_version.id}
              initial={text.data.content}
            />
          )}
        </>
      )}
    </StudioFrame>
  );
}

function SkillResourceBrowser({
  skillId,
  versionId,
  initial,
}: {
  skillId: string;
  versionId: string;
  initial: string;
}) {
  const { t } = useTranslation("studio");
  const [path, setPath] = useState("SKILL.md");
  const files = useQuery({
    queryKey: ["skill-files", skillId, versionId],
    queryFn: async () =>
      (await listSkillFiles({ client: apiClient, path: { skill_id: skillId } }))
        .data.data,
  });
  const resource = useQuery({
    queryKey: ["skill-file", skillId, versionId, path],
    enabled: path !== "SKILL.md",
    queryFn: () => getSkillResourceRequest(skillId, path),
  });
  return (
    <section>
      <label className="studio-field">
        {t("resources")}
        <select value={path} onChange={(event) => setPath(event.target.value)}>
          {(files.data ?? ["SKILL.md"]).map((file) => (
            <option
              key={file}
              value={file}
              disabled={!/\.(md|txt|json|ya?ml)$/i.test(file)}
            >
              {file}
            </option>
          ))}
        </select>
      </label>
      {files.isError || resource.isError ? (
        <StudioError
          retry={() => {
            void files.refetch();
            if (path !== "SKILL.md") void resource.refetch();
          }}
        />
      ) : null}
      <pre className="studio-record-body">
        {path === "SKILL.md"
          ? initial
          : (resource.data?.content ?? t("loading"))}
      </pre>
    </section>
  );
}

function SkillEditor({
  skillId,
  versionId,
  initial,
}: {
  skillId: string;
  versionId: string;
  initial: string;
}) {
  const { t } = useTranslation("studio");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [text, setText] = useState(initial);
  const clean = useRef(initial);
  const draftKey = `xnovel:skill-draft:${skillId}:${versionId}`;
  const [draft, setDraft] = useState(() => sessionStorage.getItem(draftKey));
  const mutation = useMutation({
    mutationFn: () => updateSkillMarkdownRequest(skillId, versionId, text),
  });
  async function save() {
    try {
      await mutation.mutateAsync();
      clean.current = text;
      sessionStorage.removeItem(draftKey);
      await client.invalidateQueries({ queryKey: ["skills"] });
      await client.invalidateQueries({ queryKey: ["skill", skillId] });
      return true;
    } catch {
      return false;
    }
  }
  useFormProtection(
    () => clean.current !== text,
    save,
    () => {
      sessionStorage.setItem(draftKey, text);
    },
  );
  return (
    <form
      className="studio-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save().then((ok) => {
          if (ok) navigate(`/skills/${skillId}`);
        });
      }}
    >
      <fieldset className="studio-form-fields" disabled={mutation.isPending}>
        {draft ? (
          <Alert
            type="info"
            title={t("draft")}
            action={
              <>
                <Button
                  onClick={() => {
                    setText(draft);
                    setDraft(null);
                  }}
                >
                  {t("restore")}
                </Button>
                <Button
                  onClick={() => {
                    sessionStorage.removeItem(draftKey);
                    setDraft(null);
                  }}
                >
                  {t("delete")}
                </Button>
              </>
            }
          />
        ) : null}
        <label className="studio-field">
          SKILL.md
          <textarea
            className="studio-body"
            value={text}
            maxLength={1048576}
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        {mutation.isError ? <StudioError /> : null}
        <div>
          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            {t("save")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}

export function SkillVersionsPage() {
  const { skillId = "", versionId } = useParams();
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const list = useQuery({
    queryKey: ["skill-versions", skillId, page, debouncedQ],
    enabled: !versionId,
    queryFn: async () =>
      (
        await listSkillVersions({
          client: apiClient,
          path: { skill_id: skillId },
          query: { page, page_size: 50, q: debouncedQ },
        })
      ).data.data,
  });
  const detail = useQuery({
    queryKey: ["skill-version", skillId, versionId],
    enabled: Boolean(versionId),
    queryFn: async () =>
      (
        await getSkillVersion({
          client: apiClient,
          path: { skill_id: skillId, version_id: versionId! },
        })
      ).data.data,
  });
  return (
    <StudioFrame
      title={t("versions")}
      back={versionId ? `/skills/${skillId}/versions` : `/skills/${skillId}`}
    >
      <p>{t("readOnly")}</p>
      {versionId ? (
        detail.isPending ? (
          <StudioLoading />
        ) : detail.isError ? (
          <StudioError />
        ) : (
          <>
            <p>
              v{detail.data.version.version_number} ·{" "}
              {detail.data.version.content_sha256}
            </p>
            <pre className="studio-record-body">
              {detail.data.skill_md_text}
            </pre>
          </>
        )
      ) : (
        <>
          <div className="studio-filter">
            <label>
              {t("keyword")} · SHA-256
              <input
                value={q}
                onChange={(event) =>
                  setParams(
                    { q: event.target.value, page: "1" },
                    { replace: true },
                  )
                }
              />
            </label>
          </div>
          {list.isPending ? (
            <StudioLoading />
          ) : list.isError ? (
            <StudioError />
          ) : (
            <>
              <ul className="studio-list">
                {list.data.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <Link to={`/skills/${skillId}/versions/${item.id}`}>
                        v{item.version_number}
                      </Link>
                      <p className="studio-excerpt">{item.content_sha256}</p>
                      <time>{new Date(item.created_at).toLocaleString()}</time>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="studio-pagination">
                <Pagination
                  current={page}
                  pageSize={50}
                  total={list.data.total}
                  showSizeChanger={false}
                  onChange={(value) => setParams({ q, page: String(value) })}
                />
              </div>
            </>
          )}
        </>
      )}
    </StudioFrame>
  );
}
