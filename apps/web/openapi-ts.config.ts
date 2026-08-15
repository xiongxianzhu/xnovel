import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "./openapi/openapi.json",
  output: "src/shared/api/generated",
  plugins: [
    {
      name: "@hey-api/client-axios",
      throwOnError: true,
    },
    "@hey-api/typescript",
    {
      name: "@hey-api/sdk",
      client: false,
    },
  ],
});
