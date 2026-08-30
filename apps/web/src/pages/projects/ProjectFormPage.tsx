import { Alert, Button, Form, Input, Select, Skeleton, Upload } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImageUp, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createProjectRequest,
  deleteProjectCoverRequest,
  getProjectRequest,
  updateProjectRequest,
  uploadProjectCoverRequest,
} from "../../features/projects/projectsApi";
import type {
  ProjectCreateRequest,
  ProjectUpdateRequest,
} from "../../shared/api/generated/types.gen";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";

type Values = {
  author: string;
  description: string;
  structure_mode: "single_document" | "tree";
  title: string;
  update_status: "not_started" | "serializing" | "completed";
};

export function ProjectFormPage() {
  const { projectId } = useParams();
  const editing = Boolean(projectId);
  const { t } = useTranslation(["common", "projects"]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<Values>();
  const [cover, setCover] = useState<File>();
  const [coverPreview, setCoverPreview] = useState<string>();
  const [removeCover, setRemoveCover] = useState(false);
  const [error, setError] = useState<string>();
  const project = useQuery({
    enabled: editing,
    queryKey: ["project", projectId],
    queryFn: () => getProjectRequest(projectId!),
  });
  useEffect(
    () => () => {
      if (coverPreview?.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
    },
    [coverPreview],
  );
  const save = useMutation({
    mutationFn: async (values: Values) => {
      const saved = editing
        ? await updateProjectRequest(projectId!, values as ProjectUpdateRequest)
        : await createProjectRequest({
            ...values,
            update_status: "not_started",
          } as ProjectCreateRequest);
      if (removeCover) await deleteProjectCoverRequest(saved.id);
      else if (cover) await uploadProjectCoverRequest(saved.id, cover);
      return saved;
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["project", saved.id] });
      navigate(`/projects/${saved.id}/details`);
    },
    onError: () => setError(t("projects:mutationFailed")),
  });

  if (editing && project.isPending) {
    return (
      <main className="project-form-page">
        <Skeleton active paragraph={{ rows: 8 }} title />
      </main>
    );
  }
  if (editing && project.isError) {
    return (
      <main className="project-form-page">
        <Alert showIcon title={t("common:requestFailed")} type="error" />
      </main>
    );
  }

  const initial: Values = project.data
    ? {
        author: project.data.author,
        description: project.data.description,
        structure_mode: project.data.structure_mode,
        title: project.data.title,
        update_status: project.data.update_status,
      }
    : {
        author: "",
        description: "",
        structure_mode: "tree",
        title: "",
        update_status: "not_started",
      };

  return (
    <main className="project-form-page" aria-labelledby="project-form-title">
      <Link
        className="back-link"
        to={
          editing && projectId ? `/projects/${projectId}/details` : "/projects"
        }
      >
        <ArrowLeft aria-hidden size={17} />
        {t("projects:backToProjects")}
      </Link>
      <header className="page-heading">
        <h1 id="project-form-title">
          {t(
            editing
              ? "projects:editProjectTitle"
              : "projects:createProjectTitle",
          )}
        </h1>
      </header>
      {error ? <Alert showIcon title={error} type="error" /> : null}
      <Form<Values>
        form={form}
        initialValues={initial}
        layout="vertical"
        onFinish={(values) => save.mutate(values)}
        requiredMark={false}
      >
        <Form.Item
          label={t("projects:title")}
          name="title"
          rules={[{ required: true }, { max: 100 }]}
        >
          <Input maxLength={100} showCount />
        </Form.Item>
        <Form.Item
          label={t("projects:author")}
          name="author"
          rules={[{ max: 100 }]}
        >
          <Input maxLength={100} showCount />
        </Form.Item>
        <Form.Item
          label={t("projects:projectDescription")}
          name="description"
          rules={[{ max: 2000 }]}
        >
          <Input.TextArea maxLength={2000} rows={6} />
        </Form.Item>
        {editing ? (
          <Form.Item
            label={t("projects:updateStatusLabel")}
            name="update_status"
          >
            <Select
              options={["not_started", "serializing", "completed"].map(
                (value) => ({
                  label: t(`projects:updateStatus.${value}`),
                  value,
                }),
              )}
            />
          </Form.Item>
        ) : null}
        {!editing ? (
          <Form.Item label={t("projects:structureMode")} name="structure_mode">
            <Select
              options={[
                { label: t("projects:structure.tree"), value: "tree" },
                {
                  label: t("projects:structure.single_document"),
                  value: "single_document",
                },
              ]}
            />
          </Form.Item>
        ) : null}
        <Form.Item label={t("projects:cover")}>
          <Upload
            accept="image/png,image/jpeg,image/webp"
            beforeUpload={(file) => {
              if (coverPreview?.startsWith("blob:"))
                URL.revokeObjectURL(coverPreview);
              setCover(file);
              setCoverPreview(URL.createObjectURL(file));
              setRemoveCover(false);
              return false;
            }}
            maxCount={1}
          >
            <Button icon={<ImageUp aria-hidden size={16} />}>
              {t("projects:selectCover")}
            </Button>
          </Upload>
          {coverPreview || (project.data?.cover_url && !removeCover) ? (
            <img
              alt={t("projects:coverPreview")}
              className="project-cover-preview"
              src={coverPreview ?? resolveMediaUrl(project.data?.cover_url)}
            />
          ) : null}
          {project.data?.cover_url ? (
            <Button
              danger
              icon={<Trash2 aria-hidden size={16} />}
              onClick={() => {
                setCover(undefined);
                setRemoveCover(true);
              }}
              type="link"
            >
              {t("projects:removeCover")}
            </Button>
          ) : null}
        </Form.Item>
        <div className="project-form-actions">
          <Button onClick={() => navigate(-1)}>{t("common:cancel")}</Button>
          <Button htmlType="submit" loading={save.isPending} type="primary">
            {t("common:save")}
          </Button>
        </div>
      </Form>
    </main>
  );
}
