import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Switch,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, Plus, RefreshCw, Server } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  ProviderCatalogItem,
  ProviderConfigCreateRequestWritable,
} from "../../shared/api/generated/types.gen";
import {
  createProviderConfigRequest,
  getProviderCatalogRequest,
  listProviderConfigsRequest,
  testProviderConnectionRequest,
  updateProviderConfigRequest,
} from "../../features/ai/aiApi";

const providerQueryKey = ["ai", "providers"] as const;

type ProviderFormValues = {
  apiKey?: string;
  baseUrl: string;
  contextWindow: number;
  displayName: string;
  maxOutputTokens: number;
  modelDisplayName: string;
  modelId: string;
  providerId: string;
  customProviderId?: string;
  protocol?: "openai_chat" | "openai_responses" | "anthropic" | "google";
};

export function ProviderPage() {
  const { t } = useTranslation("ai");
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ProviderFormValues>();
  const selectedCatalogId = Form.useWatch("providerId", form);
  const customProvider = selectedCatalogId === "__custom__";
  const providers = useQuery({
    queryKey: providerQueryKey,
    queryFn: listProviderConfigsRequest,
  });
  const catalog = useQuery({
    queryKey: ["ai", "provider-catalog"],
    queryFn: getProviderCatalogRequest,
  });
  const create = useMutation({
    mutationFn: createProviderConfigRequest,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: providerQueryKey });
      setOpen(false);
      form.resetFields();
    },
  });
  const toggle = useMutation({
    mutationFn: ({
      config: item,
      enabled,
    }: {
      config: NonNullable<typeof providers.data>["items"][number];
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
    onSuccess: () => client.invalidateQueries({ queryKey: providerQueryKey }),
  });
  const test = useMutation({
    mutationFn: (configId: string) => testProviderConnectionRequest(configId),
  });

  function selectCatalog(providerId: string) {
    if (providerId === "__custom__") {
      form.setFieldsValue({ displayName: "", baseUrl: "" });
      return;
    }
    const item = catalog.data?.items.find(
      (entry) => entry.provider_id === providerId,
    );
    if (item)
      form.setFieldsValue({
        baseUrl: item.base_url,
        displayName: item.display_name,
      });
  }

  async function submit(values: ProviderFormValues) {
    const preset = catalog.data?.items.find(
      (item) => item.provider_id === values.providerId,
    );
    if (!preset && !customProvider) return;
    const providerId = customProvider
      ? values.customProviderId?.trim()
      : preset?.provider_id;
    const protocol = customProvider ? values.protocol : preset?.protocol;
    if (!providerId || !protocol) return;
    const payload: ProviderConfigCreateRequestWritable = {
      api_key: values.apiKey || null,
      base_url: values.baseUrl,
      default_model_id: values.modelId,
      display_name: values.displayName,
      enabled: true,
      models: [
        {
          context_window: values.contextWindow,
          display_name: values.modelDisplayName,
          max_output_tokens: values.maxOutputTokens,
          model_id: values.modelId,
          supports_streaming: true,
        },
      ],
      protocol,
      provider_id: providerId,
      source: customProvider ? "custom" : "builtin",
    };
    await create.mutateAsync(payload);
  }

  return (
    <main className="tool-page" aria-labelledby="provider-title">
      <header className="tool-page-heading">
        <div>
          <span className="page-eyebrow">{t("eyebrow")}</span>
          <h1 id="provider-title">{t("providersTitle")}</h1>
          <p>{t("providersDescription")}</p>
        </div>
        <Button
          icon={<Plus aria-hidden size={17} />}
          onClick={() => setOpen(true)}
          type="primary"
        >
          {t("addConnection")}
        </Button>
      </header>
      {providers.isPending ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : providers.isError ? (
        <Alert
          action={
            <Button onClick={() => void providers.refetch()}>
              {t("retry")}
            </Button>
          }
          showIcon
          title={t("providerLoadFailed")}
          type="error"
        />
      ) : providers.data.items.length === 0 ? (
        <section className="tool-empty">
          <Server aria-hidden size={30} />
          <h2>{t("noProviders")}</h2>
          <p>{t("noProvidersDescription")}</p>
        </section>
      ) : (
        <div className="tool-list">
          {providers.data.items.map((item) => (
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
                  {item.unauthenticated_warning ? (
                    <span className="status-label status-danger">
                      {t("unauthenticatedWarning")}
                    </span>
                  ) : null}
                </div>
                <p>
                  {item.provider_id} ·{" "}
                  {t("modelsCount", { count: item.models.length })} ·{" "}
                  {item.key_hint ?? t("noKey")}
                </p>
                <code>{item.base_url}</code>
              </div>
              <div className="tool-row-actions">
                <Switch
                  aria-label={t("enableStatus", { name: item.display_name })}
                  checked={item.enabled}
                  loading={toggle.isPending}
                  onChange={(enabled) =>
                    toggle.mutate({ config: item, enabled })
                  }
                />
                <Button
                  icon={<RefreshCw aria-hidden size={16} />}
                  loading={test.isPending}
                  onClick={() => test.mutate(item.id)}
                >
                  {t("test")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {test.data ? (
        <Alert
          className="tool-feedback"
          showIcon
          icon={<CheckCircle2 />}
          title={
            test.data.status === "succeeded"
              ? t("testPassed")
              : t("testFailed", {
                  error: test.data.error_code ?? t("unknownError"),
                })
          }
          type={test.data.status === "succeeded" ? "success" : "error"}
        />
      ) : null}
      <Modal
        destroyOnHidden
        footer={null}
        onCancel={() => setOpen(false)}
        open={open}
        title={t("addProviderTitle")}
      >
        <Form
          form={form}
          initialValues={{ contextWindow: 128000, maxOutputTokens: 4096 }}
          layout="vertical"
          onFinish={(values) => void submit(values)}
        >
          <Form.Item
            label="Provider"
            name="providerId"
            rules={[{ required: true, message: t("providerRequired") }]}
          >
            <Select
              loading={catalog.isPending}
              onChange={selectCatalog}
              options={catalog.data?.items
                .map((item: ProviderCatalogItem) => ({
                  label: item.display_name,
                  value: item.provider_id,
                }))
                .concat([{ label: t("customProvider"), value: "__custom__" }])}
            />
          </Form.Item>
          {customProvider ? (
            <div className="tool-form-grid">
              <Form.Item
                label={t("customProviderId")}
                name="customProviderId"
                rules={[
                  { required: true, message: t("customProviderIdRequired") },
                  {
                    pattern: /^[a-z][a-z0-9-]{1,62}$/,
                    message: t("customProviderIdRequired"),
                  },
                ]}
              >
                <Input placeholder="my-provider" />
              </Form.Item>
              <Form.Item
                label={t("protocol")}
                name="protocol"
                rules={[{ required: true, message: t("protocolRequired") }]}
              >
                <Select
                  options={[
                    { label: "OpenAI Chat Completions", value: "openai_chat" },
                    { label: "OpenAI Responses", value: "openai_responses" },
                    { label: "Anthropic Messages", value: "anthropic" },
                    { label: "Google Generative AI", value: "google" },
                  ]}
                />
              </Form.Item>
            </div>
          ) : null}
          <Form.Item
            label={t("displayName")}
            name="displayName"
            rules={[{ required: true, message: t("displayNameRequired") }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t("baseUrl")}
            name="baseUrl"
            rules={[
              { required: true, message: t("baseUrlRequired") },
              { type: "url", message: t("validUrl") },
            ]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t("apiKey")} name="apiKey">
            <Input.Password
              prefix={<KeyRound aria-hidden size={16} />}
              autoComplete="new-password"
            />
          </Form.Item>
          <div className="tool-form-grid">
            <Form.Item
              label={t("modelId")}
              name="modelId"
              rules={[{ required: true, message: t("modelIdRequired") }]}
            >
              <Input />
            </Form.Item>
            <Form.Item
              label={t("modelName")}
              name="modelDisplayName"
              rules={[{ required: true, message: t("modelNameRequired") }]}
            >
              <Input />
            </Form.Item>
          </div>
          <div className="tool-form-grid">
            <Form.Item label={t("contextWindow")} name="contextWindow">
              <InputNumber min={1} />
            </Form.Item>
            <Form.Item label={t("maxOutputTokens")} name="maxOutputTokens">
              <InputNumber min={1} />
            </Form.Item>
          </div>
          {create.isError ? (
            <Alert showIcon title={t("saveFailed")} type="error" />
          ) : null}
          <div className="modal-actions">
            <Button onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button htmlType="submit" loading={create.isPending} type="primary">
              {t("saveConnection")}
            </Button>
          </div>
        </Form>
      </Modal>
    </main>
  );
}
