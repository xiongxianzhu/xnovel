import { Alert, Button, Input, Modal, Skeleton, Switch, Upload } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCode2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { SkillData } from "../../shared/api/generated/types.gen";
import {
  deleteSkillRequest,
  getSkillResourceRequest,
  listSkillsRequest,
  setSkillEnabledRequest,
  updateSkillMarkdownRequest,
  uploadSkillRequest,
} from "../../features/skills/skillsApi";

const skillQueryKey = ["skills"] as const;

export function SkillsPage() {
  const { t } = useTranslation("skills");
  const client = useQueryClient();
  const [editing, setEditing] = useState<SkillData | null>(null);
  const [markdown, setMarkdown] = useState("");
  const skills = useQuery({
    queryKey: skillQueryKey,
    queryFn: listSkillsRequest,
  });
  const refresh = () => client.invalidateQueries({ queryKey: skillQueryKey });
  const upload = useMutation({
    mutationFn: uploadSkillRequest,
    onSuccess: refresh,
  });
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      setSkillEnabledRequest(id, enabled),
    onSuccess: refresh,
  });
  const edit = useMutation({
    mutationFn: ({ skill, content }: { skill: SkillData; content: string }) =>
      updateSkillMarkdownRequest(skill.id, skill.current_version.id, content),
    onSuccess: async () => {
      await refresh();
      setEditing(null);
    },
  });
  const remove = useMutation({
    mutationFn: deleteSkillRequest,
    onSuccess: refresh,
  });

  async function openEditor(skill: SkillData) {
    const resource = await getSkillResourceRequest(skill.id, "SKILL.md");
    setMarkdown(resource.content);
    setEditing(skill);
  }

  return (
    <main className="tool-page" aria-labelledby="skills-title">
      <header className="tool-page-heading">
        <div>
          <span className="page-eyebrow">{t("eyebrow")}</span>
          <h1 id="skills-title">{t("title")}</h1>
          <p>{t("description")}</p>
        </div>
        <Upload
          accept=".zip,application/zip"
          beforeUpload={(file) => {
            upload.mutate(file);
            return false;
          }}
          maxCount={1}
          showUploadList={false}
        >
          <Button
            icon={<Plus aria-hidden size={17} />}
            loading={upload.isPending}
            type="primary"
          >
            {t("upload")}
          </Button>
        </Upload>
      </header>
      {upload.isError ? (
        <Alert
          className="tool-feedback"
          showIcon
          title={t("uploadFailed")}
          type="error"
        />
      ) : null}
      {skills.isPending ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : skills.isError ? (
        <Alert
          action={
            <Button onClick={() => void skills.refetch()}>{t("retry")}</Button>
          }
          showIcon
          title={t("listLoadFailed")}
          type="error"
        />
      ) : skills.data.items.length === 0 ? (
        <section className="tool-empty">
          <FileCode2 aria-hidden size={30} />
          <h2>{t("noSkills")}</h2>
          <p>{t("noSkillsDescription")}</p>
        </section>
      ) : (
        <div className="tool-list">
          {skills.data.items.map((skill) => (
            <article className="tool-row" key={skill.id}>
              <div className="tool-row-icon">
                <FileCode2 aria-hidden size={19} />
              </div>
              <div className="tool-row-content">
                <div className="tool-row-title">
                  <h2>{skill.name}</h2>
                  <span className="status-label">
                    v{skill.current_version.version_number}
                  </span>
                  {skill.status === "quarantined" ? (
                    <span className="status-label status-danger">
                      {t("quarantined")}
                    </span>
                  ) : null}
                </div>
                <p>{skill.description || t("noDescription")}</p>
                <small>
                  {t("filesAndSize", {
                    count: skill.current_version.file_count,
                    size: Math.ceil(
                      skill.current_version.uncompressed_size / 1024,
                    ),
                  })}
                </small>
              </div>
              <div className="tool-row-actions">
                <Switch
                  aria-label={t("enableStatus", { name: skill.name })}
                  checked={skill.enabled}
                  disabled={skill.status !== "ready"}
                  onChange={(enabled) =>
                    toggle.mutate({ id: skill.id, enabled })
                  }
                />
                <Button
                  aria-label={t("editLabel", { name: skill.name })}
                  icon={<Pencil aria-hidden size={16} />}
                  onClick={() => void openEditor(skill)}
                >
                  {t("edit")}
                </Button>
                <Button
                  aria-label={t("deleteLabel", { name: skill.name })}
                  danger
                  icon={<Trash2 aria-hidden size={16} />}
                  onClick={() =>
                    Modal.confirm({
                      title: t("deleteTitle"),
                      content: t("deleteDescription", { name: skill.name }),
                      okText: t("delete"),
                      okButtonProps: { danger: true },
                      cancelText: t("cancel"),
                      onOk: () => remove.mutateAsync(skill.id),
                    })
                  }
                >
                  {t("delete")}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal
        destroyOnHidden
        onCancel={() => setEditing(null)}
        onOk={() =>
          editing && edit.mutate({ skill: editing, content: markdown })
        }
        okText={t("saveNewVersion")}
        open={Boolean(editing)}
        title={editing ? t("editTitle", { name: editing.name }) : t("edit")}
        width={720}
        confirmLoading={edit.isPending}
      >
        <p className="modal-note">{t("versionNote")}</p>
        <label className="field-label" htmlFor="skill-markdown">
          SKILL.md
        </label>
        <Input.TextArea
          id="skill-markdown"
          rows={18}
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
        />
      </Modal>
    </main>
  );
}
