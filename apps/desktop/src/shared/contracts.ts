export type { ThemeMode, ThemePalette } from "@xnovel/theme";
import type { ThemeMode, ThemePalette } from "@xnovel/theme";

export type DesktopProject = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};
export type DesktopDocument = {
  id: string;
  projectId: string;
  title: string;
  kind: "folder" | "manuscript" | "outline";
  position: number;
  createdAt: string;
  updatedAt: string;
};
export type DesktopContent = {
  documentId: string;
  content: string;
  version: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};
export type DesktopPreferences = {
  themePalette: ThemePalette;
  themeMode: ThemeMode;
};
export type LocalSkill = {
  directoryKey: string;
  directoryName: string;
  name: string;
  description: string;
  enabled: boolean;
  contentFingerprint: string;
  status: "ready" | "changed" | "invalid" | "missing";
  error?: string;
};
export type LocalSkillDetail = { skill: LocalSkill; skillMarkdown: string };
export type ProviderInput = {
  id?: string;
  displayName: string;
  protocol: "openai_chat";
  baseUrl: string;
  model: string;
  apiKey?: string;
};
export type ProviderSummary = {
  id: string;
  displayName: string;
  baseUrl: string;
  model: string;
  configured: boolean;
};
export type AiCandidate = {
  taskId: string;
  resultId: string;
  content: string;
  status: "candidate" | "applied" | "rejected";
};

export type XnovelDesktopApi = {
  projects: {
    list(): Promise<DesktopProject[]>;
    create(
      title: string,
    ): Promise<{ project: DesktopProject; document: DesktopDocument }>;
    documents(projectId: string): Promise<DesktopDocument[]>;
    content(documentId: string): Promise<DesktopContent>;
    save(
      documentId: string,
      content: string,
      version: number,
    ): Promise<DesktopContent>;
  };
  preferences: {
    get(): Promise<DesktopPreferences>;
    set(value: DesktopPreferences): Promise<DesktopPreferences>;
  };
  skills: {
    scan(): Promise<LocalSkill[]>;
    list(): Promise<LocalSkill[]>;
    detail(directoryKey: string): Promise<LocalSkillDetail>;
    setEnabled(
      directoryKey: string,
      enabled: boolean,
      fingerprint: string,
    ): Promise<LocalSkill[]>;
  };
  providers: {
    list(): Promise<ProviderSummary[]>;
    save(input: ProviderInput): Promise<ProviderSummary>;
  };
  ai: {
    run(input: {
      projectId: string;
      documentId: string;
      providerId: string;
      instruction: string;
      skillKeys: string[];
    }): Promise<AiCandidate>;
    decide(input: {
      resultId: string;
      decision: "apply" | "reject";
      documentId: string;
      version?: number;
    }): Promise<AiCandidate>;
  };
  backup: { create(): Promise<string>; restoreLatest(): Promise<boolean> };
  update: {
    check(): Promise<{ status: string; version?: string }>;
    download(): Promise<{ status: string }>;
    install(): Promise<void>;
  };
};
