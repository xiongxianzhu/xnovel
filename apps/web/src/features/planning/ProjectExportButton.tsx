import { Alert, Button, Dropdown } from "antd";
import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { exportProjectRequest, type ProjectExportFormat } from "./planningApi";

export function ProjectExportButton({ projectId }: { projectId: string }) {
  const { t } = useTranslation(["common", "projects"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function download(format: ProjectExportFormat) {
    if (loading) return;
    setLoading(true);
    setError(false);
    try {
      const exported = await exportProjectRequest(projectId, format);
      const url = URL.createObjectURL(
        new Blob([exported.content], {
          type:
            format === "markdown"
              ? "text/markdown;charset=utf-8"
              : "text/plain;charset=utf-8",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="project-export-control">
      <Dropdown
        menu={{
          items: [
            { key: "markdown", label: t("projects:exportMarkdown") },
            { key: "plain_text", label: t("projects:exportPlainText") },
          ],
          onClick: ({ key }) => void download(key as ProjectExportFormat),
        }}
        trigger={["click"]}
      >
        <Button icon={<Download aria-hidden size={17} />} loading={loading}>
          {t("projects:exportProject")}
        </Button>
      </Dropdown>
      {error ? (
        <Alert
          closable
          onClose={() => setError(false)}
          showIcon
          title={t("projects:exportFailed")}
          type="error"
        />
      ) : null}
    </div>
  );
}
