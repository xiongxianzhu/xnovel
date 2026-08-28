import { Alert, Button, Input, Modal, Skeleton } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  listAdminSkillsRequest,
  quarantineSkillRequest,
  releaseSkillRequest,
} from "../../features/skills/skillsApi";

export function AdminSkillsPage() {
  const { t } = useTranslation("skills");
  const client = useQueryClient();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [reason, setReason] = useState("POLICY_REVIEW");
  const query = useQuery({
    queryKey: ["admin", "skills"],
    queryFn: listAdminSkillsRequest,
  });
  const refresh = () =>
    client.invalidateQueries({ queryKey: ["admin", "skills"] });
  const quarantine = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      quarantineSkillRequest(id, code),
    onSuccess: async () => {
      await refresh();
      setTarget(null);
    },
  });
  const release = useMutation({
    mutationFn: (id: string) => releaseSkillRequest(id, "REVIEW_COMPLETE"),
    onSuccess: refresh,
  });
  return (
    <main className="tool-page" aria-labelledby="admin-skills-title">
      <header className="tool-page-heading">
        <div>
          <span className="page-eyebrow">{t("adminEyebrow")}</span>
          <h1 id="admin-skills-title">{t("adminTitle")}</h1>
          <p>{t("adminDescription")}</p>
        </div>
      </header>
      {query.isPending ? (
        <Skeleton active paragraph={{ rows: 5 }} />
      ) : query.isError ? (
        <Alert
          action={
            <Button onClick={() => void query.refetch()}>{t("retry")}</Button>
          }
          showIcon
          title={t("metadataLoadFailed")}
          type="error"
        />
      ) : query.data.items.length === 0 ? (
        <section className="tool-empty">
          <ShieldCheck aria-hidden size={30} />
          <h2>{t("noAdminSkills")}</h2>
        </section>
      ) : (
        <div className="tool-list">
          {query.data.items.map((skill) => (
            <article className="tool-row" key={skill.id}>
              <div className="tool-row-icon">
                {skill.status === "quarantined" ? (
                  <ShieldAlert aria-hidden size={19} />
                ) : (
                  <ShieldCheck aria-hidden size={19} />
                )}
              </div>
              <div className="tool-row-content">
                <div className="tool-row-title">
                  <h2>{skill.name}</h2>
                  <span
                    className={`status-label ${skill.status === "quarantined" ? "status-danger" : ""}`}
                  >
                    {skill.status === "quarantined"
                      ? t("quarantined")
                      : t("normal")}
                  </span>
                </div>
                <p>{t("owner", { id: skill.owner_id })}</p>
                <small>
                  {skill.content_sha256.slice(0, 12)}… ·{" "}
                  {t("filesAndSize", {
                    count: skill.file_count,
                    size: Math.ceil(skill.uncompressed_size / 1024),
                  })}
                </small>
              </div>
              <div className="tool-row-actions">
                {skill.status === "quarantined" ? (
                  <Button onClick={() => release.mutate(skill.id)}>
                    {t("release")}
                  </Button>
                ) : (
                  <Button
                    danger
                    onClick={() =>
                      setTarget({ id: skill.id, name: skill.name })
                    }
                  >
                    {t("quarantine")}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      <Modal
        onCancel={() => setTarget(null)}
        onOk={() =>
          target && quarantine.mutate({ id: target.id, code: reason })
        }
        okButtonProps={{ danger: true }}
        okText={t("confirmQuarantine")}
        open={Boolean(target)}
        title={t("quarantineTitle")}
        confirmLoading={quarantine.isPending}
      >
        <p>{t("quarantineDescription", { name: target?.name })}</p>
        <label className="field-label" htmlFor="quarantine-reason">
          {t("reasonCode")}
        </label>
        <Input
          id="quarantine-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value.toUpperCase())}
        />
      </Modal>
    </main>
  );
}
