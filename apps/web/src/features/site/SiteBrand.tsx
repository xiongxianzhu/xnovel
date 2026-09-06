import { useEffect, useState } from "react";
import { resolveMediaUrl } from "../../shared/api/mediaUrl";
import { useSiteSettings } from "./useSiteSettings";

export function SiteBrand() {
  const { data } = useSiteSettings();
  const name = data?.site_name || "xnovel";
  const logo = resolveMediaUrl(data?.logo_url);
  const [failedLogo, setFailedLogo] = useState<string>();
  return (
    <span className="site-brand" title={name}>
      {logo && failedLogo !== logo ? (
        <img
          alt=""
          className="site-brand-logo"
          src={logo}
          onError={() => setFailedLogo(logo)}
        />
      ) : null}
      <span className="site-brand-name">{name}</span>
    </span>
  );
}

export function SiteDocumentTitle() {
  const { data } = useSiteSettings();
  const name = data?.site_name || "xnovel";
  useEffect(() => {
    document.title = name;
  }, [name]);
  return null;
}
