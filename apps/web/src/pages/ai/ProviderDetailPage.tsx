import { Button, Descriptions, Skeleton } from "antd";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { getProviderConfigRequest } from "../../features/ai/aiApi";

export function ProviderDetailPage() {
  const { configId = "" } = useParams();
  const query = useQuery({
    queryKey: ["ai", "provider", configId],
    queryFn: () => getProviderConfigRequest(configId),
  });
  if (query.isPending)
    return (
      <main className="tool-page">
        <Skeleton active />
      </main>
    );
  if (query.isError) return <main className="tool-page">加载失败</main>;
  const item = query.data;
  return (
    <main className="tool-page">
      <header className="tool-page-heading">
        <div>
          <h1>{item.display_name}</h1>
          <p>{item.provider_id}</p>
        </div>
        <Link to={`/ai-models/${item.id}/edit`}>
          <Button type="primary">编辑</Button>
        </Link>
      </header>
      <Descriptions
        bordered
        column={1}
        items={[
          { key: "protocol", label: "协议", children: item.protocol },
          { key: "url", label: "Base URL", children: item.base_url },
          {
            key: "enabled",
            label: "状态",
            children: item.enabled ? "启用" : "禁用",
          },
          {
            key: "models",
            label: "模型",
            children: item.models.map((model) => model.display_name).join("、"),
          },
          {
            key: "created",
            label: "创建时间",
            children: new Date(item.created_at).toLocaleString(),
          },
          {
            key: "updated",
            label: "更新时间",
            children: new Date(item.updated_at).toLocaleString(),
          },
        ]}
      />
    </main>
  );
}
