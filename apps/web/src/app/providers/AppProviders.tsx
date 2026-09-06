import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { App } from "../App";

import { AuthProvider } from "../../features/auth/AuthProvider";
import { PreferenceProvider } from "../../features/preferences/PreferenceProvider";
import { SiteDocumentTitle } from "../../features/site/SiteBrand";

const router = createBrowserRouter([
  {
    path: "*",
    element: (
      <AuthProvider>
        <PreferenceProvider>
          <App />
        </PreferenceProvider>
      </AuthProvider>
    ),
  },
]);

export function AppProviders() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SiteDocumentTitle />
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
