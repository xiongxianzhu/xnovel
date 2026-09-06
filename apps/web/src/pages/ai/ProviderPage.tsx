import { RecordTable } from "../../shared/ui/RecordTable";
import { RowAction } from "../../shared/ui/RowAction";
import {
  Alert,
  Button,
  Input,
  Modal,
  Pagination,
  Skeleton,
  Switch,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import {
  deleteProviderConfigRequest,
  listProviderConfigsRequest,
  testProviderConnectionRequest,
  updateProviderConfigRequest,
} from "../../features/ai/aiApi";
import { useDebouncedValue } from "../../features/admin/useDebouncedValue";

export function ProviderPage() {
  const { t } = useTranslation("ai");
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const query = params.get("q") ?? "";
  const debounced = useDebouncedValue(query, 300);
  const providers = useQuery({
    queryKey: ["ai", "providers", page, debounced],
    queryFn: () => listProviderConfigsRequest(page, 50, debounced),
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["ai", "providers"] });
  const toggle = useMutation({
    mutationFn: ({
      item,
      enabled,
    }: {
      item: NonNullable<typeof providers.data>["items"][number];
      enabled: boolean;
    }) =>
      updateProviderConfigRequest(item.id, {
        base_url: item.base_url,
        default_model_id:
          item.models.find((model) => model.id === item.default_model_id)
            ?.model_id ?? item.models[0]!.model_id,
        display_name: item.display_name,
        enabled,
        models: item.models.map((model) => ({
          context_window: model.context_window,
          display_name: model.display_name,
          enabled: model.enabled,
          max_output_tokens: model.max_output_tokens,
          model_id: model.model_id,
          supports_streaming: model.supports_streaming,
        })),
      }),
    onSuccess: refresh,
  });
  const test = useMutation({
    mutationFn: (configId: string) => testProviderConnectionRequest(configId),
  });
  const remove = useMutation({
    mutationFn: deleteProviderConfigRequest,
    onSuccess: refresh,
  });

  return (
    <main className="tool-page" aria-labelledby="provider-title">
      <header className="tool-page-heading">
        <div>
          <h1 id="provider-title">{t("providersTitle")}</h1>
          <p>{t("providersDescription")}</p>
        </div>
        <div className="studio-actions">
          <Link className="studio-link-button" to="/ai/history">
            {t("studio:aiHistory")}
          </Link>
          <Link to="/ai-models/new">
            <Button icon={<Plus aria-hidden size={17} />} type="primary">
              {t("addConnection")}
            </Button>
          </Link>
        </div>
      </header>
      <div className="record-filters">
        <Input.Search
          allowClear
          className="record-filter-search"
          onChange={(event) =>
            setParams((current) => {
              if (event.target.value) current.set("q", event.target.value);
              else current.delete("q");
              current.set("page", "1");
              return current;
            })
          }
          placeholder={t("providerSearchPlaceholder")}
          value={query}
        />
      </div>
      {providers.isPending ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
      {providers.isError ? (
        <Alert showIcon title={t("providerLoadFailed")} type="error" />
      ) : null}
      {providers.data ? (
        <RecordTable
          items={providers.data.items}
          columns={[
            {
              title: t("displayName"),
              dataIndex: "display_name",
              width: 190,
              ellipsis: true,
            },
            {
              title: t("customProviderId"),
              dataIndex: "provider_id",
              width: 150,
              ellipsis: true,
            },
            { title: t("protocol"), dataIndex: "protocol", width: 150 },
            {
              title: t("baseUrl"),
              dataIndex: "base_url",
              width: 300,
              ellipsis: true,
            },
            {
              title: t("studio:modelCount"),
              key: "models",
              width: 100,
              render: (_, item) => item.models.length,
            },
            {
              title: t("studio:status"),
              key: "enabled",
              width: 110,
              render: (_, item) => (
                <Switch
                  aria-label={`${t("enabled")} · ${item.display_name}`}
                  checked={item.enabled}
                  loading={
                    toggle.isPending && toggle.variables?.item.id === item.id
                  }
                  disabled={toggle.isPending}
                  onChange={(enabled) => toggle.mutate({ item, enabled })}
                />
              ),
            },
            {
              title: t("admin:actions"),
              key: "actions",
              width: 208,
              fixed: "right",
              align: "center",
              render: (_, item) => (
                <div className="record-actions">
                  <RowAction
                    label={t("details")}
                    icon={Eye}
                    to={`/ai-models/${item.id}`}
                  />
                  <RowAction
                    label={t("studio:edit")}
                    icon={Pencil}
                    to={`/ai-models/${item.id}/edit`}
                  />
                  <RowAction
                    label={t("test")}
                    icon={RefreshCw}
                    loading={test.isPending && test.variables === item.id}
                    disabled={test.isPending}
                    onClick={() => test.mutate(item.id)}
                  />
                  <RowAction
                    label={t("studio:delete")}
                    icon={Trash2}
                    danger
                    disabled={remove.isPending}
                    onClick={() =>
                      Modal.confirm({
                        title: t("deleteProviderTitle"),
                        content: t("deleteProviderDescription"),
                        onOk: () => remove.mutateAsync(item.id),
                      })
                    }
                  />
                </div>
              ),
            },
          ]}
        />
      ) : null}
      {providers.data?.total ? (
        <Pagination
          current={providers.data.page}
          onChange={(next) =>
            setParams((current) => {
              current.set("page", String(next));
              return current;
            })
          }
          pageSize={providers.data.page_size}
          showQuickJumper
          showSizeChanger={false}
          total={providers.data.total}
        />
      ) : null}
    </main>
  );
}
