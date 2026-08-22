import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { AppProviders } from "./app/providers/AppProviders";
import { configureApiClient } from "./shared/api/client";
import { setLocale } from "./shared/i18n";
import { loadAppearance } from "./shared/storage/appearance";
import { applyAppearance } from "./shared/theme/appearance";
import "./shared/styles/global.css";

const initialAppearance = loadAppearance();
applyAppearance(initialAppearance);
void setLocale(initialAppearance.locale);
configureApiClient();

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element #root was not found");
}

createRoot(root).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);
