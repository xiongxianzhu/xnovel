import { z } from "zod";

const envSchema = z.object({
  VITE_API_BASE_URL: z.url().default("http://127.0.0.1:8000"),
});

export const env = envSchema.parse(import.meta.env);
