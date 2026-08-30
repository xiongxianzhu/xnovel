import {
  Button,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Switch,
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import {
  createProviderConfigRequest,
  getProviderConfigRequest,
  updateProviderConfigRequest,
} from "../../features/ai/aiApi";

type Values = {
  api_key?: string;
  base_url: string;
  context_window: number;
  display_name: string;
  enabled: boolean;
  max_output_tokens: number;
  model_display_name: string;
  model_id: string;
  protocol: "openai_chat" | "openai_responses" | "anthropic" | "google";
  provider_id: string;
};
export function ProviderFormPage() {
  const { configId } = useParams();
  const editing = Boolean(configId);
  const navigate = useNavigate();
  const client = useQueryClient();
  const [form] = Form.useForm<Values>();
  const query = useQuery({
    enabled: editing,
    queryKey: ["ai", "provider", configId],
    queryFn: () => getProviderConfigRequest(configId!),
  });
  const save = useMutation({
    mutationFn: async (values: Values) => {
      const models = [
        {
          context_window: values.context_window,
          display_name: values.model_display_name,
          enabled: true,
          max_output_tokens: values.max_output_tokens,
          model_id: values.model_id,
          supports_streaming: true,
        },
      ];
      return editing
        ? updateProviderConfigRequest(configId!, {
            api_key: values.api_key || null,
            base_url: values.base_url,
            default_model_id: values.model_id,
            display_name: values.display_name,
            enabled: values.enabled,
            models,
          })
        : createProviderConfigRequest({
            api_key: values.api_key || null,
            base_url: values.base_url,
            default_model_id: values.model_id,
            display_name: values.display_name,
            enabled: values.enabled,
            models,
            protocol: values.protocol,
            provider_id: values.provider_id,
            source: "custom",
          });
    },
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: ["ai", "providers"] });
      navigate(`/ai-models/${saved.id}`);
    },
  });
  if (editing && query.isPending)
    return (
      <main className="tool-page">
        <Skeleton active />
      </main>
    );
  const model = query.data?.models[0];
  const initial: Values = query.data
    ? {
        api_key: "",
        base_url: query.data.base_url,
        context_window: model?.context_window ?? 128000,
        display_name: query.data.display_name,
        enabled: query.data.enabled,
        max_output_tokens: model?.max_output_tokens ?? 4096,
        model_display_name: model?.display_name ?? "",
        model_id: model?.model_id ?? "",
        protocol: query.data.protocol,
        provider_id: query.data.provider_id,
      }
    : {
        api_key: "",
        base_url: "",
        context_window: 128000,
        display_name: "",
        enabled: true,
        max_output_tokens: 4096,
        model_display_name: "",
        model_id: "",
        protocol: "openai_chat",
        provider_id: "",
      };
  return (
    <main className="tool-page">
      <header className="tool-page-heading">
        <h1>{editing ? "编辑 AI 模型" : "新增 AI 模型"}</h1>
      </header>
      <Form
        form={form}
        initialValues={initial}
        layout="vertical"
        onFinish={(values) => save.mutate(values)}
      >
        <Form.Item
          label="Provider ID"
          name="provider_id"
          rules={[{ required: true }]}
        >
          <Input disabled={editing} />
        </Form.Item>
        <Form.Item
          label="显示名称"
          name="display_name"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="协议" name="protocol">
          <Select
            disabled={editing}
            options={[
              "openai_chat",
              "openai_responses",
              "anthropic",
              "google",
            ].map((value) => ({ label: value, value }))}
          />
        </Form.Item>
        <Form.Item
          label="Base URL"
          name="base_url"
          rules={[{ required: true }, { type: "url" }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="API Key" name="api_key">
          <Input.Password />
        </Form.Item>
        <Form.Item label="模型 ID" name="model_id" rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item
          label="模型名称"
          name="model_display_name"
          rules={[{ required: true }]}
        >
          <Input />
        </Form.Item>
        <Form.Item label="上下文窗口" name="context_window">
          <InputNumber min={1} />
        </Form.Item>
        <Form.Item label="最大输出" name="max_output_tokens">
          <InputNumber min={1} />
        </Form.Item>
        <Form.Item label="启用" name="enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Button htmlType="submit" loading={save.isPending} type="primary">
          保存
        </Button>
      </Form>
    </main>
  );
}
