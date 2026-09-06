import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { SelectField } from "../../shared/ui/SelectField";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Modal, Pagination, Switch } from "antd";
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
          <SelectField
            value={enabled}
            onValueChange={(value) =>
              setParams({ q, enabled: value, page: "1" })
            }
          >
            <option value="">{t("all")}</option>
            <option value="true">{t("enabled")}</option>
            <option value="false">{t("disabled")}</option>
          </SelectField>
        </label>
      </div>
      {query.isPending ? (
        <StudioLoading />
      ) : query.isError ? (
        <StudioError />
      ) : (
        <>
          <RecordTable
            items={query.data.items}
            columns={[
              {
                title: t("title"),
                dataIndex: "name",
                width: 240,
                ellipsis: true,
                render: (name: string, item) => (
                  <Link to={`/skills/${item.id}`}>{name}</Link>
                ),
              },
              {
                title: t("description"),
                dataIndex: "description",
                width: 420,
                ellipsis: true,
              },
              {
                title: t("status"),
                dataIndex: "status",
                width: 130,
                render: (value: string) =>
                  value === "ready" ? t("skillReady") : t(`skills:${value}`),
              },
              {
                title: t("enabled"),
                key: "enabled",
                width: 110,
                render: (_, item) => (
                  <Switch
                    aria-label={`${t("enabled")} · ${item.name}`}
                    checked={item.enabled}
                    disabled={item.status !== "ready" || toggle.isPending}
                    onChange={(value) => toggle.mutate({ id: item.id, value })}
                  />
                ),
              },
              {
                title: t("admin:actions"),
                key: "actions",
                width: 160,
                fixed: "right",
                align: "center",
                render: (_, item) => (
                  <div className="record-actions">
                    <RowAction
                      label={t("details")}
                      icon={Eye}
                      to={`/skills/${item.id}`}
                    />
                    <RowAction
                      label={t("edit")}
                      icon={Pencil}
                      to={`/skills/${item.id}/edit`}
                    />
                    <RowAction
                      label={t("delete")}
                      icon={Trash2}
                      danger
                      onClick={() => setDeleting(item.id)}
                    />
                  </div>
                ),
              },
            ]}
          />
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
