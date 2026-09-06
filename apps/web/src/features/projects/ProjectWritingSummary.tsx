import "./project-writing-summary.css";
import { useQuery } from "@tanstack/react-query";
import { BookOpenText } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";
import { getProjectRequest } from "./projectsApi";

export function ProjectWritingSummary({
  projectId,
  compact = false,
}: {
  projectId: string;
  compact?: boolean;
}) {
  const { t } = useTranslation("projects");
  const { data } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProjectRequest(projectId),
  });
  if (!data) return null;
  if (compact)
    return (
      <nav className="writing-breadcrumb" aria-label={t("viewDetails")}>
        <Link to="/projects">{t("backToProjects")}</Link>
        <span aria-hidden>/</span>
        <Link to={`/projects/${projectId}/details`}>{data.title}</Link>
      </nav>
    );
  return (
    <Link
      className="writing-book-summary"
      to={`/projects/${projectId}/details`}
    >
      {data.cover_url ? (
        <img alt="" src={resolveMediaUrl(data.cover_url)} />
      ) : (
        <BookOpenText aria-hidden size={32} />
      )}
      <span>
        <strong>{data.title}</strong>
        <span>{data.author || t("authorNotSet")}</span>
        <span>
          {t("chapterCount", { count: data.chapter_count })} ·{" "}
          {t("wordCount", { count: data.word_count })}
        </span>
        <span className="writing-book-details">{t("viewDetails")}</span>
      </span>
    </Link>
  );
}
