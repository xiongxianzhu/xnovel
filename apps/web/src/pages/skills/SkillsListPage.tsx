import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Modal, Pagination, Switch } from "antd";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  deleteSkillRequest,
  listSkillsRequest,
  setSkillEnabledRequest,
} from "../../features/skills/skillsApi";
import {
  StudioError,
  StudioFrame,
  StudioLoading,
} from "../../features/studio/StudioFrame";

export function SkillsListPage() {
  const { t } = useTranslation("studio");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const debouncedQ = useDebouncedValue(q);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const enabled = params.get("enabled") ?? "";
  const client = useQueryClient();
  const [deleting, setDeleting] = useState<string>();
  const query = useQuery({
    queryKey: ["skills", page, debouncedQ, enabled],
    queryFn: () =>
      listSkillsRequest({
        page,
        page_size: 50,
        q: debouncedQ,
        enabled: enabled ? enabled === "true" : undefined,
      }),
  });
  const refresh = () => client.invalidateQueries({ queryKey: ["skills"] });
  const toggle = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      setSkillEnabledRequest(id, value),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => deleteSkillRequest(deleting!),
    onSuccess: async () => {
      setDeleting(undefined);
      await refresh();
    },
  });
  return (
    <StudioFrame
      title="Skills"
      actions={
        <Link className="studio-link-button" to="/skills/new">
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
                { q: event.target.value, enabled, page: "1" },
                { replace: true },
              )
            }
          />
        </label>
        <label>
          {t("status")}
          <select
            value={enabled}
            onChange={(event) =>
              setParams({ q, enabled: event.target.value, page: "1" })
            }
          >
            <option value="">{t("all")}</option>
            <option value="true">{t("enabled")}</option>
            <option value="false">{t("disabled")}</option>
          </select>
        </label>
      </div>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <ul className="studio-list">
            {query.data.items.map((skill) => (
              <li key={skill.id}>
                <div>
                  <h2>
                    <Link to={`/skills/${skill.id}`}>{skill.name}</Link>
                  </h2>
                  <p className="studio-excerpt">{skill.description}</p>
                </div>
                <div className="studio-actions">
                  <Switch
                    aria-label={`${t("enabled")} · ${skill.name}`}
                    checked={skill.enabled}
                    disabled={skill.status !== "ready" || toggle.isPending}
                    onChange={(value) => toggle.mutate({ id: skill.id, value })}
                  />
                  <Link
                    className="studio-link-button"
                    to={`/skills/${skill.id}/edit`}
                  >
                    {t("edit")}
                  </Link>
                  <Button danger onClick={() => setDeleting(skill.id)}>
                    {t("delete")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {!query.data.items.length ? <p>{t("empty")}</p> : null}
          <div className="studio-pagination">
            <Pagination
              current={page}
              pageSize={50}
              total={query.data.total ?? query.data.items.length}
              showSizeChanger={false}
              showQuickJumper
              onChange={(value) =>
                setParams({ q, enabled, page: String(value) })
              }
            />
          </div>
        </>
      )}
      {toggle.isError || remove.isError ? <StudioError /> : null}
      <Modal
        open={Boolean(deleting)}
        title={t("delete")}
        okText={t("delete")}
        cancelText={t("cancel")}
        okButtonProps={{ danger: true }}
        confirmLoading={remove.isPending}
        onOk={() => remove.mutate()}
        onCancel={() => setDeleting(undefined)}
      >
        {t("deleteConfirm")}
      </Modal>
    </StudioFrame>
  );
}
