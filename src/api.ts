import { Actor } from "@/data/actors";

const DEFAULT_API_BASE_URL = import.meta.env.PROD ? "/api" : "http://localhost:4010/api";
const API_BASE_URL = normalizeApiBaseUrl(import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE_URL);

function normalizeApiBaseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers, ...restOptions } = options ?? {};

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...restOptions,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error ?? `API error ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type AdminSession = {
  admin: {
    email: string;
    id: number;
    name: string;
  };
  token: string;
};

export type AuditLog = {
  id: number;
  action: string;
  adminEmail: string;
  createdAt: string;
  details: Record<string, unknown>;
  entityId?: string;
  entityType: string;
};

export type AiCastingFeedback = {
  actorId: string;
  actorName: string;
  adminEmail: string;
  createdAt: string;
  decision: "good" | "bad" | "maybe";
  id: number;
  note: string;
  prompt: string;
  promptAnalysis: CastingPromptAnalysis;
};

export type ActorApplication = {
  id: number;
  name: string;
  role: string;
  city: string;
  ageRange: string;
  height: string;
  weight: string;
  hairColor: string;
  languages: string[];
  skills: string[];
  genres?: string[];
  specialSkills?: string[];
  titles?: string[];
  summary: string;
  photo?: string;
  showreel?: string;
  contact: string;
  status: "new" | "review" | "approved" | "rejected";
  createdAt: string;
  updatedAt: string;
};

export type NewActorApplication = Omit<
  ActorApplication,
  "createdAt" | "id" | "status" | "updatedAt"
>;

export type CastingSearchResult = {
  actor: Actor;
  actorId: string;
  concerns?: string[];
  matched?: string[];
  reason: string;
  score: number;
};

export type CastingPromptAnalysis = {
  ageRange?: string;
  characterType?: string;
  concerns?: string[];
  gender?: string;
  genre?: string;
  languageNeeds?: string[];
  look?: string[];
  mustHave?: string[];
  niceToHave?: string[];
  rawSummary?: string;
  skills?: string[];
};

export type AiIndexStatus = {
  embeddingModel: string;
  enabled: boolean;
  indexedCount: number;
};

export type NewsPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  projectName?: string;
  coverImage?: string;
  status: "draft" | "published";
  publishedAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  viewCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type NewsPostInput = Omit<NewsPost, "createdAt" | "id" | "updatedAt" | "viewCount"> & {
  id?: number;
};

export type MediaFile = {
  createdAt: string;
  filename: string;
  references: string[];
  size: number;
  updatedAt: string;
  url: string;
};

export type SiteViewStats = {
  daily: number;
  monthly: number;
  total: number;
  weekly: number;
};

export async function fetchActorsFromApi() {
  const data = await request<{ actors: Actor[] }>("/actors");
  return data.actors;
}

export async function fetchNewsFromApi() {
  const data = await request<{ posts: NewsPost[] }>("/news");
  return data.posts;
}

export async function fetchNewsPostFromApi(slug: string) {
  const data = await request<{ post: NewsPost }>(`/news/${encodeURIComponent(slug)}`);
  return data.post;
}

export async function fetchSiteViewCount() {
  return request<SiteViewStats>("/analytics/site");
}

export async function recordSiteView() {
  return request<SiteViewStats & { counted: boolean }>("/analytics/site/view", {
    method: "POST",
  });
}

export async function recordActorProfileView(actorId: string) {
  return request<{ counted: boolean; viewCount: number }>(`/actors/${encodeURIComponent(actorId)}/view`, {
    method: "POST",
  });
}

export async function recordNewsPostView(slug: string) {
  return request<{ counted: boolean; viewCount: number }>(`/news/${encodeURIComponent(slug)}/view`, {
    method: "POST",
  });
}

export async function castingSearch(prompt: string, limit = 6) {
  return request<{
    analysis?: CastingPromptAnalysis;
    mode: "openai" | "rules";
    results: CastingSearchResult[];
  }>("/ai/casting-search", {
    body: JSON.stringify({ limit, prompt }),
    method: "POST",
  });
}

export async function loginAdmin(email: string, password: string) {
  return request<AdminSession>("/admin/login", {
    body: JSON.stringify({ email, password }),
    method: "POST",
  });
}

export async function createActorApplication(application: NewActorApplication) {
  const data = await request<{ application: ActorApplication }>("/applications", {
    body: JSON.stringify({ application }),
    method: "POST",
  });
  return data.application;
}

export async function fetchApplications(token?: string) {
  const data = await request<{ applications: ActorApplication[] }>("/admin/applications", {
    headers: authHeaders(token),
  });
  return data.applications;
}

export async function fetchAuditLogs(token?: string) {
  const data = await request<{ logs: AuditLog[] }>("/admin/audit-logs", {
    headers: authHeaders(token),
  });
  return data.logs;
}

export async function fetchAdminMedia(token?: string) {
  const data = await request<{ files: MediaFile[] }>("/admin/media", {
    headers: authHeaders(token),
  });
  return data.files;
}

export async function deleteAdminMedia(filename: string, token?: string) {
  return request<{ deleted: boolean; filename: string }>(`/admin/media/${encodeURIComponent(filename)}`, {
    headers: authHeaders(token),
    method: "DELETE",
  });
}

export async function fetchAdminNews(token?: string) {
  const data = await request<{ posts: NewsPost[] }>("/admin/news", {
    headers: authHeaders(token),
  });
  return data.posts;
}

export async function saveAdminNewsPost(post: NewsPostInput, token?: string) {
  const path = post.id ? `/admin/news/${post.id}` : "/admin/news";
  const data = await request<{ post: NewsPost }>(path, {
    body: JSON.stringify({ post }),
    headers: authHeaders(token),
    method: post.id ? "PUT" : "POST",
  });
  return data.post;
}

export async function deleteAdminNewsPost(id: number, token?: string) {
  return request<{ deleted: boolean }>(`/admin/news/${id}`, {
    headers: authHeaders(token),
    method: "DELETE",
  });
}

export async function fetchAiIndexStatus(token?: string) {
  return request<AiIndexStatus>("/admin/ai-index/status", {
    headers: authHeaders(token),
  });
}

export async function fetchAiCastingFeedback(token?: string) {
  const data = await request<{ feedback: AiCastingFeedback[] }>("/admin/ai-feedback", {
    headers: authHeaders(token),
  });
  return data.feedback;
}

export async function createAiCastingFeedback(
  feedback: {
    actorId: string;
    decision: AiCastingFeedback["decision"];
    note?: string;
    prompt: string;
    promptAnalysis?: CastingPromptAnalysis;
  },
  token?: string,
) {
  const data = await request<{ feedback: AiCastingFeedback }>("/admin/ai-feedback", {
    body: JSON.stringify(feedback),
    headers: authHeaders(token),
    method: "POST",
  });
  return data.feedback;
}

export async function reindexAiProfiles(token?: string) {
  return request<AiIndexStatus & { count: number }>("/admin/ai-index/reindex", {
    headers: authHeaders(token),
    method: "POST",
  });
}

export async function updateApplicationStatus(
  id: number,
  status: ActorApplication["status"],
  token?: string,
) {
  const data = await request<{ application: ActorApplication }>(`/admin/applications/${id}`, {
    body: JSON.stringify({ status }),
    headers: authHeaders(token),
    method: "PATCH",
  });
  return data.application;
}

export async function deleteApplication(id: number, token?: string) {
  return request<{ deleted: boolean }>(`/admin/applications/${id}`, {
    headers: authHeaders(token),
    method: "DELETE",
  });
}

export async function replaceActorsInApi(actors: Actor[], token?: string) {
  const data = await request<{ actors: Actor[] }>("/actors", {
    body: JSON.stringify({ actors }),
    headers: authHeaders(token),
    method: "PUT",
  });
  return data.actors;
}

export async function rateActorInApi(actorId: string, rating: number, voterId: string) {
  const data = await request<{ actor: Actor; vote: number }>(`/actors/${actorId}/rate`, {
    body: JSON.stringify({ rating, voterId }),
    method: "POST",
  });
  return data.actor;
}

export async function resetSeedInApi(token?: string) {
  const data = await request<{ actors: Actor[] }>("/admin/reset-seed", {
    headers: authHeaders(token),
    method: "POST",
  });
  return data.actors;
}

export async function uploadActorPhoto(file: File, token?: string) {
  const formData = new FormData();
  formData.append("photo", file);

  const response = await fetch(`${API_BASE_URL}/admin/uploads/photo`, {
    body: formData,
    headers: authHeaders(token),
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      throw new Error("Admin sessiyası bitib. Yenidən admin giriş edin və şəkli təkrar yükləyin.");
    }
    throw new Error(body.error ?? `Upload error ${response.status}`);
  }

  const data = (await response.json()) as { file: { url: string } };
  return data.file.url;
}

export function getActorQrSvgUrl(actorId: string) {
  return `${API_BASE_URL}/actors/${encodeURIComponent(actorId)}/qr.svg`;
}

export function getActorCardPdfUrl(actorId: string) {
  return `${API_BASE_URL}/actors/${encodeURIComponent(actorId)}/card.pdf`;
}
