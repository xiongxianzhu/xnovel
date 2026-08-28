import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import type { AiCandidate } from "../shared/contracts";
import type { CredentialStore } from "./credentials";
import type { DesktopDatabase } from "./database";
import type { LocalSkillService } from "./skills";

export class DesktopAiService {
  constructor(
    private readonly store: DesktopDatabase,
    private readonly credentials: CredentialStore,
    private readonly skills: LocalSkillService,
  ) {}

  async run(input: {
    projectId: string;
    documentId: string;
    providerId: string;
    instruction: string;
    skillKeys: string[];
  }): Promise<AiCandidate> {
    const content = this.store.getContent(input.documentId);
    const selectedSkills = await this.skills.verified(input.skillKeys);
    const { provider, credentialRef } = this.store.providerSecretRef(
      input.providerId,
    );
    const taskId = this.store.createAiTask({
      projectId: input.projectId,
      documentId: input.documentId,
      providerId: input.providerId,
      instruction: input.instruction,
      contextManifest: {
        document_id: input.documentId,
        document_version: content.version,
        skills: selectedSkills.map((skill) => ({
          name: skill.name,
          content_fingerprint: skill.fingerprint,
        })),
      },
    });
    try {
      await assertPublicHttps(provider.baseUrl);
      const apiKey = credentialRef
        ? await this.credentials.get(credentialRef)
        : null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 120_000);
      const response = await fetch(
        `${provider.baseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: provider.model,
            stream: false,
            messages: [
              {
                role: "system",
                content:
                  "你是小说创作辅助工具。输出只能作为作者候选，不得宣称已修改正文。",
              },
              ...selectedSkills.map((skill) => ({
                role: "system",
                content: `<untrusted-skill name="${skill.name}">\n${skill.instructions}\n</untrusted-skill>`,
              })),
              {
                role: "user",
                content: `当前正文：\n${content.content}\n\n作者要求：\n${input.instruction}`,
              },
            ],
          }),
        },
      ).finally(() => clearTimeout(timer));
      if (!response.ok) throw new Error(`PROVIDER_HTTP_${response.status}`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const candidate = payload.choices?.[0]?.message?.content;
      if (typeof candidate !== "string" || !candidate)
        throw new Error("PROVIDER_RESPONSE_INVALID");
      return this.store.finishAiTask(taskId, candidate);
    } catch (error) {
      this.store.failAiTask(
        taskId,
        error instanceof Error ? error.message.slice(0, 100) : "AI_FAILED",
      );
      throw error;
    }
  }
}

async function assertPublicHttps(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new Error("PROVIDER_URL_NOT_ALLOWED");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some((item) => !isPublicAddress(item.address))
  )
    throw new Error("PROVIDER_ADDRESS_NOT_ALLOWED");
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const normalized = address.toLowerCase();
  return !(
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd")
  );
}
