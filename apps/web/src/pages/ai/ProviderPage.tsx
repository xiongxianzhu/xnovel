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
import { Eye, Pencil, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
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
        <Link to="/ai-models/new">
          <Button icon={<Plus aria-hidden size={17} />} type="primary">
            {t("addConnection")}
          </Button>
        </Link>
      </header>
      <Input.Search
        allowClear
        className="tool-search"
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
      {providers.isPending ? <Skeleton active paragraph={{ rows: 5 }} /> : null}
      {providers.isError ? (
        <Alert showIcon title={t("providerLoadFailed")} type="error" />
      ) : null}
      <div className="tool-list">
        {providers.data?.items.map((item) => (
          <article className="tool-row" key={item.id}>
            <div className="tool-row-icon">
              <Server aria-hidden size={19} />
            </div>
            <div className="tool-row-content">
              <div className="tool-row-title">
                <h2>{item.display_name}</h2>
                <span className="status-label">
                  {item.enabled ? t("enabled") : t("disabled")}
                </span>
              </div>
              <p>
                {item.provider_id} ·{" "}
                {t("modelsCount", { count: item.models.length })}
              </p>
              <code>{item.base_url}</code>
            </div>
            <div className="tool-row-actions">
              <Switch
                checked={item.enabled}
                onChange={(enabled) => toggle.mutate({ item, enabled })}
              />
              <Link to={`/ai-models/${item.id}`}>
                <Button icon={<Eye aria-hidden size={16} />}>
                  {t("details")}
                </Button>
              </Link>
              <Link to={`/ai-models/${item.id}/edit`}>
                <Button icon={<Pencil aria-hidden size={16} />}>
                  {t("edit")}
                </Button>
              </Link>
              <Button
                icon={<RefreshCw aria-hidden size={16} />}
                onClick={() => test.mutate(item.id)}
              >
                {t("test")}
              </Button>
              <Button
                danger
                icon={<Trash2 aria-hidden size={16} />}
                onClick={() =>
                  Modal.confirm({
                    title: t("deleteProviderTitle"),
                    content: t("deleteProviderDescription"),
                    onOk: () => remove.mutateAsync(item.id),
                  })
                }
              >
                {t("delete")}
              </Button>
            </div>
          </article>
        ))}
      </div>
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
