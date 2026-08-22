import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type PropsWithChildren } from "react";
import { BrowserRouter } from "react-router-dom";

import { AuthProvider } from "../../features/auth/AuthProvider";
import { PreferenceProvider } from "../../features/preferences/PreferenceProvider";

export function AppProviders({ children }: PropsWithChildren) {
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
      <BrowserRouter>
        <AuthProvider>
          <PreferenceProvider>{children}</PreferenceProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
