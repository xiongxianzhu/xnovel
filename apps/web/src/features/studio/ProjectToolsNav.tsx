import { BookOpenText, Files, Search, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./studio.css";

export function ProjectToolsNav({ projectId }: { projectId: string }) {
  const { t } = useTranslation("studio");
  const base = `/projects/${projectId}`;
  return (
    <nav className="project-tools-nav" aria-label={t("studio")}>
      <Link to={`${base}/recall`}>
        <BookOpenText size={16} aria-hidden />
        {t("recall")}
      </Link>
      <Link to={`${base}/studio`}>
        <Files size={16} aria-hidden />
        {t("studio")}
      </Link>
      <Link to={`${base}/search`}>
        <Search size={16} aria-hidden />
        {t("search")}
      </Link>
      <Link to={`${base}/batches`}>
        <Sparkles size={16} aria-hidden />
        {t("batches")}
      </Link>
    </nav>
  );
}
