import { ChangeEvent, FormEvent, StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AdminSession,
  ActorApplication,
  AuditLog,
  AiCastingFeedback,
  AiIndexStatus,
  CastingPromptAnalysis,
  CastingSearchResult,
  createAiCastingFeedback,
  castingSearch,
  createActorApplication,
  deleteApplication,
  deleteAdminNewsPost,
  fetchAiCastingFeedback,
  fetchActorsFromApi,
  fetchAuditLogs,
  fetchAdminNews,
  fetchAiIndexStatus,
  fetchApplications,
  fetchNewsFromApi,
  getActorCardPdfUrl,
  getActorQrSvgUrl,
  loginAdmin,
  NewActorApplication,
  NewsPost,
  NewsPostInput,
  rateActorInApi,
  reindexAiProfiles,
  replaceActorsInApi,
  resetSeedInApi,
  saveAdminNewsPost,
  updateApplicationStatus,
  uploadActorPhoto,
} from "@/api";
import { Actor, initialActors } from "@/data/actors";
import "./styles.css";

const STORAGE_KEY = "aktyor-az-actors";
const VOTES_KEY = "aktyor-az-votes";
const SHORTLIST_KEY = "aktyor-az-shortlist";
const VOTER_KEY = "aktyor-az-voter-id";
const ADMIN_SESSION_KEY = "aktyor-az-admin-session";
const SITE_URL =
  import.meta.env.VITE_SITE_URL ??
  (typeof window !== "undefined" ? window.location.origin : "http://localhost:3010");

type SeoConfig = {
  canonical: string;
  description: string;
  jsonLd?: Record<string, unknown>;
  noindex?: boolean;
  ogImage?: string;
  title: string;
  type?: string;
};

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null;

  if (!element) {
    element = attributes.rel ? document.createElement("link") : document.createElement("meta");
    document.head.appendChild(element);
  }

  Object.entries(attributes).forEach(([key, value]) => element?.setAttribute(key, value));
}

function setJsonLd(data?: Record<string, unknown>) {
  const id = "aktyor-jsonld";
  document.getElementById(id)?.remove();

  if (!data) {
    return;
  }

  const script = document.createElement("script");
  script.id = id;
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

function setSeo(config: SeoConfig) {
  document.title = config.title;
  upsertMeta('meta[name="description"]', { content: config.description, name: "description" });
  upsertMeta('meta[name="robots"]', {
    content: config.noindex ? "noindex, nofollow" : "index, follow",
    name: "robots",
  });
  upsertMeta('link[rel="canonical"]', { href: config.canonical, rel: "canonical" });
  upsertMeta('meta[property="og:type"]', { content: config.type ?? "website", property: "og:type" });
  upsertMeta('meta[property="og:title"]', { content: config.title, property: "og:title" });
  upsertMeta('meta[property="og:description"]', {
    content: config.description,
    property: "og:description",
  });
  upsertMeta('meta[property="og:url"]', { content: config.canonical, property: "og:url" });
  upsertMeta('meta[property="og:site_name"]', { content: "Aktyor.az", property: "og:site_name" });
  upsertMeta('meta[property="og:image"]', {
    content: config.ogImage ?? `${SITE_URL}/og-default.png`,
    property: "og:image",
  });
  upsertMeta('meta[name="twitter:image"]', {
    content: config.ogImage ?? `${SITE_URL}/og-default.png`,
    name: "twitter:image",
  });
  upsertMeta('meta[name="twitter:card"]', { content: "summary_large_image", name: "twitter:card" });
  setJsonLd(config.jsonLd);
}

function cleanMetaText(value: string, maxLength: number) {
  const text = value.replace(/\uFFFC/g, "").replace(/\s+/g, " ").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trim()}…`;
}

function getRouteSeo(path: string, actors: Actor[], newsPosts: NewsPost[] = []): SeoConfig {
  const actorSlug = path.startsWith("/actors/") ? decodeURIComponent(path.replace("/actors/", "")) : "";
  const actorId = path.startsWith("/id/") ? decodeURIComponent(path.replace("/id/", "")) : "";
  const newsSlug = path.startsWith("/news/") ? decodeURIComponent(path.replace("/news/", "")) : "";
  const profileActor = actorSlug
    ? actors.find((actor) => actor.slug === actorSlug || slugify(actor.name) === actorSlug)
    : null;
  const idActor = actorId ? actors.find((actor) => actor.id === actorId) : null;
  const newsPost = newsSlug
    ? newsPosts.find((post) => post.slug === newsSlug && post.status === "published")
    : null;

  if (profileActor) {
    return {
      canonical: `${SITE_URL}/actors/${profileActor.slug}`,
      description: `${profileActor.name} - ${profileActor.role}, ${profileActor.city}. Yaş aralığı: ${profileActor.ageRange}, boy: ${profileActor.height}. Aktyor.az profili və kastinq məlumatları.`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Person",
        name: profileActor.name,
        jobTitle: profileActor.role,
        url: `${SITE_URL}/actors/${profileActor.slug}`,
        identifier: profileActor.id,
        image: profileActor.photo ?? `${SITE_URL}/og/actors/${profileActor.id}.svg`,
        description: profileActor.summary,
        height: profileActor.height,
        address: {
          "@type": "PostalAddress",
          addressLocality: profileActor.city,
          addressCountry: "AZ",
        },
        hasOccupation: {
          "@type": "Occupation",
          name: profileActor.role,
        },
        knowsLanguage: profileActor.languages,
      },
      ogImage: `${SITE_URL}/og/actors/${profileActor.id}.svg`,
      title: `${profileActor.name} - ${profileActor.role} | Aktyor.az`,
      type: "profile",
    };
  }

  if (idActor) {
    return {
      canonical: `${SITE_URL}/id/${idActor.id}`,
      description: `${idActor.name} üçün Aktyor.az rəqəmsal ID və təsdiq səhifəsi. Status: ${idActor.status}.`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        mainEntity: {
          "@type": "Person",
          identifier: idActor.id,
          name: idActor.name,
          jobTitle: idActor.role,
          image: idActor.photo ?? `${SITE_URL}/og/actors/${idActor.id}.svg`,
        },
      },
      ogImage: `${SITE_URL}/og/actors/${idActor.id}.svg`,
      title: `${idActor.id} - ${idActor.name} rəqəmsal ID | Aktyor.az`,
    };
  }

  if (path === "/actors") {
    return {
      canonical: `${SITE_URL}/actors`,
      description: "Azərbaycan aktyor və aktrisa kataloqu. Yaş, boy, şəhər, dil, bacarıq, reytinq və status üzrə kastinq filterləri.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Aktyor.az aktyor kataloqu",
        url: `${SITE_URL}/actors`,
      },
      ogImage: `${SITE_URL}/og-default.png`,
      title: "Aktyor kataloqu və kastinq filterləri | Aktyor.az",
    };
  }

  if (path === "/apply") {
    return {
      canonical: `${SITE_URL}/apply`,
      description: "Aktyor.az bazasına qoşulmaq üçün aktyor və aktrisa müraciət forması.",
      noindex: false,
      title: "Aktyor.az bazasına qoşul - Müraciət forması",
    };
  }

  if (path === "/news") {
    return {
      canonical: `${SITE_URL}/news`,
      description: "Aktyor.az aktyorlarının iştirak etdiyi kino, serial, reklam və yaradıcı layihələr haqqında xəbərlər.",
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Aktyor.az xəbərləri",
        url: `${SITE_URL}/news`,
      },
      title: "Xəbərlər - Aktyorlarımızın kino və layihələri | Aktyor.az",
    };
  }

  if (newsPost) {
    return {
      canonical: `${SITE_URL}/news/${newsPost.slug}`,
      description: cleanMetaText(newsPost.seoDescription || newsPost.excerpt, 190),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: newsPost.title,
        description: cleanMetaText(newsPost.seoDescription || newsPost.excerpt, 190),
        datePublished: newsPost.publishedAt || newsPost.createdAt,
        dateModified: newsPost.updatedAt,
        image: newsPost.coverImage ? [newsPost.coverImage] : [`${SITE_URL}/og-default.png`],
        mainEntityOfPage: `${SITE_URL}/news/${newsPost.slug}`,
        publisher: {
          "@type": "Organization",
          name: "Azərbaycan Aktyor və Aktrisa Bazası",
          logo: {
            "@type": "ImageObject",
            url: `${SITE_URL}/favicon.svg`,
          },
        },
      },
      ogImage: newsPost.coverImage || `${SITE_URL}/og-default.png`,
      title: cleanMetaText(newsPost.seoTitle || `${newsPost.title} | Aktyor.az xəbərləri`, 95),
      type: "article",
    };
  }

  if (path === "/casting-ai") {
    return {
      canonical: `${SITE_URL}/casting-ai`,
      description: "Rejissor və kastinq komandaları üçün AI əsaslı aktyor tövsiyə sistemi.",
      noindex: false,
      title: "AI kastinq axtarışı | Aktyor.az",
    };
  }

  if (path === "/shortlist" || path === "/admin") {
    return {
      canonical: `${SITE_URL}${path}`,
      description: "Aktyor.az idarəetmə və favorit profillər səhifəsi.",
      noindex: true,
      title: path === "/admin" ? "Admin panel | Aktyor.az" : "Favoritlər | Aktyor.az",
    };
  }

  return {
    canonical: `${SITE_URL}/`,
    description: "Aktyor və aktrisalar üçün kataloq, kastinq profilləri, rəqəmsal ID, QR və PDF təsdiq kart sistemi.",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Aktyor.az",
      url: SITE_URL,
      publisher: {
        "@type": "Organization",
        name: "Azərbaycan Aktyor və Aktrisa Bazası",
        url: SITE_URL,
      },
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/actors?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    ogImage: `${SITE_URL}/og-default.png`,
    title: "Aktyor.az - Azərbaycan Aktyor və Aktrisa Bazası",
  };
}


type ActorForm = {
  name: string;
  role: string;
  city: string;
  ageRange: string;
  height: string;
  weight: string;
  hairColor: string;
  languages: string;
  skills: string;
  genres: string;
  specialSkills: string;
  titles: string;
  browseCategories: string;
  status: Actor["status"];
  summary: string;
  aiBio: string;
  aiCameraExperience: string;
  aiDialects: string;
  aiEmotionalRange: string;
  aiLookNotes: string;
  aiLimitations: string;
  aiPerformanceNotes: string;
  aiStageExperience: string;
  aiTypecasts: string;
  showreel: string;
  contact: string;
  photo: string;
  gallery: string;
  rating: string;
  ratingCount: string;
  adminBoost: string;
  profileKind: NonNullable<Actor["profileKind"]>;
  featuredOrder: string;
  homeOrder: string;
  cardStatus: NonNullable<Actor["cardStatus"]>;
  cardIssuedAt: string;
  cardExpiresAt: string;
  membershipStatus: NonNullable<Actor["membershipStatus"]>;
  annualPaymentStatus: NonNullable<Actor["annualPaymentStatus"]>;
  annualPaymentDate: string;
  paymentManualConfirmed: boolean;
  paymentProvider: NonNullable<Actor["paymentProvider"]>;
  paymentReference: string;
};

const emptyForm: ActorForm = {
  name: "",
  role: "Aktyor",
  city: "Bakı",
  ageRange: "",
  height: "",
  weight: "",
  hairColor: "",
  languages: "Azərbaycan",
  skills: "Kino, Teatr",
  genres: "Dram, Komediya",
  specialSkills: "",
  titles: "",
  browseCategories: "",
  status: "review",
  summary: "",
  aiBio: "",
  aiCameraExperience: "",
  aiDialects: "",
  aiEmotionalRange: "",
  aiLookNotes: "",
  aiLimitations: "",
  aiPerformanceNotes: "",
  aiStageExperience: "",
  aiTypecasts: "",
  showreel: "",
  contact: "",
  photo: "",
  gallery: "",
  rating: "0",
  ratingCount: "0",
  adminBoost: "0",
  profileKind: "real",
  featuredOrder: "",
  homeOrder: "",
  cardStatus: "active",
  cardIssuedAt: "",
  cardExpiresAt: "",
  membershipStatus: "active",
  annualPaymentStatus: "paid",
  annualPaymentDate: "",
  paymentManualConfirmed: false,
  paymentProvider: "manual",
  paymentReference: "",
};

type NewsForm = {
  id?: number;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  projectName: string;
  coverImage: string;
  status: NewsPost["status"];
  publishedAt: string;
  seoTitle: string;
  seoDescription: string;
};

const emptyNewsForm: NewsForm = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  projectName: "",
  coverImage: "",
  status: "draft",
  publishedAt: new Date().toISOString().slice(0, 10),
  seoTitle: "",
  seoDescription: "",
};

function readActors() {
  try {
    const savedActors = window.localStorage.getItem(STORAGE_KEY);
    if (!savedActors) {
      return initialActors;
    }

    const parsedActors = (JSON.parse(savedActors) as Partial<Actor>[]).map(normalizeActor);
    const savedIds = new Set(parsedActors.map((actor) => actor.id));
    const missingDemoActors = initialActors.filter((actor) => !savedIds.has(actor.id));

    return [...parsedActors, ...missingDemoActors];
  } catch {
    return initialActors;
  }
}

function normalizeActor(actor: Partial<Actor>): Actor {
  const fallback = initialActors.find((item) => item.id === actor.id);

  return {
    id: actor.id ?? fallback?.id ?? "AAAB-000000",
    slug: actor.slug ?? fallback?.slug ?? "unknown",
    initials: actor.initials ?? fallback?.initials ?? "AA",
    name: actor.name ?? fallback?.name ?? "Adsız profil",
    role: actor.role ?? fallback?.role ?? "Aktyor",
    city: actor.city ?? fallback?.city ?? "Bakı",
    ageRange: actor.ageRange ?? fallback?.ageRange ?? "",
    height: actor.height ?? fallback?.height ?? "",
    weight: actor.weight ?? fallback?.weight ?? "",
    hairColor: actor.hairColor ?? fallback?.hairColor ?? "",
    languages: actor.languages ?? fallback?.languages ?? [],
    skills: actor.skills ?? fallback?.skills ?? [],
    genres: actor.genres ?? fallback?.genres ?? [],
    specialSkills: actor.specialSkills ?? fallback?.specialSkills ?? [],
    titles: actor.titles ?? fallback?.titles ?? [],
    browseCategories: actor.browseCategories ?? fallback?.browseCategories ?? [],
    status: actor.status ?? fallback?.status ?? "review",
    summary: actor.summary ?? fallback?.summary ?? "",
    aiBio: actor.aiBio ?? fallback?.aiBio ?? "",
    aiProfile: actor.aiProfile ?? fallback?.aiProfile ?? {},
    photo: actor.photo ?? fallback?.photo,
    gallery: actor.gallery ?? fallback?.gallery ?? [],
    showreel: actor.showreel ?? fallback?.showreel,
    contact: actor.contact ?? fallback?.contact,
    rating: actor.rating ?? fallback?.rating ?? 0,
    ratingCount: actor.ratingCount ?? fallback?.ratingCount ?? 0,
    adminBoost: actor.adminBoost ?? fallback?.adminBoost ?? 0,
    profileKind: actor.profileKind ?? fallback?.profileKind ?? "real",
    featuredOrder: actor.featuredOrder ?? fallback?.featuredOrder,
    homeOrder: actor.homeOrder ?? fallback?.homeOrder,
    cardStatus: actor.cardStatus ?? fallback?.cardStatus ?? "active",
    cardIssuedAt: actor.cardIssuedAt ?? fallback?.cardIssuedAt ?? "",
    cardExpiresAt: actor.cardExpiresAt ?? fallback?.cardExpiresAt ?? "",
    membershipStatus: actor.membershipStatus ?? fallback?.membershipStatus ?? "active",
    annualPaymentStatus: actor.annualPaymentStatus ?? fallback?.annualPaymentStatus ?? "paid",
    annualPaymentDate: actor.annualPaymentDate ?? fallback?.annualPaymentDate ?? "",
    paymentManualConfirmed: actor.paymentManualConfirmed ?? fallback?.paymentManualConfirmed ?? false,
    paymentProvider: actor.paymentProvider ?? fallback?.paymentProvider ?? "manual",
    paymentReference: actor.paymentReference ?? fallback?.paymentReference ?? "",
  };
}

function effectiveRating(actor: Actor) {
  return Math.min(5, Math.max(0, actor.rating + actor.adminBoost));
}

function sortByRating(actorList: Actor[]) {
  return [...actorList].sort((first, second) => {
    const ratingDiff = effectiveRating(second) - effectiveRating(first);

    if (ratingDiff !== 0) {
      return ratingDiff;
    }

    return second.ratingCount - first.ratingCount;
  });
}

function isDateExpired(dateValue?: string) {
  if (!dateValue) {
    return false;
  }

  const endOfDay = new Date(`${dateValue}T23:59:59`);
  return Number.isFinite(endOfDay.getTime()) && endOfDay < new Date();
}

function getCardVerificationState(actor: Actor) {
  const expired = isDateExpired(actor.cardExpiresAt);
  const isActive =
    actor.status !== "inactive" &&
    actor.cardStatus !== "inactive" &&
    actor.membershipStatus === "active" &&
    actor.annualPaymentStatus === "paid" &&
    Boolean(actor.paymentManualConfirmed || actor.paymentProvider === "online") &&
    !expired;

  const reason = actor.cardStatus === "inactive"
    ? "Kart admin tərəfindən ləğv edilib"
    : actor.status === "inactive"
      ? "Profil deaktivdir"
      : actor.membershipStatus === "cancelled"
        ? "Üzvlük ləğv edilib"
        : actor.membershipStatus === "expired" || expired
          ? "Kartın və ya üzvlüyün müddəti bitib"
          : actor.membershipStatus === "pending"
            ? "Üzvlük təsdiq gözləyir"
            : actor.annualPaymentStatus !== "paid"
              ? "İllik üzvlük ödənişi aktiv deyil"
              : !actor.paymentManualConfirmed && actor.paymentProvider !== "online"
                ? "Ödəniş admin tərəfindən təsdiqlənməyib"
              : "Kart aktivdir";

  return { expired, isActive, reason };
}

function getTopActors(actorList: Actor[]) {
  const rankedActors = sortByRating(actorList);
  const manualActors = rankedActors
    .filter((actor) => actor.featuredOrder && actor.featuredOrder >= 1 && actor.featuredOrder <= 5)
    .sort((first, second) => (first.featuredOrder ?? 99) - (second.featuredOrder ?? 99));
  const manualIds = new Set(manualActors.map((actor) => actor.id));
  const fallbackActors = rankedActors.filter((actor) => !manualIds.has(actor.id));

  return [...manualActors, ...fallbackActors].slice(0, 5);
}

function getHomeCollageActors(actorList: Actor[]) {
  const rankedActors = sortByRating(actorList);
  const manualActors = rankedActors
    .filter((actor) => actor.homeOrder && actor.homeOrder >= 1 && actor.homeOrder <= 6)
    .sort((first, second) => (first.homeOrder ?? 99) - (second.homeOrder ?? 99));
  const manualIds = new Set(manualActors.map((actor) => actor.id));
  const fallbackActors = rankedActors.filter((actor) => !manualIds.has(actor.id));

  return [...manualActors, ...fallbackActors].slice(0, 6);
}

function actorMatchesQuery(actor: Actor, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("az");
  const aiProfile = actor.aiProfile ?? {};

  if (!normalizedQuery) {
    return true;
  }

  return [
    actor.name,
    actor.id,
    actor.role,
    actor.city,
    actor.ageRange,
    actor.height,
    actor.weight,
    actor.hairColor,
    actor.aiBio ?? "",
    aiProfile.cameraExperience ?? "",
    aiProfile.lookNotes ?? "",
    aiProfile.performanceNotes ?? "",
    aiProfile.stageExperience ?? "",
  ]
    .concat(
      actor.languages,
      actor.skills,
      actor.genres ?? [],
      actor.specialSkills ?? [],
      actor.titles ?? [],
      aiProfile.dialects ?? [],
      aiProfile.emotionalRange ?? [],
      aiProfile.limitations ?? [],
      aiProfile.typecasts ?? [],
    )
    .some((value) => value.toLocaleLowerCase("az").includes(normalizedQuery));
}

function newestAdminActorFirst(first: Actor, second: Actor) {
  const firstTime = Date.parse(first.createdAt ?? "") || Number(first.id.match(/\d+/)?.[0] ?? 0);
  const secondTime = Date.parse(second.createdAt ?? "") || Number(second.id.match(/\d+/)?.[0] ?? 0);

  if (firstTime !== secondTime) {
    return secondTime - firstTime;
  }

  return first.name.localeCompare(second.name, "az");
}

function auditActionLabel(action: string) {
  const labels: Record<string, string> = {
    actor_create: "Profil yaradıldı",
    actor_delete: "Profil silindi",
    actor_update: "Profil yeniləndi",
    actor_visibility_update: "Kart/üzvlük/status yeniləndi",
    ai_casting_feedback: "AI feedback verildi",
    ai_index_rebuild: "AI indeksi yeniləndi",
    application_delete: "Müraciət silindi",
    application_status_update: "Müraciət statusu dəyişdi",
    news_create: "Xəbər yaradıldı",
    news_delete: "Xəbər silindi",
    news_update: "Xəbər yeniləndi",
    rating_update: "Reytinq müdaxiləsi",
    reset_seed: "Demo baza sıfırlandı",
  };

  return labels[action] ?? action;
}

function auditDetailLines(log: AuditLog) {
  const details = log.details ?? {};
  const lines: string[] = [];

  if (details.name) lines.push(`Profil: ${String(details.name)}`);
  if (details.status) lines.push(`Status: ${String(details.status)}`);
  if (details.cardStatus) lines.push(`Kart: ${String(details.cardStatus)}`);
  if (details.membershipStatus) lines.push(`Üzvlük: ${String(details.membershipStatus)}`);
  if (details.annualPaymentStatus) lines.push(`Ödəniş: ${String(details.annualPaymentStatus)}`);
  if (details.annualPaymentDate) lines.push(`Ödəniş tarixi: ${String(details.annualPaymentDate)}`);
  if (typeof details.paymentManualConfirmed === "boolean") {
    lines.push(`Manual təsdiq: ${details.paymentManualConfirmed ? "var" : "yoxdur"}`);
  }
  if (details.paymentProvider) lines.push(`Mənbə: ${String(details.paymentProvider)}`);
  if (details.paymentReference) lines.push(`Referans: ${String(details.paymentReference)}`);
  if (details.cardIssuedAt) lines.push(`Kart verilib: ${String(details.cardIssuedAt)}`);
  if (details.cardExpiresAt) lines.push(`Kart bitir: ${String(details.cardExpiresAt)}`);
  if (details.decision) lines.push(`Qərar: ${String(details.decision)}`);

  if (details.before && details.after) {
    lines.push(`Əvvəl: ${JSON.stringify(details.before)}`);
    lines.push(`Sonra: ${JSON.stringify(details.after)}`);
  }

  return lines.length ? lines : [JSON.stringify(details)];
}

function isCardOrPaymentAudit(log: AuditLog) {
  const keys = Object.keys(log.details ?? {});
  return log.action === "actor_visibility_update" && keys.some((key) =>
    ["cardStatus", "cardIssuedAt", "cardExpiresAt", "membershipStatus", "annualPaymentStatus", "annualPaymentDate", "paymentManualConfirmed", "paymentProvider", "paymentReference"].includes(key),
  );
}

function getUniqueValues(actors: Actor[], key: "role" | "city") {
  return [...new Set(actors.map((actor) => actor[key]).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
}

function getUniqueListValues(actors: Actor[], key: "languages" | "skills" | "browseCategories") {
  return [...new Set(actors.flatMap((actor) => actor[key] ?? []).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "az"),
  );
}

function parseRange(value: string) {
  const numbers = value.match(/\d+/g)?.map(Number) ?? [];

  if (!numbers.length) {
    return null;
  }

  return {
    max: numbers[1] ?? numbers[0],
    min: numbers[0],
  };
}

function parseNumber(value: string) {
  return Number(value.match(/\d+/)?.[0] ?? 0);
}

function actorMatchesAge(actor: Actor, minAge: string, maxAge: string) {
  const range = parseRange(actor.ageRange);
  const min = Number(minAge || 0);
  const max = Number(maxAge || 0);

  if (!range) {
    return !min && !max;
  }

  if (min && range.max < min) {
    return false;
  }

  if (max && range.min > max) {
    return false;
  }

  return true;
}

function actorMatchesHeight(actor: Actor, minHeight: string, maxHeight: string) {
  const height = parseNumber(actor.height);
  const min = Number(minHeight || 0);
  const max = Number(maxHeight || 0);

  if (!height) {
    return !min && !max;
  }

  return (!min || height >= min) && (!max || height <= max);
}

function actorMatchesWeight(actor: Actor, minWeight: string, maxWeight: string) {
  const weight = parseNumber(actor.weight ?? "");
  const min = Number(minWeight || 0);
  const max = Number(maxWeight || 0);

  if (!weight) {
    return !min && !max;
  }

  return (!min || weight >= min) && (!max || weight <= max);
}

function getActorScoreRisk(actor: Actor) {
  if (Math.abs(actor.adminBoost) >= 0.7) {
    return "Yüksək admin düzəlişi";
  }

  if (effectiveRating(actor) >= 4.8 && actor.ratingCount < 12) {
    return "Az səslə yüksək reytinq";
  }

  return "";
}

function saveActors(nextActors: Actor[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextActors));
}

function readVotes() {
  try {
    const savedVotes = window.localStorage.getItem(VOTES_KEY);
    return savedVotes ? (JSON.parse(savedVotes) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveVotes(nextVotes: Record<string, number>) {
  window.localStorage.setItem(VOTES_KEY, JSON.stringify(nextVotes));
}

function readShortlist() {
  try {
    const savedShortlist = window.localStorage.getItem(SHORTLIST_KEY);
    return savedShortlist ? (JSON.parse(savedShortlist) as string[]) : [];
  } catch {
    return [];
  }
}

function saveShortlist(nextShortlist: string[]) {
  window.localStorage.setItem(SHORTLIST_KEY, JSON.stringify(nextShortlist));
}

function getVoterId() {
  const savedVoterId = window.localStorage.getItem(VOTER_KEY);

  if (savedVoterId) {
    return savedVoterId;
  }

  const nextVoterId = crypto.randomUUID();
  window.localStorage.setItem(VOTER_KEY, nextVoterId);
  return nextVoterId;
}

function readAdminSession() {
  try {
    const savedSession = window.localStorage.getItem(ADMIN_SESSION_KEY);
    return savedSession ? (JSON.parse(savedSession) as AdminSession) : null;
  } catch {
    return null;
  }
}

function saveAdminSession(session: AdminSession | null) {
  if (!session) {
    window.localStorage.removeItem(ADMIN_SESSION_KEY);
    return;
  }

  window.localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("az")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toLocaleUpperCase("az");
}

function makeId(existingActors: Actor[]) {
  const nextNumber =
    existingActors.reduce((max, actor) => {
      const number = Number(actor.id.replace("AAAB-", ""));
      return Number.isFinite(number) ? Math.max(max, number) : max;
    }, 123) + 1;

  return `AAAB-${String(nextNumber).padStart(6, "0")}`;
}

function formToActor(form: ActorForm, existingActors: Actor[], currentId?: string): Actor {
  const id = currentId ?? makeId(existingActors);
  const slugBase = slugify(form.name) || id.toLowerCase();
  const duplicateSlug = existingActors.some(
    (actor) => actor.slug === slugBase && actor.id !== currentId,
  );
  const splitList = (value: string) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  return {
    id,
    slug: duplicateSlug ? `${slugBase}-${id.toLowerCase()}` : slugBase,
    initials: makeInitials(form.name) || "AA",
    name: form.name.trim(),
    role: form.role,
    city: form.city.trim(),
    ageRange: form.ageRange.trim(),
    height: form.height.trim(),
    weight: form.weight.trim(),
    hairColor: form.hairColor.trim(),
    languages: splitList(form.languages),
    skills: splitList(form.skills),
    genres: splitList(form.genres),
    specialSkills: splitList(form.specialSkills),
    titles: splitList(form.titles),
    browseCategories: splitList(form.browseCategories),
    status: form.status,
    summary: form.summary.trim(),
    aiBio: form.aiBio.trim(),
    aiProfile: {
      cameraExperience: form.aiCameraExperience.trim(),
      dialects: splitList(form.aiDialects),
      emotionalRange: splitList(form.aiEmotionalRange),
      lookNotes: form.aiLookNotes.trim(),
      limitations: splitList(form.aiLimitations),
      performanceNotes: form.aiPerformanceNotes.trim(),
      stageExperience: form.aiStageExperience.trim(),
      typecasts: splitList(form.aiTypecasts),
    },
    showreel: form.showreel.trim(),
    contact: form.contact.trim(),
    photo: form.photo,
    gallery: form.gallery
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean),
    rating: Math.min(5, Math.max(0, Number(form.rating) || 0)),
    ratingCount: Math.max(0, Math.round(Number(form.ratingCount) || 0)),
    adminBoost: Math.min(1, Math.max(-1, Number(form.adminBoost) || 0)),
    profileKind: form.profileKind,
    featuredOrder: form.featuredOrder
      ? Math.min(5, Math.max(1, Math.round(Number(form.featuredOrder) || 0)))
      : undefined,
    homeOrder: form.homeOrder
      ? Math.min(6, Math.max(1, Math.round(Number(form.homeOrder) || 0)))
      : undefined,
    cardStatus: form.cardStatus,
    cardIssuedAt: form.cardIssuedAt,
    cardExpiresAt: form.cardExpiresAt,
    membershipStatus: form.membershipStatus,
    annualPaymentStatus: form.annualPaymentStatus,
    annualPaymentDate: form.annualPaymentDate,
    paymentManualConfirmed: form.paymentManualConfirmed,
    paymentProvider: form.paymentProvider,
    paymentReference: form.paymentReference.trim(),
  };
}

function actorToForm(actor: Actor): ActorForm {
  const aiProfile = actor.aiProfile ?? {};

  return {
    name: actor.name,
    role: actor.role,
    city: actor.city,
    ageRange: actor.ageRange,
    height: actor.height,
    weight: actor.weight ?? "",
    hairColor: actor.hairColor ?? "",
    languages: actor.languages.join(", "),
    skills: actor.skills.join(", "),
    genres: (actor.genres ?? []).join(", "),
    specialSkills: (actor.specialSkills ?? []).join(", "),
    titles: (actor.titles ?? []).join(", "),
    browseCategories: (actor.browseCategories ?? []).join(", "),
    status: actor.status,
    summary: actor.summary,
    aiBio: actor.aiBio ?? "",
    aiCameraExperience: aiProfile.cameraExperience ?? "",
    aiDialects: (aiProfile.dialects ?? []).join(", "),
    aiEmotionalRange: (aiProfile.emotionalRange ?? []).join(", "),
    aiLookNotes: aiProfile.lookNotes ?? "",
    aiLimitations: (aiProfile.limitations ?? []).join(", "),
    aiPerformanceNotes: aiProfile.performanceNotes ?? "",
    aiStageExperience: aiProfile.stageExperience ?? "",
    aiTypecasts: (aiProfile.typecasts ?? []).join(", "),
    showreel: actor.showreel ?? "",
    contact: actor.contact ?? "",
    photo: actor.photo ?? "",
    gallery: (actor.gallery ?? []).join("\n"),
    rating: String(actor.rating),
    ratingCount: String(actor.ratingCount),
    adminBoost: String(actor.adminBoost),
    profileKind: actor.profileKind ?? "real",
    featuredOrder: actor.featuredOrder ? String(actor.featuredOrder) : "",
    homeOrder: actor.homeOrder ? String(actor.homeOrder) : "",
    cardStatus: actor.cardStatus ?? "active",
    cardIssuedAt: actor.cardIssuedAt ?? "",
    cardExpiresAt: actor.cardExpiresAt ?? "",
    membershipStatus: actor.membershipStatus ?? "active",
    annualPaymentStatus: actor.annualPaymentStatus ?? "paid",
    annualPaymentDate: actor.annualPaymentDate ?? "",
    paymentManualConfirmed: actor.paymentManualConfirmed ?? false,
    paymentProvider: actor.paymentProvider ?? "manual",
    paymentReference: actor.paymentReference ?? "",
  };
}

function newsToForm(post: NewsPost): NewsForm {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    projectName: post.projectName ?? "",
    coverImage: post.coverImage ?? "",
    status: post.status,
    publishedAt: post.publishedAt ?? "",
    seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "",
  };
}

function formToNewsPost(form: NewsForm): NewsPostInput {
  return {
    id: form.id,
    title: form.title.trim(),
    slug: slugify(form.slug || form.title),
    excerpt: form.excerpt.trim(),
    content: form.content.trim(),
    projectName: form.projectName.trim(),
    coverImage: form.coverImage.trim() || undefined,
    status: form.status,
    publishedAt: form.publishedAt,
    seoTitle: form.seoTitle.trim(),
    seoDescription: form.seoDescription.trim(),
  };
}

function Header() {
  const currentPath = window.location.pathname;
  const isActive = (href: string) =>
    href === "/" ? currentPath === "/" : currentPath === href || currentPath.startsWith(`${href}/`);

  return (
    <header className="site-header">
      <a className="brand" href="/">
        <img className="brand-mark" src="/aaab-logo.svg" alt="AAAb" width="140" height="49" />
        <span className="brand-divider" aria-hidden="true" />
        <span className="brand-text">
          <span>Azərbaycan Aktyor</span>
          <span>və Aktrisa Bazası</span>
        </span>
      </a>
      <nav className="nav" aria-label="Əsas menyu">
        <a className={isActive("/") ? "nav-link active" : "nav-link"} href="/">
          Sərlövhə
        </a>
        <a className={isActive("/actors") ? "nav-link active" : "nav-link"} href="/actors">
          Baza
        </a>
        <a className={isActive("/shortlist") ? "nav-link active" : "nav-link"} href="/shortlist">
          Favoritlər
        </a>
        <a className={isActive("/news") ? "nav-link active" : "nav-link"} href="/news">
          Xəbərlər
        </a>
        <a className={isActive("/apply") ? "nav-link active" : "nav-link"} href="/apply">
          Bazaya qoşul
        </a>
        <a className={isActive("/casting-ai") ? "nav-link active" : "nav-link"} href="/casting-ai">
          AI kastinq
        </a>
      </nav>
    </header>
  );
}

function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [shownValue, setShownValue] = useState(0);

  useEffect(() => {
    let animationFrame = 0;
    const duration = 900;
    const startedAt = performance.now();

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setShownValue(Math.round(value * easedProgress));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    }

    animationFrame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationFrame);
  }, [value]);

  return (
    <>
      {shownValue}
      {suffix}
    </>
  );
}

function shuffleActors(actors: Actor[], randomRanks: Map<string, number>) {
  return [...actors]
    .sort((first, second) => (randomRanks.get(first.id) ?? 0) - (randomRanks.get(second.id) ?? 0));
}

function Portrait({ actor }: { actor: Actor }) {
  if (actor.photo) {
    return <img className="portrait photo" src={actor.photo} alt={actor.name} />;
  }

  return <div className="portrait">{actor.initials}</div>;
}

function ActorCard({
  actor,
  isShortlisted,
  onToggleShortlist,
}: {
  actor: Actor;
  isShortlisted: boolean;
  onToggleShortlist: (actorId: string) => void;
}) {
  const shownRating = effectiveRating(actor);

  return (
    <article className="actor-card">
      <a className="actor-card-link" href={`/actors/${actor.slug}`}>
        <Portrait actor={actor} />
        <div className="actor-info">
          <div className="card-title-row">
            <h3>{actor.name}</h3>
            <span className="score-chip">★ {shownRating.toFixed(1)}</span>
          </div>
          <p>
            {actor.role} · {actor.city} · {actor.ageRange}
          </p>
          <div className="badge-row">
            {actor.status === "verified" && <span className="badge success">Təsdiqlənib</span>}
            {actor.status === "review" && <span className="badge warning">Yoxlanılır</span>}
            {actor.status === "inactive" && <span className="badge muted">Deaktiv</span>}
            <span className="badge">{actor.id}</span>
          </div>
        </div>
      </a>
      <button
        className={isShortlisted ? "shortlist-button active" : "shortlist-button"}
        onClick={() => onToggleShortlist(actor.id)}
        type="button"
      >
        {isShortlisted ? "Favoritdə" : "Favorit et"}
      </button>
    </article>
  );
}

function HomePage({
  actors,
  shortlist,
  onToggleShortlist,
}: {
  actors: Actor[];
  shortlist: string[];
  onToggleShortlist: (actorId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const publicActors = sortByRating(actors.filter((actor) => actor.status !== "inactive"));
  const filteredActors = publicActors.filter(
    (actor) =>
      actorMatchesQuery(actor, query) &&
      (!role || actor.role === role) &&
      (!city || actor.city === city),
  );
  const collageActors = getHomeCollageActors(publicActors);
  const verifiedCount = actors.filter((actor) => actor.status === "verified").length;
  const actorCount = publicActors.filter((actor) => actor.role.toLowerCase() === "aktyor").length;
  const actressCount = publicActors.filter((actor) => actor.role.toLowerCase() === "aktrisa").length;
  const childActorCount = publicActors.filter((actor) => actor.role.toLowerCase().includes("uşaq")).length;
  const cities = getUniqueValues(publicActors, "city");
  const roles = getUniqueValues(publicActors, "role");
  const showreelCount = publicActors.filter((actor) => actor.showreel).length;

  return (
    <main className="page-shell">
      <Header />
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Azərbaycan aktyor və aktrisa bazası</p>
          <h1>Aktyor profili, kastinq bazası və rəqəmsal təsdiq kartı.</h1>
          <p className="lead">
            Rejissor və kastinq komandaları üçün sürətli axtarış, aktyorlar üçün isə
            paylaşılabilən vizitkart və rəsmi ID səhifəsi.
          </p>
          <div className="hero-actions">
            <a className="button" href="/actors">
              Aktyorları kəşf et
            </a>
            <a className="button secondary" href="/casting-ai">
              AI ilə kastinq seç
            </a>
            <a className="button secondary" href="/apply">
              Bazaya qoşul
            </a>
          </div>
          <div className="stat-strip">
            <div>
              <strong><AnimatedCounter value={actors.length} /></strong>
              <span>profil</span>
            </div>
            <div>
              <strong><AnimatedCounter value={verifiedCount} /></strong>
              <span>təsdiqli</span>
            </div>
            <div>
              <strong><AnimatedCounter value={shortlist.length} /></strong>
              <span>favorit</span>
            </div>
            <div>
              <strong><AnimatedCounter value={actorCount} /></strong>
              <span>aktyor</span>
            </div>
            <div>
              <strong><AnimatedCounter value={actressCount} /></strong>
              <span>aktrisa</span>
            </div>
            <div>
              <strong><AnimatedCounter value={childActorCount} /></strong>
              <span>uşaq</span>
            </div>
          </div>
        </div>

        <div className="hero-collage" aria-label="Seçilmiş aktyor profilləri">
          {collageActors.map((actor, index) => (
            <a
              className={`collage-card collage-card-${index + 1}`}
              href={`/actors/${actor.slug}`}
              key={actor.id}
            >
              {actor.photo ? (
                <img src={actor.photo} alt={actor.name} />
              ) : (
                <span className="collage-initials">{actor.initials}</span>
              )}
              <span className="collage-meta">
                <strong>{actor.name}</strong>
                <small>
                  {actor.role} · ★ {effectiveRating(actor).toFixed(1)}
                </small>
              </span>
            </a>
          ))}
          <div className="collage-insight">
            <strong>{showreelCount || verifiedCount}</strong>
            <span>{showreelCount ? "showreel olan profil" : "təsdiqli profil"}</span>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="home-search-band">
          <div>
            <h2>Sürətli seçim</h2>
            <p>Ad, ID, dil, bacarıq, şəhər və kateqoriya ilə uyğun profilləri daralt.</p>
          </div>
          <form className="search-panel compact" onSubmit={(event) => event.preventDefault()}>
            <div className="filters">
              <input
                className="wide"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ad, soyad, ID, dil və ya bacarıq"
                value={query}
              />
              <select aria-label="Kateqoriya" onChange={(event) => setRole(event.target.value)} value={role}>
                <option value="">Kateqoriya</option>
                {roles.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <select aria-label="Şəhər" onChange={(event) => setCity(event.target.value)} value={city}>
                <option value="">Şəhər</option>
                {cities.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <button
                className="button secondary"
                onClick={() => {
                  setQuery("");
                  setRole("");
                  setCity("");
                }}
                type="button"
              >
                Təmizlə
              </button>
              <button className="button" type="submit">
                {filteredActors.length} nəticə
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="section home-results">
        <div className="section-header">
          <h2>Ən reytinqli profillər</h2>
          <span>{filteredActors.length} nəticə</span>
        </div>
        <div className="actor-grid">
          {filteredActors.map((actor) => (
            <ActorCard
              actor={actor}
              isShortlisted={shortlist.includes(actor.id)}
              key={actor.id}
              onToggleShortlist={onToggleShortlist}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function ActorsPage({
  actors,
  shortlist,
  onToggleShortlist,
}: {
  actors: Actor[];
  shortlist: string[];
  onToggleShortlist: (actorId: string) => void;
}) {
  const publicActors = sortByRating(actors.filter((actor) => actor.status !== "inactive"));
  const browseRandomRanks = useMemo(
    () => new Map(publicActors.map((actor) => [actor.id, Math.random()])),
    [publicActors.map((actor) => actor.id).join("|")],
  );
  const topActors = shuffleActors(getTopActors(publicActors), browseRandomRanks);
  const favoriteActors = publicActors.filter((actor) => shortlist.includes(actor.id));
  const verifiedActors = publicActors.filter((actor) => actor.status === "verified");
  const customCategoryRows = getUniqueListValues(publicActors, "browseCategories").map((category) => ({
    actors: publicActors.filter((actor) => (actor.browseCategories ?? []).includes(category)),
    title: category,
  }));
  const roleRows = getUniqueValues(publicActors, "role").map((role) => ({
    actors: publicActors.filter((actor) => actor.role === role),
    title: role,
  }));
  const cityRows = getUniqueValues(publicActors, "city")
    .slice(0, 4)
    .map((city) => ({
      actors: publicActors.filter((actor) => actor.city === city),
      title: `${city} profilləri`,
    }));
  const titleRows = ["Xalq artisti", "Əməkdar artist", "Viral aktyor"].map((title) => ({
    actors: publicActors.filter((actor) => (actor.titles ?? []).includes(title)),
    title: `${title} profilləri`,
  }));
  const browseRows = [
    ...(favoriteActors.length ? [{ actors: favoriteActors, title: "Favoritlərin" }] : []),
    { actors: verifiedActors, title: "Təsdiqlənmiş profillər" },
    ...titleRows,
    { actors: publicActors.filter((actor) => effectiveRating(actor) >= 4.8), title: "Ən yüksək reytinq" },
    ...customCategoryRows,
    ...roleRows,
    ...cityRows,
  ]
    .filter((row) => row.actors.length)
    .map((row) => ({ ...row, actors: shuffleActors(row.actors, browseRandomRanks) }));

  function scrollRail(railId: string, direction: "left" | "right") {
    const rail = document.getElementById(railId);
    if (!rail) {
      return;
    }

    const distance = Math.max(280, Math.floor(rail.clientWidth * 0.82));
    rail.scrollBy({ behavior: "smooth", left: direction === "left" ? -distance : distance });
  }

  function ActorVisual({ actor }: { actor: Actor }) {
    if (actor.photo) {
      return <img src={actor.photo} alt={actor.name} />;
    }

    return <span>{actor.initials}</span>;
  }

  return (
    <main className="page-shell browse-page">
      <Header />
      <section className="browse-hero">
        <div className="browse-hero-copy">
          <p className="eyebrow">Aktyor kataloqu</p>
          <h1>Reytinqli profilləri serial platforması kimi kəşf et.</h1>
          <p className="lead">
            Axtarış və AI ayrıca bölmələrdədir. Burada məqsəd aktyorları kateqoriya,
            status və şəhər üzrə vizual şəkildə gözdən keçirməkdir.
          </p>
          <div className="browse-hero-actions">
            <a className="button" href="/casting-ai">
              AI kastinq aç
            </a>
            <a className="button secondary" href="/">
              Sadə axtarış
            </a>
          </div>
          <div className="rail-controls top-rail-controls" aria-label="Top 5 slayd idarəsi">
            <button aria-label="Top 5 sola sürüşdür" onClick={() => scrollRail("top-five-rail", "left")} type="button">
              ‹
            </button>
            <button aria-label="Top 5 sağa sürüşdür" onClick={() => scrollRail("top-five-rail", "right")} type="button">
              ›
            </button>
          </div>
        </div>

        <div className="top-five-rail" id="top-five-rail" aria-label="Top 5 aktyor slaydı">
          {topActors.map((actor, index) => (
            <article className="top-actor-card" key={actor.id}>
              <span className="top-rank">{index + 1}</span>
              <a className="top-actor-visual" href={`/actors/${actor.slug}`}>
                <ActorVisual actor={actor} />
              </a>
              <div className="top-actor-info">
                <span className="score-chip">★ {effectiveRating(actor).toFixed(1)}</span>
                <h2>{actor.name}</h2>
                <p>
                  {actor.role} · {actor.city} · {actor.ageRange}
                </p>
                <div className="browse-card-actions">
                  <a className="button" href={`/actors/${actor.slug}`}>
                    Profil
                  </a>
                  <button
                    className={shortlist.includes(actor.id) ? "button secondary active-favorite" : "button secondary"}
                    onClick={() => onToggleShortlist(actor.id)}
                    type="button"
                  >
                    {shortlist.includes(actor.id) ? "Favoritdə" : "Favorit et"}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="browse-rows" aria-label="Aktyor kateqoriyaları">
        {browseRows.map((row, rowIndex) => {
          const railId = `browse-row-${rowIndex}`;

          return (
            <div className="browse-row" key={row.title}>
              <div className="browse-row-header">
                <h2>{row.title}</h2>
                <div className="browse-row-meta">
                  <span>{row.actors.length} profil</span>
                  <div className="rail-controls" aria-label={`${row.title} karusel idarəsi`}>
                    <button aria-label={`${row.title} sola sürüşdür`} onClick={() => scrollRail(railId, "left")} type="button">
                      ‹
                    </button>
                    <button aria-label={`${row.title} sağa sürüşdür`} onClick={() => scrollRail(railId, "right")} type="button">
                      ›
                    </button>
                  </div>
                </div>
              </div>
              <div className="poster-rail" id={railId}>
                {row.actors.map((actor) => (
                  <article className="poster-card" key={`${row.title}-${actor.id}`}>
                    <a className="poster-visual" href={`/actors/${actor.slug}`}>
                      <ActorVisual actor={actor} />
                      <span className="poster-score">★ {effectiveRating(actor).toFixed(1)}</span>
                    </a>
                    <div className="poster-info">
                      <h3>{actor.name}</h3>
                      <p>
                        {actor.role} · {actor.city}
                      </p>
                      <button
                        className={shortlist.includes(actor.id) ? "poster-favorite active" : "poster-favorite"}
                        onClick={() => onToggleShortlist(actor.id)}
                        type="button"
                      >
                        {shortlist.includes(actor.id) ? "Favoritdə" : "Favorit et"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}

function ShortlistPage({
  actors,
  shortlist,
  onToggleShortlist,
}: {
  actors: Actor[];
  shortlist: string[];
  onToggleShortlist: (actorId: string) => void;
}) {
  const shortlistedActors = sortByRating(
    actors.filter((actor) => shortlist.includes(actor.id) && actor.status !== "inactive"),
  );

  return (
    <main className="page-shell">
      <Header />
      <section className="section">
        <h1>Favoritlər</h1>
        <p className="lead">
          Kastinq üçün seçdiyin aktyor və aktrisa profilləri burada toplanır.
        </p>
      </section>
      <section className="section">
        {shortlistedActors.length ? (
          <div className="actor-grid">
            {shortlistedActors.map((actor) => (
              <ActorCard
                actor={actor}
                isShortlisted={shortlist.includes(actor.id)}
                key={actor.id}
                onToggleShortlist={onToggleShortlist}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Favorit siyahısı boşdur</h2>
            <p>Kataloqdan profilləri seçəndə onlar burada görünəcək.</p>
            <a className="button" href="/actors">
              Kataloqa bax
            </a>
          </div>
        )}
      </section>
    </main>
  );
}

function formatNewsDate(value?: string) {
  if (!value) {
    return "";
  }

  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("az-AZ") : value;
}

function NewsCover({ post }: { post: NewsPost }) {
  if (post.coverImage) {
    return <img src={post.coverImage} alt={post.title} />;
  }

  return (
    <div className="news-cover-placeholder">
      <span>AAAb</span>
    </div>
  );
}

function NewsListPage({ posts }: { posts: NewsPost[] }) {
  return (
    <main className="page-shell">
      <Header />
      <section className="section news-hero">
        <p className="eyebrow">Xəbərlər</p>
        <h1>Kino və layihələrdə aktyorlarımız.</h1>
        <p className="lead">
          Aktyor.az bazasından yönləndirilən aktyorların iştirak etdiyi kino, serial,
          reklam və yaradıcı layihələr haqqında yeniliklər.
        </p>
      </section>
      <section className="section">
        {posts.length ? (
          <div className="news-grid">
            {posts.map((post) => (
              <article className="news-card" key={post.id}>
                <a className="news-card-cover" href={`/news/${post.slug}`}>
                  <NewsCover post={post} />
                </a>
                <div className="news-card-body">
                  <div className="news-meta-row">
                    {post.projectName && <span>{post.projectName}</span>}
                    {post.publishedAt && <time>{formatNewsDate(post.publishedAt)}</time>}
                  </div>
                  <h2>
                    <a href={`/news/${post.slug}`}>{post.title}</a>
                  </h2>
                  <p>{post.excerpt}</p>
                  <a className="text-link" href={`/news/${post.slug}`}>
                    Xəbəri oxu
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Hələ xəbər paylaşılmayıb</h2>
            <p>Kino və layihə xəbərləri admin paneldən yayımlandıqdan sonra burada görünəcək.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function NewsDetailPage({ post }: { post: NewsPost }) {
  const paragraphs = post.content
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <main className="page-shell">
      <Header />
      <article className="news-detail">
        <header className="news-detail-header">
          <a className="text-link" href="/news">
            Xəbərlərə qayıt
          </a>
          <div className="news-meta-row">
            {post.projectName && <span>{post.projectName}</span>}
            {post.publishedAt && <time>{formatNewsDate(post.publishedAt)}</time>}
          </div>
          <h1>{post.title}</h1>
          <p className="lead">{post.excerpt}</p>
        </header>
        <div className="news-detail-cover">
          <NewsCover post={post} />
        </div>
        <div className="news-content">
          {paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </article>
    </main>
  );
}

function ApplyPage() {
  const [form, setForm] = useState({
    ageRange: "",
    city: "Bakı",
    contact: "",
    height: "",
    weight: "",
    hairColor: "",
    languages: "Azərbaycan",
    name: "",
    role: "Aktyor",
    showreel: "",
    skills: "Kino, Teatr",
    genres: "Dram, Komediya",
    specialSkills: "",
    titles: "",
    summary: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");

  function updateForm(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accepted) {
      setMessage("Müraciət göndərmək üçün məlumatların emalına razılıq verməlisiniz.");
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    const application: NewActorApplication = {
      ageRange: form.ageRange.trim(),
      city: form.city.trim(),
      contact: form.contact.trim(),
      height: form.height.trim(),
      weight: form.weight.trim(),
      hairColor: form.hairColor.trim(),
      languages: form.languages
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      name: form.name.trim(),
      role: form.role,
      showreel: form.showreel.trim() || undefined,
      skills: form.skills
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      genres: form.genres
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      specialSkills: form.specialSkills
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      titles: form.titles
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      summary: form.summary.trim(),
    };

    try {
      await createActorApplication(application);
      setMessage("Müraciət göndərildi. Admin yoxlamasından sonra sizinlə əlaqə saxlanılacaq.");
      setAccepted(false);
      setForm({
        ageRange: "",
        city: "Bakı",
        contact: "",
        height: "",
        weight: "",
        hairColor: "",
        languages: "Azərbaycan",
        name: "",
        role: "Aktyor",
        showreel: "",
        skills: "Kino, Teatr",
        genres: "Dram, Komediya",
        specialSkills: "",
        titles: "",
        summary: "",
      });
    } catch {
      setMessage("Müraciət göndərilmədi. Bir az sonra yenidən yoxlayın.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <Header />
      <section className="apply-page">
        <div className="apply-intro">
          <p className="eyebrow">Bazaya qoşul</p>
          <h1>Aktyor.az profil müraciəti</h1>
          <p className="lead">
            Məlumatlarını göndər, admin komandası profili yoxlasın və uyğun olduqda Aktyor.az
            bazasında təsdiqlənmiş profil kimi yayımlasın.
          </p>
          <div className="process-note">
            <strong>Foto yalnız studiyada çəkilir</strong>
            <span>
              Saytın vizual keyfiyyəti və təhlükəsizlik üçün müraciət zamanı şəkil qəbul edilmir.
              Profil fotosu təsdiqdən sonra Aktyor.az studiyasında çəkilib admin tərəfindən əlavə olunur.
            </span>
          </div>
          <div className="process-note membership">
            <strong>İllik üzvlük</strong>
            <span>
              Bazaya qəbul edilən profillər üçün illik üzvlük ödənişi olacaq. Komanda müraciəti
              yoxladıqdan sonra çəkiliş, profil hazırlığı və üzvlük şərtləri üçün əlaqə saxlayacaq.
            </span>
          </div>
          <div className="stat-strip">
            <div>
              <strong>1</strong>
              <span>müraciət</span>
            </div>
            <div>
              <strong>2</strong>
              <span>yoxlama</span>
            </div>
            <div>
              <strong>3</strong>
              <span>profil</span>
            </div>
          </div>
        </div>

        <form className="apply-form" onSubmit={submitApplication}>
          <div className="form-grid">
            <label>
              Ad soyad
              <input
                onChange={(event) => updateForm("name", event.target.value)}
                required
                value={form.name}
              />
            </label>
            <label>
              Kateqoriya
              <select onChange={(event) => updateForm("role", event.target.value)} value={form.role}>
                <option>Aktyor</option>
                <option>Aktrisa</option>
                <option>Tələbə aktyor</option>
                <option>Uşaq aktyor</option>
              </select>
            </label>
            <label>
              Şəhər
              <input onChange={(event) => updateForm("city", event.target.value)} value={form.city} />
            </label>
            <label>
              Yaş aralığı
              <input
                onChange={(event) => updateForm("ageRange", event.target.value)}
                placeholder="18-24"
                required
                value={form.ageRange}
              />
            </label>
            <label>
              Boy
              <input
                onChange={(event) => updateForm("height", event.target.value)}
                placeholder="178 sm"
                required
                value={form.height}
              />
            </label>
            <label>
              Çəki
              <input
                onChange={(event) => updateForm("weight", event.target.value)}
                placeholder="74 kg"
                value={form.weight}
              />
            </label>
            <label>
              Saç rəngi
              <input
                onChange={(event) => updateForm("hairColor", event.target.value)}
                placeholder="Qara"
                value={form.hairColor}
              />
            </label>
            <label>
              Əlaqə
              <input
                onChange={(event) => updateForm("contact", event.target.value)}
                placeholder="+994..."
                required
                value={form.contact}
              />
            </label>
          </div>
          <label>
            Dillər
            <input
              onChange={(event) => updateForm("languages", event.target.value)}
              value={form.languages}
            />
          </label>
          <label>
            Bacarıqlar
            <input onChange={(event) => updateForm("skills", event.target.value)} value={form.skills} />
          </label>
          <div className="form-grid">
            <label>
              Janrlar
              <input
                onChange={(event) => updateForm("genres", event.target.value)}
                placeholder="Dram, Komediya, Reklam"
                value={form.genres}
              />
            </label>
            <label>
              Xüsusi bacarıqlar
              <input
                onChange={(event) => updateForm("specialSkills", event.target.value)}
                placeholder="Rəqs, döyüş səhnəsi, at sürmə..."
                value={form.specialSkills}
              />
            </label>
          </div>
          <label>
            Titullar / tanınma
            <input
              onChange={(event) => updateForm("titles", event.target.value)}
              placeholder="Əməkdar artist, Viral aktyor..."
              value={form.titles}
            />
          </label>
          <label>
            Qısa təcrübə və portfolio məlumatı
            <textarea
              onChange={(event) => updateForm("summary", event.target.value)}
              required
              rows={5}
              value={form.summary}
            />
          </label>
          <div className="form-grid">
            <label>
              Showreel link
              <input
                onChange={(event) => updateForm("showreel", event.target.value)}
                placeholder="https://..."
                value={form.showreel}
              />
            </label>
            <div className="studio-photo-note">
              <strong>Profil fotosu</strong>
              <span>Foto yükləmə bağlıdır. Çəkiliş və vizual standart admin tərəfindən idarə olunur.</span>
            </div>
          </div>
          <label className="consent-row">
            <input checked={accepted} onChange={(event) => setAccepted(event.target.checked)} type="checkbox" />
            Məlumatlarımın Aktyor.az komandası tərəfindən yoxlanmasına və mənimlə əlaqə saxlanmasına razıyam.
          </label>
          {message && <div className="upload-state">{message}</div>}
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Göndərilir..." : "Müraciəti göndər"}
          </button>
        </form>
      </section>
    </main>
  );
}

function CastingAiPage({
  adminSession,
  shortlist,
  onToggleShortlist,
}: {
  adminSession: AdminSession | null;
  shortlist: string[];
  onToggleShortlist: (actorId: string) => void;
}) {
  const promptExamples = [
    "35-45 yaşlarında, sərt xarakterli, ata obrazı oynaya bilən, Azərbaycan və rus dilində danışan dramatik aktyor lazımdır.",
    "20-28 yaş aralığında enerjili, reklam çəkilişi üçün kamera qarşısında rahat, Azərbaycan və İngilis dilində danışan aktrisa lazımdır.",
    "Tarixi serial üçün 40-55 yaşlarında ciddi görünüşlü, teatr təcrübəsi olan kişi aktyor axtarılır.",
  ];
  const [prompt, setPrompt] = useState(
    promptExamples[0],
  );
  const [limit, setLimit] = useState("6");
  const [results, setResults] = useState<CastingSearchResult[]>([]);
  const [analysis, setAnalysis] = useState<CastingPromptAnalysis | null>(null);
  const [mode, setMode] = useState<"openai" | "rules" | "">("");
  const [error, setError] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAnalysis(null);
    setIsSearching(true);

    try {
      const data = await castingSearch(prompt, Number(limit) || 6);
      setAnalysis(data.analysis ?? null);
      setResults(data.results);
      setMode(data.mode);
    } catch {
      setError("AI axtarış alınmadı. Backend serverin işlədiyini yoxlayın.");
    } finally {
      setIsSearching(false);
    }
  }

  async function sendFeedback(
    actorId: string,
    decision: AiCastingFeedback["decision"],
  ) {
    if (!adminSession || !analysis) {
      return;
    }

    setFeedbackMessage("Feedback saxlanılır...");

    try {
      await createAiCastingFeedback(
        {
          actorId,
          decision,
          prompt,
          promptAnalysis: analysis,
        },
        adminSession.token,
      );
      setFeedbackMessage("AI feedback saxlanıldı.");
    } catch (feedbackError) {
      const message = feedbackError instanceof Error ? feedbackError.message : "naməlum xəta";
      setFeedbackMessage(`Feedback saxlanmadı: ${message}. Admin paneldən çıxıb yenidən daxil olun.`);
    }
  }

  return (
    <main className="page-shell">
      <Header />
      <section className="ai-search-page">
        <div className="ai-search-intro">
          <p className="eyebrow">AI kastinq axtarışı</p>
          <h1>Ssenarini yaz, uyğun aktyorları tap.</h1>
          <p className="lead">
            Personajı, yaş aralığını, görünüşü, dil tələblərini və emosional tonu qısa təsvir et.
            Sistem bazadakı profilləri uyğunluq faizi və səbəblə sıralayacaq.
          </p>
        </div>

        <form className="ai-search-form" onSubmit={submitSearch}>
          <label>
            Personaj / ssenari təsviri
            <textarea
              onChange={(event) => setPrompt(event.target.value)}
              rows={7}
              value={prompt}
            />
          </label>
          <div className="prompt-example-row">
            {promptExamples.map((example, index) => (
              <button className="prompt-example" key={example} onClick={() => setPrompt(example)} type="button">
                Nümunə {index + 1}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <label>
              Nəticə sayı
              <select onChange={(event) => setLimit(event.target.value)} value={limit}>
                <option value="3">3</option>
                <option value="6">6</option>
                <option value="9">9</option>
                <option value="12">12</option>
              </select>
            </label>
            <button className="button" disabled={isSearching || prompt.trim().length < 10} type="submit">
              {isSearching ? "Axtarılır..." : "Uyğun aktyorları tap"}
            </button>
          </div>
          {mode && (
            <div className="upload-state">
              Rejim: {mode === "openai" ? "OpenAI AI scoring" : "Lokal qayda əsaslı fallback"}
            </div>
          )}
          {error && <div className="form-error">{error}</div>}
          {feedbackMessage && <div className="upload-state">{feedbackMessage}</div>}
        </form>
      </section>

      {analysis ? (
        <section className="section ai-analysis-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">Prompt analizi</p>
              <h2>AI bunu belə başa düşdü</h2>
            </div>
            <span>{mode === "openai" ? "OpenAI struktur analizi" : "Lokal analiz"}</span>
          </div>
          <div className="ai-analysis-panel">
            <div className="ai-analysis-summary">
              <strong>Obraz</strong>
              <p>{analysis.rawSummary || "Promptdan çıxarılan kastinq brifi."}</p>
            </div>
            <div className="ai-analysis-grid">
              {analysis.ageRange ? <span><strong>Yaş</strong>{analysis.ageRange}</span> : null}
              {analysis.gender ? <span><strong>Cins</strong>{analysis.gender}</span> : null}
              {analysis.genre ? <span><strong>Janr</strong>{analysis.genre}</span> : null}
              {analysis.characterType ? <span><strong>Xarakter</strong>{analysis.characterType}</span> : null}
            </div>
            {[
              ["Dil tələbi", analysis.languageNeeds],
              ["Görünüş", analysis.look],
              ["Bacarıqlar", analysis.skills],
              ["Mütləq şərtlər", analysis.mustHave],
              ["Üstünlük", analysis.niceToHave],
            ].map(([label, items]) => Array.isArray(items) && items.length ? (
              <div className="ai-analysis-row" key={String(label)}>
                <strong>{label}</strong>
                <div className="ai-factor-row">
                  {items.map((item) => <span className="ai-factor" key={item}>{item}</span>)}
                </div>
              </div>
            ) : null)}
            {analysis.concerns?.length ? (
              <div className="ai-concern-row">
                {analysis.concerns.map((item) => <span key={item}>{item}</span>)}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-header">
          <h2>{results.length ? `${results.length} uyğun namizəd` : "Nəticələr"}</h2>
          <span>{shortlist.length} favoritdə</span>
        </div>
        {results.length ? (
          <div className="ai-result-grid">
            {results.map((result) => (
              <article className="ai-result-card" key={result.actorId}>
                <div className="ai-score">{Math.round(result.score)}%</div>
                <ActorCard
                  actor={result.actor}
                  isShortlisted={shortlist.includes(result.actorId)}
                  onToggleShortlist={onToggleShortlist}
                />
                <p>{result.reason}</p>
                {result.matched?.length ? (
                  <div className="ai-factor-row">
                    {result.matched.map((item) => (
                      <span className="ai-factor" key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                {result.concerns?.length ? (
                  <div className="ai-concern-row">
                    {result.concerns.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : null}
                {adminSession ? (
                  <div className="ai-feedback-actions">
                    <button onClick={() => sendFeedback(result.actorId, "good")} type="button">
                      Uyğundur
                    </button>
                    <button onClick={() => sendFeedback(result.actorId, "maybe")} type="button">
                      Bəlkə
                    </button>
                    <button onClick={() => sendFeedback(result.actorId, "bad")} type="button">
                      Uyğun deyil
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Hələ axtarış edilməyib</h2>
            <p>Ssenari/personaj təsvirini yazıb uyğun aktyorları tap.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function AdminLoginPage({
  onLogin,
}: {
  onLogin: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("admin@aktyor.az");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await onLogin(email, password);
    } catch {
      setError("Email və ya parol yanlışdır.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <Header />
      <section className="login-page">
        <form className="login-card" onSubmit={submitLogin}>
          <p className="eyebrow">Admin giriş</p>
          <h1>Aktyor.az idarəetməsi</h1>
          <p>Profil əlavə etmək və database dəyişiklikləri üçün admin girişi tələb olunur.</p>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </label>
          <label>
            Parol
            <span className="password-field">
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type={isPasswordVisible ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={isPasswordVisible ? "Parolu gizlət" : "Parolu göstər"}
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                type="button"
              >
                {isPasswordVisible ? "Gizlət" : "Göstər"}
              </button>
            </span>
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Yoxlanılır..." : "Daxil ol"}
          </button>
        </form>
      </section>
    </main>
  );
}

function ActorProfilePage({
  actors,
  slug,
  onRateActor,
  votes,
}: {
  actors: Actor[];
  slug: string;
  onRateActor: (actorId: string, rating: number) => void;
  votes: Record<string, number>;
}) {
  const actor = actors.find((item) => item.slug === slug || slugify(item.name) === slug);

  if (!actor) {
    return <NotFoundPage />;
  }

  const ownVote = votes[actor.id];

  return (
    <main className="page-shell">
      <Header />
      <section className="profile-page">
        <div className="profile-visual-card">
          <Portrait actor={actor} />
          <div className="profile-card-body">
            <div className="profile-status-row">
              <p className={actor.status === "verified" ? "status" : "status warning-text"}>
                {actor.status === "verified"
                  ? "Təsdiqlənmiş profil"
                  : actor.status === "inactive"
                    ? "Deaktiv profil"
                    : "Yoxlanılır"}
              </p>
              <span className="score-chip">★ {effectiveRating(actor).toFixed(1)}</span>
            </div>
            <h2>{actor.name}</h2>
            <p>{actor.summary}</p>
            <div className="mini-meta-grid">
              <div>
                <strong>{actor.city}</strong>
                <span>Şəhər</span>
              </div>
              <div>
                <strong>{actor.ageRange}</strong>
                <span>Yaş aralığı</span>
              </div>
              <div>
                <strong>{actor.height}</strong>
                <span>Boy</span>
              </div>
              <div>
                <strong>{actor.weight || "-"}</strong>
                <span>Çəki</span>
              </div>
              <div>
                <strong>{actor.hairColor || "-"}</strong>
                <span>Saç</span>
              </div>
            </div>
            <img
              alt={`${actor.name} Aktyor.az QR`}
              className="qr-image compact"
              src={getActorQrSvgUrl(actor.id)}
            />
          </div>
        </div>

        <div className="profile-content">
          <p className="eyebrow">{actor.id}</p>
          <div className="profile-heading">
            <h1>{actor.name}</h1>
            <span
              className={actor.status === "verified" ? "verification-pill" : "verification-pill warning"}
            >
              {actor.status === "verified"
                ? "Təsdiqlənib"
                : actor.status === "inactive"
                  ? "Deaktiv"
                  : "Yoxlanılır"}
            </span>
          </div>
          <p className="profile-role">{actor.role}</p>
          <p className="profile-summary">
            {actor.summary || "Bu profil kastinq və portfolio yoxlaması üçün hazırlanıb."}
          </p>
          <div className="profile-action-row">
            <a className="button" href={`/id/${actor.id}`}>
              Rəqəmsal ID
            </a>
            {actor.showreel && (
              <a className="button secondary" href={actor.showreel} rel="noreferrer" target="_blank">
                Showreel
              </a>
            )}
            <a className="button secondary" href={getActorCardPdfUrl(actor.id)}>
              PDF kart
            </a>
            {actor.contact && <span className="contact-chip">{actor.contact}</span>}
          </div>
          <div className="badge-row">
            <span className="badge rating-badge">
              ★ {effectiveRating(actor).toFixed(1)} · {actor.ratingCount} səs
            </span>
            {actor.languages.map((language) => (
              <span className="badge" key={language}>
                {language}
              </span>
            ))}
            {(actor.titles ?? []).map((title) => (
              <span className="badge success" key={title}>
                {title}
              </span>
            ))}
            {actor.skills.map((skill) => (
              <span className="badge" key={skill}>
                {skill}
              </span>
            ))}
            {(actor.genres ?? []).map((genre) => (
              <span className="badge" key={genre}>
                Janr: {genre}
              </span>
            ))}
            {(actor.specialSkills ?? []).map((skill) => (
              <span className="badge success" key={skill}>
                Xüsusi: {skill}
              </span>
            ))}
          </div>
          <div className="profile-detail-grid">
            <div>
              <span>Şəhər</span>
              <strong>{actor.city}</strong>
            </div>
            <div>
              <span>Görünüş yaşı</span>
              <strong>{actor.ageRange}</strong>
            </div>
            <div>
              <span>Boy</span>
              <strong>{actor.height}</strong>
            </div>
            <div>
              <span>Çəki</span>
              <strong>{actor.weight || "-"}</strong>
            </div>
            <div>
              <span>Saç rəngi</span>
              <strong>{actor.hairColor || "-"}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{actor.status === "verified" ? "Təsdiqlənmiş" : "Yoxlanılır"}</strong>
            </div>
          </div>
          {actor.gallery?.length ? (
            <div className="profile-gallery">
              {actor.gallery.map((photoUrl) => (
                <img alt={`${actor.name} qalereya fotosu`} key={photoUrl} src={photoUrl} />
              ))}
            </div>
          ) : null}
          <div className="rating-panel" aria-label="Profil reytinqi">
            <strong>Reytinq ver</strong>
            {ownVote && <p>Siz bu profilə artıq {ownVote} ulduz vermisiniz.</p>}
            <div className="rating-buttons">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  className={ownVote ? "star-button disabled" : "star-button"}
                  disabled={Boolean(ownVote)}
                  key={rating}
                  onClick={() => onRateActor(actor.id, rating)}
                  type="button"
                >
                  ★ {rating}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function VerificationPage({ actors, id }: { actors: Actor[]; id: string }) {
  const actor = actors.find((item) => item.id === id);

  if (!actor) {
    return <NotFoundPage />;
  }

  const cardState = getCardVerificationState(actor);

  return (
    <main className="page-shell">
      <Header />
      <section className="card-page">
        <div className="verified-card">
          <Portrait actor={actor} />
          <div className="verified-body">
            <p className={cardState.isActive ? "status" : "status warning-text"}>
              {cardState.isActive ? "Aktiv və təsdiqlənmiş Aktyor.az ID" : cardState.reason}
            </p>
            <h1>{actor.name}</h1>
            <p>
              {actor.role} · {actor.city}
            </p>
            <img
              alt={`${actor.name} Aktyor.az QR`}
              className="qr-image"
              src={getActorQrSvgUrl(actor.id)}
            />
            <p className="qr-caption">Seriya nömrəsi: {actor.id}</p>
            <p className="qr-caption">aktyor.az/id/{actor.id}</p>
          </div>
        </div>

        <div>
          <p className="eyebrow">Rəqəmsal vizitkart</p>
          <h1>{actor.name}</h1>
          <p className="lead">
            Bu səhifə aktyorun Aktyor.az bazasında qeydiyyat və təsdiq statusunu
            yoxlamaq üçün nəzərdə tutulub.
          </p>
          <div className="badge-row">
            <span className="badge">Status: {actor.status}</span>
            <span className={cardState.isActive ? "badge success" : "badge warning"}>
              Kart: {cardState.isActive ? "aktivdir" : "deaktivdir"}
            </span>
            <span className="badge">Üzvlük: {actor.membershipStatus ?? "active"}</span>
            <span className={(actor.annualPaymentStatus ?? "paid") === "paid" ? "badge success" : "badge warning"}>
              İllik ödəniş: {actor.annualPaymentStatus ?? "paid"}
            </span>
            {actor.annualPaymentDate && <span className="badge">Ödəniş tarixi: {actor.annualPaymentDate}</span>}
            <span className={actor.paymentManualConfirmed || actor.paymentProvider === "online" ? "badge success" : "badge warning"}>
              Təsdiq: {actor.paymentManualConfirmed ? "manual" : actor.paymentProvider === "online" ? "online" : "yoxdur"}
            </span>
            {actor.cardIssuedAt && <span className="badge">Verilib: {actor.cardIssuedAt}</span>}
            {actor.cardExpiresAt && <span className={cardState.expired ? "badge warning" : "badge"}>Bitir: {actor.cardExpiresAt}</span>}
            <span className="badge rating-badge">★ {effectiveRating(actor).toFixed(1)}</span>
            <span className="badge">Yaş aralığı: {actor.ageRange}</span>
            <span className="badge">Boy: {actor.height}</span>
            {actor.weight && <span className="badge">Çəki: {actor.weight}</span>}
            {actor.hairColor && <span className="badge">Saç: {actor.hairColor}</span>}
          </div>
          <div className="verification-grid">
            <div>
              <strong>ID</strong>
              <span>{actor.id}</span>
            </div>
            <div>
              <strong>Profil</strong>
              <span>{actor.status === "verified" ? "Təsdiqlənib" : "Yoxlanılır"}</span>
            </div>
            <div>
              <strong>Kart yoxlaması</strong>
              <span>{cardState.isActive ? "Aktivdir" : cardState.reason}</span>
            </div>
            <div>
              <strong>Üzvlük</strong>
              <span>{actor.membershipStatus ?? "active"}</span>
            </div>
            <div>
              <strong>Ödəniş</strong>
              <span>{actor.annualPaymentStatus ?? "paid"}</span>
            </div>
            <div>
              <strong>Ödəniş tarixi</strong>
              <span>{actor.annualPaymentDate || "-"}</span>
            </div>
            <div>
              <strong>Ödəniş təsdiqi</strong>
              <span>{actor.paymentManualConfirmed ? "Manual təsdiq" : actor.paymentProvider === "online" ? "Online" : "Təsdiqsiz"}</span>
            </div>
            <div>
              <strong>Səs</strong>
              <span>{actor.ratingCount}</span>
            </div>
          </div>
          <div className="profile-action-row">
            <a className="button" href={getActorCardPdfUrl(actor.id)}>
              PDF kartı yüklə
            </a>
            <a className="button secondary" href={getActorQrSvgUrl(actor.id)} target="_blank" rel="noreferrer">
              QR aç
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function AdminPage({
  actors,
  auditLogs,
  aiFeedback,
  aiIndexStatus,
  applications,
  newsPosts,
  onApplicationDelete,
  onApplicationStatusChange,
  onActorsChange,
  onDeleteNewsPost,
  onSaveNewsPost,
  onResetDemoData,
  session,
  onLogout,
}: {
  actors: Actor[];
  auditLogs: AuditLog[];
  aiFeedback: AiCastingFeedback[];
  aiIndexStatus: AiIndexStatus | null;
  applications: ActorApplication[];
  newsPosts: NewsPost[];
  onApplicationDelete: (id: number) => Promise<void>;
  onApplicationStatusChange: (id: number, status: ActorApplication["status"]) => Promise<void>;
  onActorsChange: (actors: Actor[]) => Promise<void>;
  onDeleteNewsPost: (id: number) => Promise<void>;
  onSaveNewsPost: (post: NewsPostInput) => Promise<void>;
  onResetDemoData: () => Promise<void>;
  session: AdminSession;
  onLogout: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ActorForm>(emptyForm);
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [aiIndexMessage, setAiIndexMessage] = useState("");
  const [localAiIndexStatus, setLocalAiIndexStatus] = useState<AiIndexStatus | null>(aiIndexStatus);
  const [adminActorQuery, setAdminActorQuery] = useState("");
  const [adminActorPage, setAdminActorPage] = useState(1);
  const [newsForm, setNewsForm] = useState<NewsForm>(emptyNewsForm);
  const [newsMessage, setNewsMessage] = useState("");
  const editingActor = useMemo(
    () => actors.find((actor) => actor.id === editingId),
    [actors, editingId],
  );
  const verifiedCount = actors.filter((actor) => actor.status === "verified").length;
  const reviewCount = actors.filter((actor) => actor.status === "review").length;
  const realProfileCount = actors.filter((actor) => actor.profileKind !== "demo").length;
  const demoProfileCount = actors.filter((actor) => actor.profileKind === "demo").length;
  const riskCount = actors.filter((actor) => getActorScoreRisk(actor)).length;
  const newApplicationsCount = applications.filter((application) => application.status === "new").length;
  const averageRating =
    actors.reduce((total, actor) => total + effectiveRating(actor), 0) / Math.max(actors.length, 1);
  const publicActors = sortByRating(actors.filter((actor) => actor.status !== "inactive"));
  const browseTopActors = getTopActors(publicActors);
  const browseRoles = getUniqueValues(publicActors, "role");
  const browseCities = getUniqueValues(publicActors, "city");
  const browseCustomCategories = getUniqueListValues(publicActors, "browseCategories");
  const homeCollageActors = getHomeCollageActors(publicActors);
  const photoCount = publicActors.filter((actor) => actor.photo).length;
  const showreelCount = publicActors.filter((actor) => actor.showreel).length;
  const actorTopRank = new Map(browseTopActors.map((actor, index) => [actor.id, index + 1]));
  const adminFilteredActors = [...actors]
    .filter((actor) => actorMatchesQuery(actor, adminActorQuery))
    .sort(newestAdminActorFirst);
  const adminPageSize = 8;
  const adminPageCount = Math.max(1, Math.ceil(adminFilteredActors.length / adminPageSize));
  const adminVisibleActors = adminFilteredActors.slice(
    (adminActorPage - 1) * adminPageSize,
    adminActorPage * adminPageSize,
  );

  useEffect(() => {
    setLocalAiIndexStatus(aiIndexStatus);
  }, [aiIndexStatus]);

  function updateForm(name: keyof ActorForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateNewsForm(name: keyof NewsForm, value: string) {
    setNewsForm((current) => ({
      ...current,
      [name]: value,
      ...(name === "title" && !current.slug ? { slug: slugify(value) } : {}),
    }));
  }

  function resetNewsForm() {
    setNewsForm(emptyNewsForm);
    setNewsMessage("");
  }

  async function submitNews(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNewsMessage("Xəbər saxlanılır...");

    try {
      await onSaveNewsPost(formToNewsPost(newsForm));
      resetNewsForm();
      setNewsMessage("Xəbər saxlanıldı.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "naməlum xəta";
      setNewsMessage(`Xəbər saxlanmadı: ${message}`);
    }
  }

  function editNews(post: NewsPost) {
    setNewsForm(newsToForm(post));
    setNewsMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeNews(id: number) {
    setNewsMessage("Xəbər silinir...");
    await onDeleteNewsPost(id);
    if (newsForm.id === id) {
      resetNewsForm();
    }
    setNewsMessage("Xəbər silindi.");
  }

  async function submitActor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) {
      return;
    }

    const nextActor = formToActor(form, actors, editingId ?? undefined);
    const nextActors = editingId
      ? actors.map((actor) => {
          if (actor.id === editingId) {
            return nextActor;
          }

          if (nextActor.featuredOrder && actor.featuredOrder === nextActor.featuredOrder) {
            return { ...actor, featuredOrder: undefined };
          }

          if (nextActor.homeOrder && actor.homeOrder === nextActor.homeOrder) {
            return { ...actor, homeOrder: undefined };
          }

          return actor;
        })
      : [
          nextActor,
          ...actors.map((actor) =>
            nextActor.featuredOrder && actor.featuredOrder === nextActor.featuredOrder
              ? { ...actor, featuredOrder: undefined }
              : nextActor.homeOrder && actor.homeOrder === nextActor.homeOrder
                ? { ...actor, homeOrder: undefined }
              : actor,
          ),
        ];

    await onActorsChange(nextActors);
    resetForm();
  }

  function editActor(actor: Actor) {
    setEditingId(actor.id);
    setForm(actorToForm(actor));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function changeStatus(actorId: string, status: Actor["status"]) {
    await onActorsChange(actors.map((actor) => (actor.id === actorId ? { ...actor, status } : actor)));
  }

  async function removeActor(actorId: string) {
    await onActorsChange(actors.filter((actor) => actor.id !== actorId));
    if (editingId === actorId) {
      resetForm();
    }
  }

  async function resetDemoData() {
    await onResetDemoData();
    resetForm();
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadError("");
    setIsUploading(true);

    try {
      const photoUrl = await uploadActorPhoto(file, session.token);
      updateForm("photo", photoUrl);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Foto yüklənmədi. JPG, PNG və ya WEBP, maksimum 5MB olmalıdır.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleGalleryPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadError("");
    setIsUploading(true);

    try {
      const photoUrl = await uploadActorPhoto(file, session.token);
      updateForm("gallery", [...form.gallery.split("\n").filter(Boolean), photoUrl].join("\n"));
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Qalereya fotosu yüklənmədi. JPG, PNG və ya WEBP, maksimum 5MB olmalıdır.");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  async function handleNewsCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setNewsMessage("Xəbər şəkli yüklənir...");

    try {
      const photoUrl = await uploadActorPhoto(file, session.token);
      updateNewsForm("coverImage", photoUrl);
      setNewsMessage("Xəbər şəkli yükləndi.");
    } catch (error) {
      setNewsMessage(error instanceof Error ? error.message : "Xəbər şəkli yüklənmədi.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleAiReindex() {
    setAiIndexMessage("AI indeksi yenilənir...");

    try {
      const status = await reindexAiProfiles(session.token);
      setLocalAiIndexStatus(status);
      setAiIndexMessage(`${status.count} profil indeksləndi. Model: ${status.embeddingModel}`);
    } catch {
      setAiIndexMessage("AI indeks üçün OPENAI_API_KEY lazımdır və backend işləməlidir.");
    }
  }

  async function convertApplicationToActor(application: ActorApplication) {
    const nextActor: Actor = {
      adminBoost: 0,
      ageRange: application.ageRange,
      aiProfile: {},
      annualPaymentDate: "",
      annualPaymentStatus: "pending",
      cardExpiresAt: "",
      cardIssuedAt: "",
      cardStatus: "active",
      city: application.city,
      contact: application.contact,
      featuredOrder: undefined,
      gallery: [],
      genres: application.genres ?? [],
      hairColor: application.hairColor,
      height: application.height,
      homeOrder: undefined,
      id: makeId(actors),
      initials: makeInitials(application.name),
      languages: application.languages,
      membershipStatus: "pending",
      name: application.name,
      paymentManualConfirmed: false,
      paymentProvider: "manual",
      paymentReference: "",
      photo: undefined,
      profileKind: "real",
      rating: 0,
      ratingCount: 0,
      role: application.role,
      showreel: application.showreel,
      skills: application.skills,
      slug: slugify(application.name),
      specialSkills: application.specialSkills ?? [],
      status: "review",
      summary: application.summary,
      titles: application.titles ?? [],
      weight: application.weight,
    };
    const duplicateSlug = actors.some((actor) => actor.slug === nextActor.slug);
    const savedActor = duplicateSlug ? { ...nextActor, slug: `${nextActor.slug}-${nextActor.id.toLowerCase()}` } : nextActor;

    await onActorsChange([savedActor, ...actors]);
    await onApplicationDelete(application.id);
    editActor(savedActor);
  }

  return (
    <main className="page-shell">
      <Header />
      <section className="admin-layout">
        <div>
          <p className="eyebrow">Admin panel</p>
          <h1>Profil idarəetməsi</h1>
          <p className="lead">
            Aktyor əlavə et, redaktə et, foto yüklə və profil statusunu dəyiş.
          </p>
          <div className="admin-session-bar">
            <span>{session.admin.name} · {session.admin.email}</span>
            <button className="button secondary" onClick={onLogout} type="button">
              Çıxış
            </button>
          </div>
          <div className="admin-stats">
            <div>
              <strong>{actors.length}</strong>
              <span>ümumi profil</span>
            </div>
            <div>
              <strong>{realProfileCount}</strong>
              <span>real profil</span>
            </div>
            <div>
              <strong>{demoProfileCount}</strong>
              <span>demo profil</span>
            </div>
            <div>
              <strong>{verifiedCount}</strong>
              <span>təsdiqli</span>
            </div>
            <div>
              <strong>{reviewCount}</strong>
              <span>yoxlanılır</span>
            </div>
            <div>
              <strong>{publicActors.length}</strong>
              <span>Actors səhifəsində</span>
            </div>
            <div>
              <strong>{photoCount}</strong>
              <span>foto ilə</span>
            </div>
            <div>
              <strong>{showreelCount}</strong>
              <span>showreel ilə</span>
            </div>
            <div>
              <strong>{averageRating.toFixed(1)}</strong>
              <span>orta reytinq</span>
            </div>
            <div className={riskCount ? "risk-stat active" : "risk-stat"}>
              <strong>{riskCount}</strong>
              <span>reytinq riski</span>
            </div>
            <div className={newApplicationsCount ? "risk-stat active" : "risk-stat"}>
              <strong>{newApplicationsCount}</strong>
              <span>yeni müraciət</span>
            </div>
          </div>
          <div className="admin-browse-panel">
            <div className="admin-toolbar">
              <h2>Actors səhifəsi görünüşü</h2>
              <a className="text-link" href="/actors">
                Bax
              </a>
            </div>
            <div className="admin-browse-section">
              <span>Top 5 slide</span>
              <div className="admin-top-list">
                {browseTopActors.map((actor, index) => (
                  <button className="admin-top-item" key={actor.id} onClick={() => editActor(actor)} type="button">
                    <strong>{index + 1}</strong>
                    <span>{actor.name}</span>
                    <small>★ {effectiveRating(actor).toFixed(1)}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="admin-browse-section">
              <span>Avtomatik slide-lar</span>
              <div className="active-filter-row">
                <span>Təsdiqlənmiş profillər</span>
                <span>Xalq artisti</span>
                <span>Əməkdar artist</span>
                <span>Viral aktyor</span>
                <span>Ən yüksək reytinq</span>
                {browseCustomCategories.map((category) => (
                  <span key={category}>{category}</span>
                ))}
                {browseRoles.map((role) => (
                  <span key={role}>{role}</span>
                ))}
                {browseCities.slice(0, 4).map((city) => (
                  <span key={city}>{city}</span>
                ))}
              </div>
            </div>
            <div className="admin-browse-section">
              <span>Ana səhifə kolajı</span>
              <div className="admin-top-list">
                {homeCollageActors.map((actor, index) => (
                  <button className="admin-top-item" key={actor.id} onClick={() => editActor(actor)} type="button">
                    <strong>{index + 1}</strong>
                    <span>{actor.name}</span>
                    <small>{actor.homeOrder ? "manual" : "auto"}</small>
                  </button>
                ))}
              </div>
            </div>
            <p>
              Top 5 üçün “Top 5 sırası”, ana səhifə kolajı üçün “Ana səhifə kolaj sırası” yaz.
              Boş yerlər reytinqə görə avtomatik tamamlanır. Yeni Baza slide üçün profilə “Baza slide kateqoriyaları” əlavə et.
            </p>
          </div>
          <div className="admin-browse-panel">
            <div className="admin-toolbar">
              <h2>AI kastinq indeksi</h2>
              <button className="button secondary" onClick={handleAiReindex} type="button">
                AI indeksini yenilə
              </button>
            </div>
            <div className="admin-stats">
              <div className={localAiIndexStatus?.enabled ? "risk-stat" : "risk-stat active"}>
                <strong>{localAiIndexStatus?.enabled ? "Aktiv" : "Açar yoxdur"}</strong>
                <span>OpenAI</span>
              </div>
              <div>
                <strong>{localAiIndexStatus?.indexedCount ?? 0}</strong>
                <span>indekslənmiş profil</span>
              </div>
            </div>
            <p>
              AI bio və profil metadatası embedding indeksinə düşür. Rejissor promptu əvvəlcə
              semantik axtarışla uyğun namizədləri tapır, sonra AI/scoring izah verir.
            </p>
            {aiIndexMessage && <div className="upload-state">{aiIndexMessage}</div>}
          </div>
          <div className="admin-browse-panel">
            <div className="admin-toolbar">
              <h2>AI feedback tarixçəsi</h2>
              <a className="text-link" href="/casting-ai">
                Test et
              </a>
            </div>
            {aiFeedback.length ? (
              <div className="feedback-list">
                {aiFeedback.slice(0, 8).map((item) => (
                  <div className="feedback-item" key={item.id}>
                    <div>
                      <strong>{item.actorName}</strong>
                      <span>{item.decision === "good" ? "Uyğundur" : item.decision === "bad" ? "Uyğun deyil" : "Bəlkə"}</span>
                    </div>
                    <p>{item.prompt}</p>
                    <small>{new Date(item.createdAt).toLocaleString("az-AZ")} · {item.adminEmail}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p>Hələ AI nəticələrinə admin feedback verilməyib.</p>
            )}
          </div>
        </div>

        <form className="admin-form" onSubmit={submitActor}>
          <div className="form-header">
            <h2>{editingActor ? `${editingActor.name} redaktə olunur` : "Yeni aktyor"}</h2>
            <button className="button secondary" onClick={resetForm} type="button">
              Təmizlə
            </button>
          </div>

          <label>
            Ad soyad
            <input
              onChange={(event) => updateForm("name", event.target.value)}
              required
              value={form.name}
            />
          </label>
          <div className="form-grid">
            <label>
              Kateqoriya
              <select onChange={(event) => updateForm("role", event.target.value)} value={form.role}>
                <option>Aktyor</option>
                <option>Aktrisa</option>
                <option>Tələbə aktyor</option>
                <option>Uşaq aktyor</option>
              </select>
            </label>
            <label>
              Status
              <select
                onChange={(event) => updateForm("status", event.target.value as Actor["status"])}
                value={form.status}
              >
                <option value="review">Yoxlanılır</option>
                <option value="verified">Təsdiqlənmiş</option>
                <option value="inactive">Deaktiv</option>
              </select>
            </label>
            <label>
              Profil tipi
              <select
                onChange={(event) => updateForm("profileKind", event.target.value as ActorForm["profileKind"])}
                value={form.profileKind}
              >
                <option value="real">Real profil</option>
                <option value="demo">Demo profil</option>
              </select>
            </label>
            <label>
              Şəhər
              <input onChange={(event) => updateForm("city", event.target.value)} value={form.city} />
            </label>
            <label>
              Yaş aralığı
              <input
                onChange={(event) => updateForm("ageRange", event.target.value)}
                placeholder="28-35"
                value={form.ageRange}
              />
            </label>
            <label>
              Boy
              <input
                onChange={(event) => updateForm("height", event.target.value)}
                placeholder="178 sm"
                value={form.height}
              />
            </label>
            <label>
              Çəki
              <input
                onChange={(event) => updateForm("weight", event.target.value)}
                placeholder="74 kg"
                value={form.weight}
              />
            </label>
            <label>
              Saç rəngi
              <input
                onChange={(event) => updateForm("hairColor", event.target.value)}
                placeholder="Qara"
                value={form.hairColor}
              />
            </label>
            <label>
              Dillər
              <input
                onChange={(event) => updateForm("languages", event.target.value)}
                placeholder="Azərbaycan, Rus"
                value={form.languages}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Real reytinq
              <input
                max="5"
                min="0"
                onChange={(event) => updateForm("rating", event.target.value)}
                step="0.1"
                type="number"
                value={form.rating}
              />
            </label>
            <label>
              Səs sayı
              <input
                min="0"
                onChange={(event) => updateForm("ratingCount", event.target.value)}
                step="1"
                type="number"
                value={form.ratingCount}
              />
            </label>
            <label>
              Admin düzəlişi
              <input
                max="1"
                min="-1"
                onChange={(event) => updateForm("adminBoost", event.target.value)}
                step="0.1"
                type="number"
                value={form.adminBoost}
              />
            </label>
            <label>
              Top 5 sırası
              <input
                max="5"
                min="1"
                onChange={(event) => updateForm("featuredOrder", event.target.value)}
                placeholder="Boş saxla və ya 1-5"
                type="number"
                value={form.featuredOrder}
              />
            </label>
            <label>
              Ana səhifə kolaj sırası
              <input
                max="6"
                min="1"
                onChange={(event) => updateForm("homeOrder", event.target.value)}
                placeholder="Boş saxla və ya 1-6"
                type="number"
                value={form.homeOrder}
              />
            </label>
            <label>
              Kart statusu
              <select
                onChange={(event) => updateForm("cardStatus", event.target.value)}
                value={form.cardStatus}
              >
                <option value="active">Aktiv</option>
                <option value="inactive">Deaktiv</option>
              </select>
            </label>
            <label>
              Üzvlük statusu
              <select
                onChange={(event) => updateForm("membershipStatus", event.target.value)}
                value={form.membershipStatus}
              >
                <option value="active">Aktiv</option>
                <option value="pending">Gözləmədə</option>
                <option value="expired">Bitib</option>
                <option value="cancelled">Ləğv edilib</option>
              </select>
            </label>
            <label>
              İllik ödəniş
              <select
                onChange={(event) => updateForm("annualPaymentStatus", event.target.value)}
                value={form.annualPaymentStatus}
              >
                <option value="paid">Ödənilib</option>
                <option value="pending">Gözləmədə</option>
                <option value="expired">Bitib</option>
              </select>
            </label>
            <label>
              Ödəniş tarixi
              <input
                onChange={(event) => updateForm("annualPaymentDate", event.target.value)}
                type="date"
                value={form.annualPaymentDate}
              />
            </label>
            <label>
              Ödəniş mənbəyi
              <select
                onChange={(event) => updateForm("paymentProvider", event.target.value)}
                value={form.paymentProvider}
              >
                <option value="manual">Manual</option>
                <option value="online">Online</option>
              </select>
            </label>
            <label>
              Ödəniş referansı
              <input
                onChange={(event) => updateForm("paymentReference", event.target.value)}
                placeholder="Qəbz, transaction ID və ya qeyd"
                value={form.paymentReference}
              />
            </label>
            <label>
              Kart verilmə tarixi
              <input
                onChange={(event) => updateForm("cardIssuedAt", event.target.value)}
                type="date"
                value={form.cardIssuedAt}
              />
            </label>
            <label>
              Kart bitmə tarixi
              <input
                onChange={(event) => updateForm("cardExpiresAt", event.target.value)}
                type="date"
                value={form.cardExpiresAt}
              />
            </label>
            <label className="consent-row">
              <input
                checked={form.paymentManualConfirmed}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  paymentManualConfirmed: event.target.checked,
                }))}
                type="checkbox"
              />
              Admin manual ödənişi təsdiqləyib
            </label>
            <div className="admin-rating-preview">
              Görünən reytinq:{" "}
              {Math.min(
                5,
                Math.max(0, (Number(form.rating) || 0) + (Number(form.adminBoost) || 0)),
              ).toFixed(1)}
            </div>
          </div>

          <label>
            Bacarıqlar
            <input
              onChange={(event) => updateForm("skills", event.target.value)}
              placeholder="Kino, Teatr, Reklam"
              value={form.skills}
            />
          </label>
          <div className="form-grid">
            <label>
              Janrlar
              <input
                onChange={(event) => updateForm("genres", event.target.value)}
                placeholder="Dram, Komediya, Tarixi, Aksiyon"
                value={form.genres}
              />
            </label>
            <label>
              Xüsusi bacarıqlar
              <input
                onChange={(event) => updateForm("specialSkills", event.target.value)}
                placeholder="At sürmə, döyüş səhnəsi, rəqs, musiqi aləti"
                value={form.specialSkills}
              />
            </label>
          </div>
          <label>
            Titullar
            <input
              onChange={(event) => updateForm("titles", event.target.value)}
              placeholder="Xalq artisti, Əməkdar artist, Viral aktyor"
              value={form.titles}
            />
          </label>
          <label>
            Baza slide kateqoriyaları
            <input
              onChange={(event) => updateForm("browseCategories", event.target.value)}
              placeholder="İnkluziv, Reklam simaları, Gənc istedadlar"
              value={form.browseCategories}
            />
          </label>
          <label>
            Qısa təsvir
            <textarea
              onChange={(event) => updateForm("summary", event.target.value)}
              rows={4}
              value={form.summary}
            />
          </label>
          <label>
            AI üçün bio
            <textarea
              onChange={(event) => updateForm("aiBio", event.target.value)}
              placeholder="AI kastinq üçün xarakter, janr, rol tipi, xüsusi bacarıq, kamera təcrübəsi və uyğun obrazları geniş yaz."
              rows={5}
              value={form.aiBio}
            />
          </label>
          <div className="form-grid">
            <label>
              Obraz tipləri
              <input
                onChange={(event) => updateForm("aiTypecasts", event.target.value)}
                placeholder="ata, müəllim, biznesmen, kənd adamı"
                value={form.aiTypecasts}
              />
            </label>
            <label>
              Emosional diapazon
              <input
                onChange={(event) => updateForm("aiEmotionalRange", event.target.value)}
                placeholder="sərt, sakit, aqressiv, komik, həssas"
                value={form.aiEmotionalRange}
              />
            </label>
          </div>
          <div className="form-grid">
            <label>
              Dialekt / aksan
              <input
                onChange={(event) => updateForm("aiDialects", event.target.value)}
                placeholder="Bakı, Qarabağ, Gəncə, rus aksenti"
                value={form.aiDialects}
              />
            </label>
            <label>
              Məhdudiyyətlər
              <input
                onChange={(event) => updateForm("aiLimitations", event.target.value)}
                placeholder="ekstremal döyüş yox, gecə çəkilişi yox"
                value={form.aiLimitations}
              />
            </label>
          </div>
          <label>
            Görünüş qeydləri
            <textarea
              onChange={(event) => updateForm("aiLookNotes", event.target.value)}
              placeholder="Sərt baxış, sakit mimika, klassik görünüş, müasir şəhər tipi..."
              rows={3}
              value={form.aiLookNotes}
            />
          </label>
          <div className="form-grid">
            <label>
              Kamera təcrübəsi
              <textarea
                onChange={(event) => updateForm("aiCameraExperience", event.target.value)}
                placeholder="Serial, reklam, yaxın plan, improvizasiya..."
                rows={3}
                value={form.aiCameraExperience}
              />
            </label>
            <label>
              Səhnə təcrübəsi
              <textarea
                onChange={(event) => updateForm("aiStageExperience", event.target.value)}
                placeholder="Teatr, monoloq, səhnə nitqi, canlı performans..."
                rows={3}
                value={form.aiStageExperience}
              />
            </label>
          </div>
          <label>
            Admin AI qeydi
            <textarea
              onChange={(event) => updateForm("aiPerformanceNotes", event.target.value)}
              placeholder="Bu aktyor hansı rollarda daha inandırıcıdır, AI hansı hallarda onu önə çıxarsın?"
              rows={3}
              value={form.aiPerformanceNotes}
            />
          </label>
          <div className="form-grid">
            <label>
              Showreel link
              <input
                onChange={(event) => updateForm("showreel", event.target.value)}
                placeholder="https://..."
                value={form.showreel}
              />
            </label>
            <label>
              Əlaqə
              <input
                onChange={(event) => updateForm("contact", event.target.value)}
                placeholder="+994..."
                value={form.contact}
              />
            </label>
          </div>
          <label>
            Foto
            <input accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} type="file" />
          </label>
          {isUploading && <div className="upload-state">Foto yüklənir...</div>}
          {uploadError && <div className="form-error">{uploadError}</div>}
          {form.photo && (
            <div className="photo-preview">
              <img alt="Profil fotosu" src={form.photo} />
              <button className="button secondary" onClick={() => updateForm("photo", "")} type="button">
                Fotonu sil
              </button>
            </div>
          )}
          <label>
            Foto qalereyası
            <input accept="image/jpeg,image/png,image/webp" onChange={handleGalleryPhoto} type="file" />
          </label>
          {form.gallery && (
            <div className="gallery-preview">
              {form.gallery.split("\n").filter(Boolean).map((photoUrl) => (
                <div className="gallery-preview-item" key={photoUrl}>
                  <img alt="Qalereya fotosu" src={photoUrl} />
                  <button
                    className="button secondary"
                    onClick={() =>
                      updateForm(
                        "gallery",
                        form.gallery
                          .split("\n")
                          .filter((item) => item && item !== photoUrl)
                          .join("\n"),
                      )
                    }
                    type="button"
                  >
                    Sil
                  </button>
                </div>
              ))}
            </div>
          )}
          <button className="button" type="submit">
            {editingActor ? "Yadda saxla" : "Aktyor əlavə et"}
          </button>
        </form>
      </section>

      <section className="section admin-news-section">
        <div className="admin-toolbar">
          <div>
            <h2>Xəbərlər</h2>
            <p>Aktyorlarımızı yönləndirdiyimiz kino, serial, reklam və layihələr barədə paylaşım et.</p>
          </div>
          <a className="text-link" href="/news">
            Public bax
          </a>
        </div>
        <form className="admin-form news-admin-form" onSubmit={submitNews}>
          <div className="form-header">
            <h2>{newsForm.id ? "Xəbər redaktə olunur" : "Yeni xəbər"}</h2>
            <button className="button secondary" onClick={resetNewsForm} type="button">
              Təmizlə
            </button>
          </div>
          <div className="form-grid">
            <label>
              Başlıq
              <input
                onChange={(event) => updateNewsForm("title", event.target.value)}
                required
                value={newsForm.title}
              />
            </label>
            <label>
              Slug
              <input
                onChange={(event) => updateNewsForm("slug", slugify(event.target.value))}
                placeholder="layihe-xeberi"
                required
                value={newsForm.slug}
              />
            </label>
            <label>
              Layihə adı
              <input
                onChange={(event) => updateNewsForm("projectName", event.target.value)}
                placeholder="Film, serial və ya layihə adı"
                value={newsForm.projectName}
              />
            </label>
            <label>
              Status
              <select
                onChange={(event) => updateNewsForm("status", event.target.value as NewsPost["status"])}
                value={newsForm.status}
              >
                <option value="draft">Draft</option>
                <option value="published">Yayımda</option>
              </select>
            </label>
            <label>
              Yayım tarixi
              <input
                onChange={(event) => updateNewsForm("publishedAt", event.target.value)}
                type="date"
                value={newsForm.publishedAt}
              />
            </label>
            <label>
              Cover foto
              <input accept="image/jpeg,image/png,image/webp" onChange={handleNewsCover} type="file" />
            </label>
          </div>
          <label>
            Qısa giriş
            <textarea
              onChange={(event) => updateNewsForm("excerpt", event.target.value)}
              required
              rows={3}
              value={newsForm.excerpt}
            />
          </label>
          <label>
            Xəbər mətni
            <textarea
              onChange={(event) => updateNewsForm("content", event.target.value)}
              required
              rows={8}
              value={newsForm.content}
            />
          </label>
          <div className="form-grid">
            <label>
              SEO başlıq
              <input
                onChange={(event) => updateNewsForm("seoTitle", event.target.value)}
                placeholder="Google üçün başlıq"
                value={newsForm.seoTitle}
              />
            </label>
            <label>
              SEO açıqlama
              <input
                onChange={(event) => updateNewsForm("seoDescription", event.target.value)}
                placeholder="Google nəticəsində görünəcək qısa mətn"
                value={newsForm.seoDescription}
              />
            </label>
          </div>
          {newsForm.coverImage && (
            <div className="photo-preview">
              <img alt="Xəbər cover" src={newsForm.coverImage} />
              <button className="button secondary" onClick={() => updateNewsForm("coverImage", "")} type="button">
                Şəkli sil
              </button>
            </div>
          )}
          {newsMessage && <div className="upload-state">{newsMessage}</div>}
          <button className="button" type="submit">
            {newsForm.id ? "Xəbəri yadda saxla" : "Xəbər əlavə et"}
          </button>
        </form>
        <div className="admin-table news-admin-list">
          {newsPosts.length ? (
            newsPosts.map((post) => (
              <div className="admin-row" key={post.id}>
                <NewsCover post={post} />
                <div>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  <div className="badge-row">
                    <span className={post.status === "published" ? "badge success" : "badge warning"}>
                      {post.status === "published" ? "Yayımda" : "Draft"}
                    </span>
                    {post.projectName && <span className="badge">{post.projectName}</span>}
                    {post.publishedAt && <span className="badge">{formatNewsDate(post.publishedAt)}</span>}
                    {post.status === "published" && (
                      <a className="text-link" href={`/news/${post.slug}`}>
                        Aç
                      </a>
                    )}
                  </div>
                </div>
                <div className="row-actions">
                  <button className="button secondary" onClick={() => editNews(post)} type="button">
                    Redaktə
                  </button>
                  <button className="button danger" onClick={() => removeNews(post.id)} type="button">
                    Sil
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <h2>Xəbər yoxdur</h2>
              <p>İlk layihə xəbərini yuxarıdakı formadan əlavə et.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="admin-toolbar">
          <h2>Müraciətlər</h2>
          <span>{applications.length} müraciət</span>
        </div>
        <div className="admin-table">
          {applications.length ? (
            applications.map((application) => (
              <div className="application-row" key={application.id}>
                {application.photo ? (
                  <img alt={application.name} src={application.photo} />
                ) : (
                  <div className="application-avatar">{makeInitials(application.name)}</div>
                )}
                <div>
                  <h3>{application.name}</h3>
                  <p>
                    {application.role} · {application.city} · {application.ageRange} · {application.contact}
                  </p>
                  <p>{application.summary}</p>
                  <div className="badge-row">
                    <span className="badge">{application.status}</span>
                    {application.languages.map((language) => (
                      <span className="badge" key={language}>
                        {language}
                      </span>
                    ))}
                    {application.skills.map((skill) => (
                      <span className="badge" key={skill}>
                        {skill}
                      </span>
                    ))}
                    {application.genres?.map((genre) => (
                      <span className="badge" key={genre}>
                        Janr: {genre}
                      </span>
                    ))}
                    {application.specialSkills?.map((skill) => (
                      <span className="badge success" key={skill}>
                        Xüsusi: {skill}
                      </span>
                    ))}
                    {application.titles?.map((title) => (
                      <span className="badge success" key={title}>
                        {title}
                      </span>
                    ))}
                    {application.showreel && (
                      <a className="text-link" href={application.showreel} rel="noreferrer" target="_blank">
                        Showreel
                      </a>
                    )}
                  </div>
                </div>
                <div className="row-actions">
                  <button
                    className="button"
                    disabled={application.status === "approved"}
                    onClick={() => convertApplicationToActor(application)}
                    type="button"
                  >
                    Profilə çevir
                  </button>
                  <select
                    onChange={(event) =>
                      onApplicationStatusChange(
                        application.id,
                        event.target.value as ActorApplication["status"],
                      )
                    }
                    value={application.status}
                  >
                    <option value="new">Yeni</option>
                    <option value="review">Yoxlanılır</option>
                    <option value="approved">Təsdiqləndi</option>
                    <option value="rejected">Rədd edildi</option>
                  </select>
                  <button
                    className="button danger"
                    onClick={() => onApplicationDelete(application.id)}
                    type="button"
                  >
                    Sil
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <h2>Hələ müraciət yoxdur</h2>
              <p>Public müraciət formasından göndərilən məlumatlar burada görünəcək.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="admin-toolbar">
          <h2>Profillər</h2>
          <div className="admin-toolbar-actions">
            <input
              aria-label="Admin aktyor axtarışı"
              onChange={(event) => {
                setAdminActorQuery(event.target.value);
                setAdminActorPage(1);
              }}
              placeholder="Ad, ID, rol, şəhər, titul..."
              value={adminActorQuery}
            />
            <button
              className="button secondary"
              onClick={() => {
                setAdminActorQuery("");
                setAdminActorPage(1);
              }}
              type="button"
            >
              Axtarışı təmizlə
            </button>
            <button className="button secondary" onClick={resetDemoData} type="button">
              Demo datanı bərpa et
            </button>
          </div>
        </div>
        {adminActorQuery && (
          <div className="active-filter-row">
            <span>{adminFilteredActors.length} nəticə</span>
            <span>{adminActorQuery}</span>
          </div>
        )}
        <div className="admin-table">
          {adminVisibleActors.map((actor) => (
            <div className="admin-row" key={actor.id}>
              <Portrait actor={actor} />
              <div>
                <h3>{actor.name}</h3>
                <p>
                  {actor.id} · {actor.role} · {actor.city} · ★{" "}
                  {effectiveRating(actor).toFixed(1)}
                </p>
                <div className="badge-row">
                  <span className={`badge ${actor.status === "verified" ? "success" : ""}`}>
                    {actor.status}
                  </span>
                  <span className={actor.profileKind === "demo" ? "badge warning" : "badge success"}>
                    {actor.profileKind === "demo" ? "Demo" : "Real"}
                  </span>
                  <span className="badge rating-badge">
                    real {actor.rating.toFixed(1)} / boost {actor.adminBoost.toFixed(1)}
                  </span>
                  {actorTopRank.has(actor.id) && (
                    <span className="badge success">Top {actorTopRank.get(actor.id)}</span>
                  )}
                  {actor.featuredOrder && (
                    <span className="badge rating-badge">Manual Top {actor.featuredOrder}</span>
                  )}
                  {actor.homeOrder && (
                    <span className="badge rating-badge">Home kolaj {actor.homeOrder}</span>
                  )}
                  {(actor.browseCategories ?? []).map((category) => (
                    <span className="badge" key={category}>Slide: {category}</span>
                  ))}
                  <span className={actor.cardStatus === "inactive" ? "badge warning" : "badge success"}>
                    Kart: {actor.cardStatus === "inactive" ? "deaktiv" : "aktiv"}
                  </span>
                  <span className={(actor.membershipStatus ?? "active") === "active" ? "badge success" : "badge warning"}>
                    Üzvlük: {actor.membershipStatus ?? "active"}
                  </span>
                  <span className={(actor.annualPaymentStatus ?? "paid") === "paid" ? "badge success" : "badge warning"}>
                    Ödəniş: {actor.annualPaymentStatus ?? "paid"}
                  </span>
                  <span className={actor.paymentManualConfirmed || actor.paymentProvider === "online" ? "badge success" : "badge warning"}>
                    Təsdiq: {actor.paymentManualConfirmed ? "manual" : actor.paymentProvider ?? "manual"}
                  </span>
                  {actor.annualPaymentDate && (
                    <span className="badge">Ödəniş tarixi: {actor.annualPaymentDate}</span>
                  )}
                  {actor.cardExpiresAt && (
                    <span className={isDateExpired(actor.cardExpiresAt) ? "badge warning" : "badge"}>
                      Bitir: {actor.cardExpiresAt}
                    </span>
                  )}
                  {Boolean(actor.gallery?.length) && (
                    <span className="badge">Qalereya: {actor.gallery?.length}</span>
                  )}
                  {actor.aiBio && <span className="badge success">AI bio var</span>}
                  {actor.photo ? (
                    <span className="badge success">Foto var</span>
                  ) : (
                    <span className="badge warning">Studio fotosu yoxdur</span>
                  )}
                  <span className="badge">Slide: {actor.role}</span>
                  <span className="badge">Şəhər: {actor.city}</span>
                  {(actor.genres ?? []).slice(0, 3).map((genre) => (
                    <span className="badge" key={genre}>Janr: {genre}</span>
                  ))}
                  {(actor.specialSkills ?? []).slice(0, 3).map((skill) => (
                    <span className="badge success" key={skill}>Xüsusi: {skill}</span>
                  ))}
                  {(actor.titles ?? []).map((title) => (
                    <span className="badge success" key={title}>{title}</span>
                  ))}
                  {getActorScoreRisk(actor) && (
                    <span className="badge warning">{getActorScoreRisk(actor)}</span>
                  )}
                  <a className="text-link" href={`/actors/${actor.slug}`}>
                    Profil
                  </a>
                  <a className="text-link" href={`/id/${actor.id}`}>
                    ID
                  </a>
                  <a className="text-link" href={getActorCardPdfUrl(actor.id)}>
                    PDF
                  </a>
                </div>
              </div>
              <div className="row-actions">
                <select
                  aria-label={`${actor.name} statusu`}
                  onChange={(event) =>
                    changeStatus(actor.id, event.target.value as Actor["status"])
                  }
                  value={actor.status}
                >
                  <option value="review">Yoxlanılır</option>
                  <option value="verified">Təsdiqlənmiş</option>
                  <option value="inactive">Deaktiv</option>
                </select>
                <button className="button secondary" onClick={() => editActor(actor)} type="button">
                  Redaktə
                </button>
                <button className="button danger" onClick={() => removeActor(actor.id)} type="button">
                  Sil
                </button>
              </div>
            </div>
          ))}
          {!adminFilteredActors.length && (
            <div className="empty-state">
              <h2>Aktyor tapılmadı</h2>
              <p>Axtarışı dəyiş və ya təmizlə.</p>
            </div>
          )}
        </div>
        {adminFilteredActors.length > adminPageSize && (
          <div className="pagination-row">
            <button
              className="button secondary"
              disabled={adminActorPage === 1}
              onClick={() => setAdminActorPage((page) => Math.max(1, page - 1))}
              type="button"
            >
              Əvvəlki
            </button>
            <span>
              Səhifə {adminActorPage} / {adminPageCount}
            </span>
            <button
              className="button secondary"
              disabled={adminActorPage === adminPageCount}
              onClick={() => setAdminActorPage((page) => Math.min(adminPageCount, page + 1))}
              type="button"
            >
              Növbəti
            </button>
          </div>
        )}
      </section>

      <section className="section">
        <div className="admin-toolbar">
          <h2>Kart və ödəniş tarixçəsi</h2>
          <span>{auditLogs.filter(isCardOrPaymentAudit).length} qeyd</span>
        </div>
        <div className="admin-table audit-table">
          {auditLogs.filter(isCardOrPaymentAudit).length ? (
            auditLogs.filter(isCardOrPaymentAudit).map((log) => (
              <div className="audit-row readable" key={log.id}>
                <div>
                  <strong>{String(log.details.name ?? log.entityId ?? "Profil")}</strong>
                  <p>{auditDetailLines(log).join(" · ")}</p>
                  <small>{log.adminEmail} · {new Date(log.createdAt).toLocaleString("az-AZ")}</small>
                </div>
                <span>{auditActionLabel(log.action)}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <h2>Kart/ödəniş dəyişiklikləri yoxdur</h2>
              <p>Kart, üzvlük və ödəniş sahələri dəyişəndə burada ayrıca görünəcək.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="admin-toolbar">
          <h2>Audit log</h2>
          <span>{auditLogs.length} qeyd</span>
        </div>
        <div className="admin-table audit-table">
          {auditLogs.length ? (
            auditLogs.map((log) => (
              <div className="audit-row readable" key={log.id}>
                <div>
                  <strong>{auditActionLabel(log.action)}</strong>
                  <p>
                    {log.entityType} {log.entityId ? `· ${log.entityId}` : ""} · {log.adminEmail}
                  </p>
                  <small>{auditDetailLines(log).join(" · ")}</small>
                </div>
                <span>{new Date(log.createdAt).toLocaleString("az-AZ")}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <h2>Audit qeydi yoxdur</h2>
              <p>Admin dəyişiklikləri burada görünəcək.</p>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="admin-toolbar">
          <h2>Reytinq müdaxiləsi tarixçəsi</h2>
          <span>{auditLogs.filter((log) => log.action === "rating_update").length} qeyd</span>
        </div>
        <div className="admin-table audit-table">
          {auditLogs.filter((log) => log.action === "rating_update").length ? (
            auditLogs
              .filter((log) => log.action === "rating_update")
              .map((log) => (
                <div className="audit-row" key={log.id}>
                  <div>
                    <strong>{String(log.details.name ?? log.entityId ?? "Profil")}</strong>
                    <p>{auditDetailLines(log).join(" · ")}</p>
                  </div>
                  <span>{new Date(log.createdAt).toLocaleString("az-AZ")}</span>
                </div>
              ))
          ) : (
            <div className="empty-state">
              <h2>Reytinq müdaxiləsi yoxdur</h2>
              <p>Real reytinq, səs sayı və admin boost dəyişəndə burada qeyd yaranacaq.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function NotFoundPage() {
  return (
    <main className="page-shell">
      <Header />
      <section className="section">
        <h1>Səhifə tapılmadı</h1>
        <p className="lead">Axtardığınız profil və ya ID mövcud deyil.</p>
        <a className="button" href="/">
          Ana səhifə
        </a>
      </section>
    </main>
  );
}

function App() {
  const [actors, setActors] = useState<Actor[]>(readActors);
  const [votes, setVotes] = useState<Record<string, number>>(readVotes);
  const [shortlist, setShortlist] = useState<string[]>(readShortlist);
  const [adminSession, setAdminSession] = useState<AdminSession | null>(readAdminSession);
  const [applications, setApplications] = useState<ActorApplication[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [aiFeedback, setAiFeedback] = useState<AiCastingFeedback[]>([]);
  const [aiIndexStatus, setAiIndexStatus] = useState<AiIndexStatus | null>(null);
  const [newsPosts, setNewsPosts] = useState<NewsPost[]>([]);
  const [apiStatus, setApiStatus] = useState<"loading" | "online" | "offline">("loading");
  const path = window.location.pathname;

  useEffect(() => {
    fetchNewsFromApi()
      .then((posts) => {
        setNewsPosts(posts);
        setApiStatus("online");
      })
      .catch(() => {
        setApiStatus("offline");
      });
  }, []);

  useEffect(() => {
    fetchActorsFromApi()
      .then((apiActors) => {
        setActors(apiActors);
        saveActors(apiActors);
        setApiStatus("online");
      })
      .catch(() => {
        setApiStatus("offline");
      });
  }, []);

  useEffect(() => {
    setSeo(getRouteSeo(path, actors, newsPosts));
  }, [actors, newsPosts, path]);

  useEffect(() => {
    if (!adminSession) {
      setApplications([]);
      setAuditLogs([]);
      setAiFeedback([]);
      setAiIndexStatus(null);
      return;
    }

    let isActive = true;
    const adminToken = adminSession.token;

    async function loadAdminData() {
      const [nextApplications, nextAuditLogs, nextAiFeedback, nextAiIndexStatus, nextNewsPosts] =
        await Promise.allSettled([
          fetchApplications(adminToken),
          fetchAuditLogs(adminToken),
          fetchAiCastingFeedback(adminToken),
          fetchAiIndexStatus(adminToken),
          fetchAdminNews(adminToken),
        ]);

      if (!isActive) {
        return;
      }

      if (nextApplications.status === "fulfilled") {
        setApplications(nextApplications.value);
        setApiStatus("online");
      } else {
        setApiStatus("offline");
      }

      if (nextAuditLogs.status === "fulfilled") {
        setAuditLogs(nextAuditLogs.value);
      }

      if (nextAiFeedback.status === "fulfilled") {
        setAiFeedback(nextAiFeedback.value);
      }

      if (nextAiIndexStatus.status === "fulfilled") {
        setAiIndexStatus(nextAiIndexStatus.value);
      }

      if (nextNewsPosts.status === "fulfilled") {
        setNewsPosts(nextNewsPosts.value);
      }
    }

    loadAdminData();
    const intervalId = window.setInterval(loadAdminData, 30000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, [adminSession]);

  async function updateActors(nextActors: Actor[]) {
    setActors(nextActors);
    saveActors(nextActors);

    try {
      const savedActors = await replaceActorsInApi(nextActors, adminSession?.token);
      setActors(savedActors);
      saveActors(savedActors);
      if (adminSession?.token) {
        setAuditLogs(await fetchAuditLogs(adminSession.token));
        setAiFeedback(await fetchAiCastingFeedback(adminSession.token));
      }
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }
  }

  async function resetDemoData() {
    try {
      const resetActors = await resetSeedInApi(adminSession?.token);
      setActors(resetActors);
      saveActors(resetActors);
      setApiStatus("online");
    } catch {
      setActors(initialActors);
      saveActors(initialActors);
      setApiStatus("offline");
    }
  }

  async function handleAdminLogin(email: string, password: string) {
    const session = await loginAdmin(email, password);
    setAdminSession(session);
    saveAdminSession(session);
    setApiStatus("online");
  }

  function handleAdminLogout() {
    setAdminSession(null);
    saveAdminSession(null);
  }

  async function changeApplicationStatus(id: number, status: ActorApplication["status"]) {
    if (!adminSession) {
      return;
    }

    const updatedApplication = await updateApplicationStatus(id, status, adminSession.token);
    setApplications((current) =>
      current.map((application) =>
        application.id === updatedApplication.id ? updatedApplication : application,
      ),
    );
    setAuditLogs(await fetchAuditLogs(adminSession.token));
    setAiFeedback(await fetchAiCastingFeedback(adminSession.token));
  }

  async function removeApplication(id: number) {
    if (!adminSession) {
      return;
    }

    await deleteApplication(id, adminSession.token);
    setApplications((current) => current.filter((application) => application.id !== id));
    setAuditLogs(await fetchAuditLogs(adminSession.token));
    setAiFeedback(await fetchAiCastingFeedback(adminSession.token));
  }

  async function saveNewsPost(post: NewsPostInput) {
    if (!adminSession) {
      return;
    }

    await saveAdminNewsPost(post, adminSession.token);
    const [nextNewsPosts, nextAuditLogs] = await Promise.all([
      fetchAdminNews(adminSession.token),
      fetchAuditLogs(adminSession.token),
    ]);
    setNewsPosts(nextNewsPosts);
    setAuditLogs(nextAuditLogs);
    setApiStatus("online");
  }

  async function deleteNewsPost(id: number) {
    if (!adminSession) {
      return;
    }

    await deleteAdminNewsPost(id, adminSession.token);
    const [nextNewsPosts, nextAuditLogs] = await Promise.all([
      fetchAdminNews(adminSession.token),
      fetchAuditLogs(adminSession.token),
    ]);
    setNewsPosts(nextNewsPosts);
    setAuditLogs(nextAuditLogs);
    setApiStatus("online");
  }

  async function rateActor(actorId: string, rating: number) {
    if (votes[actorId]) {
      return;
    }

    const nextVotes = { ...votes, [actorId]: rating };

    try {
      const updatedActor = await rateActorInApi(actorId, rating, getVoterId());
      const nextActors = actors.map((actor) => (actor.id === actorId ? updatedActor : actor));

      setActors(nextActors);
      saveActors(nextActors);
      setApiStatus("online");
      setVotes(nextVotes);
      saveVotes(nextVotes);
      return;
    } catch (error) {
      if (error instanceof Error && error.message.includes("already rated")) {
        setVotes(nextVotes);
        saveVotes(nextVotes);
        return;
      }

      setApiStatus("offline");
    }

    const nextActors = actors.map((actor) => {
      if (actor.id !== actorId) {
        return actor;
      }

      const nextCount = actor.ratingCount + 1;
      const nextRating = (actor.rating * actor.ratingCount + rating) / nextCount;

      return {
        ...actor,
        rating: Number(nextRating.toFixed(2)),
        ratingCount: nextCount,
      };
    });

    setActors(nextActors);
    saveActors(nextActors);
    setVotes(nextVotes);
    saveVotes(nextVotes);
  }

  function toggleShortlist(actorId: string) {
    const nextShortlist = shortlist.includes(actorId)
      ? shortlist.filter((id) => id !== actorId)
      : [...shortlist, actorId];

    setShortlist(nextShortlist);
    saveShortlist(nextShortlist);
  }

  if (path === "/actors") {
    return (
      <ActorsPage
        actors={actors}
        onToggleShortlist={toggleShortlist}
        shortlist={shortlist}
      />
    );
  }

  if (path === "/shortlist") {
    return (
      <ShortlistPage
        actors={actors}
        onToggleShortlist={toggleShortlist}
        shortlist={shortlist}
      />
    );
  }

  if (path === "/news") {
    return <NewsListPage posts={newsPosts.filter((post) => post.status === "published")} />;
  }

  if (path.startsWith("/news/")) {
    const slug = decodeURIComponent(path.replace("/news/", ""));
    const post = newsPosts.find((item) => item.slug === slug && item.status === "published");
    return post ? <NewsDetailPage post={post} /> : <NotFoundPage />;
  }

  if (path === "/apply") {
    return <ApplyPage />;
  }

  if (path === "/casting-ai") {
    return <CastingAiPage adminSession={adminSession} onToggleShortlist={toggleShortlist} shortlist={shortlist} />;
  }

  if (path.startsWith("/actors/")) {
    return (
      <ActorProfilePage
        actors={actors}
        onRateActor={rateActor}
        slug={decodeURIComponent(path.replace("/actors/", ""))}
        votes={votes}
      />
    );
  }

  if (path.startsWith("/id/")) {
    return <VerificationPage actors={actors} id={decodeURIComponent(path.replace("/id/", ""))} />;
  }

  if (path === "/admin") {
    if (!adminSession) {
      return <AdminLoginPage onLogin={handleAdminLogin} />;
    }

    return (
      <AdminPage
        applications={applications}
        aiFeedback={aiFeedback}
        auditLogs={auditLogs}
        aiIndexStatus={aiIndexStatus}
        actors={actors}
        newsPosts={newsPosts}
        onApplicationDelete={removeApplication}
        onApplicationStatusChange={changeApplicationStatus}
        onDeleteNewsPost={deleteNewsPost}
        onLogout={handleAdminLogout}
        onActorsChange={updateActors}
        onResetDemoData={resetDemoData}
        onSaveNewsPost={saveNewsPost}
        session={adminSession}
      />
    );
  }

  if (path === "/") {
    return (
      <HomePage
        actors={actors}
        onToggleShortlist={toggleShortlist}
        shortlist={shortlist}
      />
    );
  }

  return <NotFoundPage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
