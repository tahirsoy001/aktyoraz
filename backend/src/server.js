import "dotenv/config";
import bcrypt from "bcryptjs";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  createAdminUser,
  createAuditLog,
  createAiCastingFeedback,
  createApplication,
  db,
  deleteActor,
  getAdminByEmail,
  getAdminById,
  getApplications,
  getAuditLogs,
  getAiCastingFeedback,
  getActorById,
  getActorEmbedding,
  getActors,
  getEmbeddingStats,
  resetSeed,
  saveActor,
  saveActorEmbedding,
  seedIfEmpty,
  replaceActors,
  updateApplicationStatus,
} from "./db.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 4010);
const host = process.env.HOST;
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3010";
const jwtSecret = process.env.JWT_SECRET ?? "dev-only-change-this-secret";
const publicBaseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:3010";
const sitemapBaseUrl = process.env.SITEMAP_BASE_URL ?? `http://localhost:${port}`;
const defaultAdminEmail = process.env.ADMIN_EMAIL ?? "admin@aktyor.az";
const defaultAdminPassword = process.env.ADMIN_PASSWORD ?? "admin12345";
const defaultAdminName = process.env.ADMIN_NAME ?? "Aktyor.az Admin";
const openaiApiKey = process.env.OPENAI_API_KEY ?? "";
const openaiModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const openaiEmbeddingModel = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
const uploadDir = path.resolve(__dirname, "..", process.env.UPLOAD_DIR ?? "uploads");
const uploadBaseUrl = process.env.UPLOAD_BASE_URL ?? "";
const adminLoginRateLimitWindowMs = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000);
const adminLoginRateLimitMax = Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX ?? 5);
function findExistingFile(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) ?? "";
}

const pdfRegularFontPath = findExistingFile([
  process.env.PDF_FONT_REGULAR,
  "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
  "/System/Library/Fonts/Supplemental/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
]);
const pdfBoldFontPath = findExistingFile([
  process.env.PDF_FONT_BOLD,
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
  pdfRegularFontPath,
]);

assertProductionConfig();
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    callback(null, uploadDir);
  },
  filename: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeExtension = [".jpg", ".jpeg", ".png", ".webp"].includes(extension)
      ? extension
      : ".jpg";
    callback(null, `${Date.now()}-${randomUUID()}${safeExtension}`);
  },
});

const upload = multer({
  fileFilter: (_request, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      callback(new Error("only jpeg, png and webp images are allowed"));
      return;
    }

    callback(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  storage,
});

seedIfEmpty();
seedDefaultAdmin();

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "8mb" }));
app.use("/uploads", express.static(uploadDir));

if (isProduction) {
  app.set("trust proxy", 1);
}

const adminLoginAttempts = new Map();

function assertProductionConfig() {
  if (!isProduction) {
    return;
  }

  const problems = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 64 || jwtSecret === "dev-only-change-this-secret") {
    problems.push("JWT_SECRET must be set to at least 64 characters");
  }

  if (!process.env.ADMIN_PASSWORD || defaultAdminPassword === "admin12345" || defaultAdminPassword.length < 14) {
    problems.push("ADMIN_PASSWORD must be changed and should be at least 14 characters");
  }

  if (!publicBaseUrl.startsWith("https://")) {
    problems.push("PUBLIC_BASE_URL should use https:// in production");
  }

  if (!corsOrigin.startsWith("https://")) {
    problems.push("CORS_ORIGIN should use https:// in production");
  }

  if (problems.length) {
    throw new Error(`Invalid production config:\n- ${problems.join("\n- ")}`);
  }
}

function seedDefaultAdmin() {
  const passwordHash = bcrypt.hashSync(defaultAdminPassword, 12);
  createAdminUser({
    email: defaultAdminEmail,
    name: defaultAdminName,
    passwordHash,
  });
}

function signAdminToken(admin) {
  return jwt.sign(
    {
      email: admin.email,
      name: admin.name,
      sub: String(admin.id),
    },
    jwtSecret,
    { expiresIn: "8h" },
  );
}

function adminLoginRateLimitKey(request) {
  return request.ip ?? request.socket.remoteAddress ?? "unknown";
}

function checkAdminLoginRateLimit(request, response, next) {
  const key = adminLoginRateLimitKey(request);
  const now = Date.now();
  const current = adminLoginAttempts.get(key);

  if (current && current.resetAt > now && current.count >= adminLoginRateLimitMax) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    response.set("Retry-After", String(retryAfterSeconds));
    response.status(429).json({
      error: "too many login attempts, try again later",
      retryAfterSeconds,
    });
    return;
  }

  if (!current || current.resetAt <= now) {
    adminLoginAttempts.set(key, { count: 0, resetAt: now + adminLoginRateLimitWindowMs });
  }

  next();
}

function recordFailedAdminLogin(request) {
  const key = adminLoginRateLimitKey(request);
  const now = Date.now();
  const current = adminLoginAttempts.get(key);

  if (!current || current.resetAt <= now) {
    adminLoginAttempts.set(key, { count: 1, resetAt: now + adminLoginRateLimitWindowMs });
    return;
  }

  current.count += 1;
  adminLoginAttempts.set(key, current);
}

function clearAdminLoginRateLimit(request) {
  adminLoginAttempts.delete(adminLoginRateLimitKey(request));
}

function requireAdmin(request, response, next) {
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    response.status(401).json({ error: "admin token is required" });
    return;
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const admin = getAdminById(Number(payload.sub));

    if (!admin) {
      response.status(401).json({ error: "admin not found" });
      return;
    }

    request.admin = admin;
    next();
  } catch {
    response.status(401).json({ error: "invalid or expired admin token" });
  }
}

function getVerificationUrl(actor) {
  return `${publicBaseUrl}/id/${encodeURIComponent(actor.id)}`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function sitemapUrl(pathname, priority = "0.7", lastmod = new Date().toISOString().slice(0, 10)) {
  return `  <url>
    <loc>${xmlEscape(`${publicBaseUrl}${pathname}`)}</loc>
    <lastmod>${xmlEscape(lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function ogSvg({ title, subtitle, footer }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f7f7f3"/>
  <rect x="64" y="64" width="1072" height="502" rx="34" fill="#111827"/>
  <rect x="96" y="96" width="220" height="120" rx="18" fill="#facc15"/>
  <text x="124" y="174" fill="#111827" font-family="Arial, sans-serif" font-weight="900" font-size="66">AAAb</text>
  <text x="96" y="314" fill="#ffffff" font-family="Arial, sans-serif" font-weight="900" font-size="68">${xmlEscape(title)}</text>
  <text x="96" y="386" fill="#d1d5db" font-family="Arial, sans-serif" font-size="34">${xmlEscape(subtitle)}</text>
  <text x="96" y="500" fill="#facc15" font-family="Arial, sans-serif" font-weight="700" font-size="30">${xmlEscape(footer)}</text>
</svg>`;
}

function getPhotoPath(photoUrl) {
  if (!photoUrl) {
    return null;
  }

  try {
    const url = new URL(photoUrl);
    const uploadPathPrefix = "/uploads/";

    if (url.pathname.startsWith(uploadPathPrefix)) {
      return path.join(uploadDir, decodeURIComponent(url.pathname.replace(uploadPathPrefix, "")));
    }
  } catch {
    if (photoUrl.startsWith("/uploads/")) {
      return path.join(uploadDir, photoUrl.replace("/uploads/", ""));
    }
  }

  return null;
}

function isDateExpired(dateValue) {
  if (!dateValue) {
    return false;
  }

  const endOfDay = new Date(`${dateValue}T23:59:59`);
  return Number.isFinite(endOfDay.getTime()) && endOfDay < new Date();
}

function getCardVerificationState(actor) {
  const expired = isDateExpired(actor.cardExpiresAt);
  const isActive =
    actor.status !== "inactive" &&
    actor.cardStatus !== "inactive" &&
    (actor.membershipStatus ?? "active") === "active" &&
    (actor.annualPaymentStatus ?? "paid") === "paid" &&
    Boolean(actor.paymentManualConfirmed || actor.paymentProvider === "online") &&
    !expired;

  return {
    expired,
    isActive,
    label: isActive ? "AKTIV KART" : "DEAKTIV KART",
  };
}

function drawPdfCard(doc, actor, qrBuffer) {
  const pageWidth = doc.page.width;
  const margin = 32;
  const cardWidth = pageWidth - margin * 2;
  const cardX = margin;
  const cardY = 34;
  const photoPath = getPhotoPath(actor.photo);
  const regularFont = pdfRegularFontPath ? "AktyorRegular" : "Helvetica";
  const boldFont = pdfBoldFontPath ? "AktyorBold" : "Helvetica-Bold";
  const cardState = getCardVerificationState(actor);

  if (pdfRegularFontPath) {
    doc.registerFont("AktyorRegular", pdfRegularFontPath);
  }

  if (pdfBoldFontPath) {
    doc.registerFont("AktyorBold", pdfBoldFontPath);
  }

  doc.roundedRect(cardX, cardY, cardWidth, 520, 14).fillAndStroke("#ffffff", "#deded6");
  doc.rect(cardX, cardY, cardWidth, 86).fill("#111827");
  doc.fillColor("#ffffff").fontSize(14).font(boldFont).text("Azərbaycan Aktyor və Aktrisa Bazası", cardX + 22, cardY + 23, {
    width: cardWidth - 44,
    lineBreak: false,
  });
  doc
    .fontSize(9)
    .font(regularFont)
    .text("Rəqəmsal aktyor təsdiq kartı", cardX + 22, cardY + 52);

  if (photoPath && fs.existsSync(photoPath)) {
    doc.image(photoPath, cardX + 22, cardY + 112, { fit: [118, 150], align: "center" });
  } else {
    doc.roundedRect(cardX + 22, cardY + 112, 118, 150, 10).fill("#7f1d1d");
    doc.fillColor("#ffffff").fontSize(34).font(boldFont).text(actor.initials, cardX + 22, cardY + 166, {
      align: "center",
      width: 118,
    });
  }

  const profileX = cardX + 160;
  const profileWidth = cardWidth - 190;
  doc.fillColor("#111827").font(boldFont).fontSize(22).text(actor.name, profileX, cardY + 112, {
    lineGap: 1,
    width: profileWidth,
  });
  const nameBottom = Math.max(cardY + 144, doc.y + 5);
  doc.fillColor("#b91c1c").font(boldFont).fontSize(13).text(actor.role, profileX, nameBottom, {
    width: profileWidth,
  });
  doc.fillColor("#4b5563").font(regularFont).fontSize(10).text(`${actor.city} · ${actor.ageRange} · ${actor.height}`, profileX, nameBottom + 23, {
    width: profileWidth,
  });
  doc.fillColor("#047857").font(boldFont).fontSize(11).text(
    cardState.isActive ? "Aktiv və təsdiqlənmiş kart" : "Kart aktiv deyil",
    profileX,
    nameBottom + 50,
    { width: profileWidth },
  );
  doc.fillColor(cardState.isActive ? "#047857" : "#b91c1c").font(boldFont).fontSize(11).text(
    cardState.label,
    profileX,
    nameBottom + 72,
    { width: profileWidth },
  );

  const infoX = cardX + 22;
  const infoY = cardY + 290;
  const infoWidth = cardWidth - 44;
  doc.roundedRect(infoX, infoY, infoWidth, 106, 10).fillAndStroke("#f7f7f3", "#deded6");
  doc.fillColor("#6b6f76").font(regularFont).fontSize(8).text("Aktyor ID", infoX + 18, infoY + 18, {
    width: 210,
  });
  doc.fillColor("#111827").font(boldFont).fontSize(15).text(actor.id, infoX + 18, infoY + 35, {
    width: 210,
  });
  doc.fillColor("#6b6f76").font(regularFont).fontSize(8).text("Reytinq", infoX + 270, infoY + 18, {
    width: 80,
  });
  doc.fillColor("#9a3412").font(boldFont).fontSize(16).text(Math.min(5, Math.max(0, actor.rating + actor.adminBoost)).toFixed(1), infoX + 270, infoY + 35, {
    width: 80,
  });
  doc.fillColor(isDateExpired(actor.cardExpiresAt) ? "#b91c1c" : "#4b5563").font(regularFont).fontSize(9).text(
    `Verilib: ${actor.cardIssuedAt || "-"}   ·   Bitir: ${actor.cardExpiresAt || "-"}`,
    infoX + 18,
    infoY + 70,
    {
      width: infoWidth - 36,
    },
  );

  doc.image(qrBuffer, cardX + 22, cardY + 420, { fit: [96, 96] });
  doc.fillColor("#111827").font(boldFont).fontSize(12).text("QR ilə yoxla", cardX + 136, cardY + 432);
  doc.fillColor("#4b5563").font(regularFont).fontSize(9).text(getVerificationUrl(actor), cardX + 136, cardY + 454, {
    width: cardWidth - 166,
  });
  doc.fillColor("#6b6f76").fontSize(8).text("Bu kart Aktyor.az bazasında rəqəmsal profil yoxlaması üçün yaradılıb.", cardX + 136, cardY + 486, {
    width: cardWidth - 166,
  });
}

function parseNumbers(value) {
  return String(value).match(/\d+/g)?.map(Number) ?? [];
}

function normalizeText(value) {
  return String(value ?? "")
    .toLocaleLowerCase("az")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function hasAny(text, words) {
  return words.some((word) => text.includes(normalizeText(word)));
}

function extractPromptProfile(prompt) {
  const text = normalizeText(prompt);
  const numbers = parseNumbers(prompt);
  const ageNumbers = numbers.filter((number) => number >= 5 && number <= 90);
  const ageRange = ageNumbers.length
    ? { max: ageNumbers[1] ?? ageNumbers[0], min: ageNumbers[0] }
    : null;
  const role =
    hasAny(text, ["aktrisa", "qadın", "ana", "qız", "bacı", "xanım"]) ? "female" :
    hasAny(text, ["aktyor", "kişi", "ata", "oğul", "qardaş", "bəy"]) ? "male" :
    "";
  const tones = [
    { label: "dramatik", words: ["dram", "dramatik", "ağır", "emosional", "kədər"] },
    { label: "komediya", words: ["komediya", "komik", "yumor", "gülməli"] },
    { label: "sərt xarakter", words: ["sərt", "ciddi", "avtoritar", "qəddar", "soyuq"] },
    { label: "mehriban/sakit", words: ["mehriban", "sakit", "yumşaq", "isti", "həssas"] },
    { label: "tarixi obraz", words: ["tarixi", "dövr", "klassik", "kostyum"] },
    { label: "gənc obraz", words: ["gənc", "tələbə", "məktəbli", "universitet"] },
    { label: "reklam enerjisi", words: ["reklam", "kamera önü", "dinamik", "model"] },
  ].filter((tone) => hasAny(text, tone.words)).map((tone) => tone.label);

  return {
    numbers,
    ageRange,
    role,
    text,
    tones,
  };
}

function promptProfileToAnalysis(prompt, promptProfile = extractPromptProfile(prompt)) {
  const roleLabel =
    promptProfile.role === "female" ? "qadın obrazı" :
    promptProfile.role === "male" ? "kişi obrazı" :
    "";
  const ageLabel = promptProfile.ageRange
    ? `${promptProfile.ageRange.min}-${promptProfile.ageRange.max}`
    : "";

  return {
    ageRange: ageLabel,
    characterType: promptProfile.tones.join(", "),
    concerns: [],
    gender: roleLabel,
    genre: promptProfile.tones.find((tone) => ["dramatik", "komediya", "tarixi obraz"].includes(tone)) ?? "",
    languageNeeds: [],
    look: promptProfile.tones.filter((tone) => ["sərt xarakter", "mehriban/sakit", "gənc obraz"].includes(tone)),
    mustHave: [
      ageLabel ? `yaş: ${ageLabel}` : "",
      roleLabel,
    ].filter(Boolean),
    niceToHave: promptProfile.tones,
    rawSummary: "Lokal analiz promptdakı açar sözlər və rəqəmlər əsasında çıxarıldı.",
    skills: [],
  };
}

function actorPublicSummary(actor) {
  const aiProfile = actor.aiProfile ?? {};

  return {
    ageRange: actor.ageRange,
    aiProfile,
    city: actor.city,
    hairColor: actor.hairColor,
    height: actor.height,
    id: actor.id,
    genres: actor.genres ?? [],
    languages: actor.languages,
    name: actor.name,
    rating: Math.min(5, Math.max(0, actor.rating + actor.adminBoost)),
    role: actor.role,
    skills: actor.skills,
    specialSkills: actor.specialSkills ?? [],
    status: actor.status,
    summary: actor.summary,
    aiBio: actor.aiBio ?? "",
    titles: actor.titles ?? [],
    weight: actor.weight,
  };
}

function actorEmbeddingText(actor) {
  const aiProfile = actor.aiProfile ?? {};

  return [
    `Ad: ${actor.name}`,
    `Rol: ${actor.role}`,
    `Şəhər: ${actor.city}`,
    `Yaş aralığı: ${actor.ageRange}`,
    `Boy: ${actor.height}`,
    `Çəki: ${actor.weight}`,
    `Saç: ${actor.hairColor}`,
    `Dillər: ${(actor.languages ?? []).join(", ")}`,
    `Bacarıqlar: ${(actor.skills ?? []).join(", ")}`,
    `Janrlar: ${(actor.genres ?? []).join(", ")}`,
    `Xüsusi bacarıqlar: ${(actor.specialSkills ?? []).join(", ")}`,
    `Titullar: ${(actor.titles ?? []).join(", ")}`,
    `Xülasə: ${actor.summary}`,
    `AI bio: ${actor.aiBio ?? ""}`,
    `Obraz tipləri: ${(aiProfile.typecasts ?? []).join(", ")}`,
    `Emosional diapazon: ${(aiProfile.emotionalRange ?? []).join(", ")}`,
    `Görünüş qeydləri: ${aiProfile.lookNotes ?? ""}`,
    `Dialekt/aksan: ${(aiProfile.dialects ?? []).join(", ")}`,
    `Kamera təcrübəsi: ${aiProfile.cameraExperience ?? ""}`,
    `Səhnə təcrübəsi: ${aiProfile.stageExperience ?? ""}`,
    `Məhdudiyyətlər: ${(aiProfile.limitations ?? []).join(", ")}`,
    `Admin qeydləri: ${aiProfile.performanceNotes ?? ""}`,
  ].filter(Boolean).join("\n");
}

function contentHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function cosineSimilarity(first, second) {
  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    dot += first[index] * second[index];
    firstMagnitude += first[index] * first[index];
    secondMagnitude += second[index] * second[index];
  }

  if (!firstMagnitude || !secondMagnitude) {
    return 0;
  }

  return dot / (Math.sqrt(firstMagnitude) * Math.sqrt(secondMagnitude));
}

async function createEmbedding(input) {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    body: JSON.stringify({
      input,
      model: openaiEmbeddingModel,
    }),
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`OpenAI embedding request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.data?.[0]?.embedding ?? [];
}

async function ensureActorEmbedding(actor) {
  const text = actorEmbeddingText(actor);
  const hash = contentHash(`${openaiEmbeddingModel}\n${text}`);
  const existing = getActorEmbedding(actor.id);

  if (existing?.contentHash === hash && existing.embedding?.length) {
    return existing.embedding;
  }

  const embedding = await createEmbedding(text);
  saveActorEmbedding({
    actorId: actor.id,
    contentHash: hash,
    embedding,
    model: openaiEmbeddingModel,
  });
  return embedding;
}

async function vectorCandidateSearch(prompt, actors, limit) {
  if (!openaiApiKey) {
    return [];
  }

  const promptEmbedding = await createEmbedding(prompt);
  const scoredActors = [];

  for (const actor of actors.filter((item) => item.status !== "inactive")) {
    const actorEmbedding = await ensureActorEmbedding(actor);
    scoredActors.push({
      actor,
      score: cosineSimilarity(promptEmbedding, actorEmbedding),
    });
  }

  return scoredActors
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map((item) => item.actor);
}

function scoreActorForPrompt(actor, prompt, promptProfile = extractPromptProfile(prompt)) {
  const normalizedPrompt = promptProfile.text;
  const aiProfile = actor.aiProfile ?? {};
  const searchable = [
    actor.name,
    actor.role,
    actor.city,
    actor.ageRange,
    actor.height,
    actor.weight,
    actor.hairColor,
    actor.summary,
    actor.aiBio,
    ...actor.languages,
    ...actor.skills,
    ...(actor.genres ?? []),
    ...(actor.specialSkills ?? []),
    ...(actor.titles ?? []),
    ...(aiProfile.typecasts ?? []),
    ...(aiProfile.emotionalRange ?? []),
    aiProfile.lookNotes,
    ...(aiProfile.dialects ?? []),
    aiProfile.cameraExperience,
    aiProfile.stageExperience,
    ...(aiProfile.limitations ?? []),
    aiProfile.performanceNotes,
  ]
    .join(" ")
    .toLocaleLowerCase("az");
  const normalizedSearchable = normalizeText(searchable);
  let score = actor.status === "verified" ? 16 : 7;
  const matched = [];
  const concerns = [];

  for (const language of actor.languages) {
    if (normalizedPrompt.includes(normalizeText(language))) {
      score += 12;
      matched.push(`${language} dili`);
    }
  }

  for (const skill of actor.skills) {
    if (normalizedPrompt.includes(normalizeText(skill))) {
      score += 12;
      matched.push(`${skill} təcrübəsi`);
    }
  }

  for (const genre of actor.genres ?? []) {
    if (normalizedPrompt.includes(normalizeText(genre))) {
      score += 14;
      matched.push(`${genre} janrı`);
    }
  }

  for (const skill of actor.specialSkills ?? []) {
    if (normalizedPrompt.includes(normalizeText(skill))) {
      score += 16;
      matched.push(`${skill} xüsusi bacarığı`);
    }
  }

  for (const title of actor.titles ?? []) {
    if (normalizedPrompt.includes(normalizeText(title))) {
      score += 18;
      matched.push(`${title} titulu`);
    }
  }

  for (const token of normalizedPrompt.split(/\s+/).filter((item) => item.length > 3)) {
    if (normalizedSearchable.includes(token)) {
      score += 3;
    }
  }

  const ageNumbers = parseNumbers(actor.ageRange);
  const height = parseNumbers(actor.height)[0];
  const weight = parseNumbers(actor.weight)[0];

  if (promptProfile.numbers.length && ageNumbers.length) {
    const ageMin = ageNumbers[0];
    const ageMax = ageNumbers[1] ?? ageNumbers[0];
    const requestedAge = promptProfile.ageRange;
    const overlap = requestedAge
      ? Math.max(0, Math.min(ageMax, requestedAge.max) - Math.max(ageMin, requestedAge.min))
      : 0;
    const requestedSpan = requestedAge ? Math.max(1, requestedAge.max - requestedAge.min) : 1;
    const ageMatch = requestedAge
      ? overlap > 0 || requestedAge.min === ageMax || requestedAge.max === ageMin
      : promptProfile.numbers.some((number) => number >= ageMin && number <= ageMax);

    if (ageMatch) {
      score += overlap >= requestedSpan * 0.6 ? 18 : 7;
      matched.push(`yaş aralığı ${actor.ageRange}`);
    } else if (promptProfile.numbers.some((number) => number >= 10 && number <= 80)) {
      score -= 8;
      concerns.push(`yaş aralığı ${actor.ageRange} tələbdən uzaq ola bilər`);
    }
  }

  if (height && promptProfile.numbers.some((number) => Math.abs(number - height) <= 5)) {
    score += 8;
    matched.push(`boy ${actor.height}`);
  }

  if (weight && promptProfile.numbers.some((number) => Math.abs(number - weight) <= 7)) {
    score += 6;
    matched.push(`çəki ${actor.weight}`);
  }

  if (actor.hairColor && normalizedPrompt.includes(normalizeText(actor.hairColor))) {
    score += 10;
    matched.push(`${actor.hairColor} saç rəngi`);
  }

  if (promptProfile.role) {
    const actorRole = normalizeText(actor.role);
    const femaleRole = actorRole.includes("aktrisa");
    const childRole = actorRole.includes("usaq");
    const studentRole = actorRole.includes("telebe");

    if (promptProfile.role === "female" && femaleRole) {
      score += 14;
      matched.push("qadın obrazı üçün kateqoriya uyğundur");
    } else if (promptProfile.role === "male" && !femaleRole && !childRole && !studentRole) {
      score += 14;
      matched.push("kişi obrazı üçün kateqoriya uyğundur");
    } else {
      score -= 18;
      concerns.push("rol/kateqoriya personaj təsviri ilə tam üst-üstə düşməyə bilər");
    }
  }

  for (const tone of promptProfile.tones) {
    if (normalizedSearchable.includes(normalizeText(tone))) {
      score += 9;
      matched.push(`${tone} tonu`);
    }
  }

  score += Math.round(Math.min(5, Math.max(0, actor.rating + actor.adminBoost)) * 5);

  const finalScore = Math.min(99, Math.max(8, score));
  const reason = matched.length
    ? matched.slice(0, 4).join("; ")
    : "profil məlumatları personaj təsviri ilə ümumi uyğunluq göstərir";

  return {
    actorId: actor.id,
    concerns: concerns.slice(0, 2),
    matched: matched.slice(0, 5),
    reason,
    score: finalScore,
  };
}

function fallbackCastingSearch(prompt, actors, limit) {
  const promptProfile = extractPromptProfile(prompt);

  return actors
    .filter((actor) => actor.status !== "inactive")
    .map((actor) => scoreActorForPrompt(actor, prompt, promptProfile))
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

function parseOpenAiJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  }
}

function parseOpenAiJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function normalizeAnalysisArray(value, limit = 6) {
  return Array.isArray(value) ? value.slice(0, limit).map(String).filter(Boolean) : [];
}

function normalizePromptAnalysis(value, fallback) {
  return {
    ageRange: String(value.ageRange ?? fallback.ageRange ?? ""),
    characterType: String(value.characterType ?? fallback.characterType ?? ""),
    concerns: normalizeAnalysisArray(value.concerns ?? fallback.concerns, 5),
    gender: String(value.gender ?? fallback.gender ?? ""),
    genre: String(value.genre ?? fallback.genre ?? ""),
    languageNeeds: normalizeAnalysisArray(value.languageNeeds ?? fallback.languageNeeds, 5),
    look: normalizeAnalysisArray(value.look ?? fallback.look, 5),
    mustHave: normalizeAnalysisArray(value.mustHave ?? fallback.mustHave, 6),
    niceToHave: normalizeAnalysisArray(value.niceToHave ?? fallback.niceToHave, 6),
    rawSummary: String(value.rawSummary ?? fallback.rawSummary ?? ""),
    skills: normalizeAnalysisArray(value.skills ?? fallback.skills, 6),
  };
}

function analysisSearchText(prompt, analysis) {
  return [
    prompt,
    analysis.rawSummary,
    analysis.ageRange,
    analysis.gender,
    analysis.characterType,
    analysis.genre,
    ...(analysis.languageNeeds ?? []),
    ...(analysis.look ?? []),
    ...(analysis.skills ?? []),
    ...(analysis.mustHave ?? []),
    ...(analysis.niceToHave ?? []),
  ].filter(Boolean).join("\n");
}

function getRequestedRoleFromAnalysis(prompt, analysis) {
  const text = normalizeText([
    prompt,
    analysis?.gender ?? "",
    ...(analysis?.mustHave ?? []),
  ].join(" "));

  if (hasAny(text, ["qadin", "qadin obrazi", "aktrisa", "ana", "qiz", "xanim"])) {
    return "female";
  }

  if (hasAny(text, ["kisi", "kisi obrazi", "aktyor", "ata", "ogul", "qardas", "bey"])) {
    return "male";
  }

  return "";
}

function actorMatchesRequestedRole(actor, requestedRole) {
  if (!requestedRole) {
    return true;
  }

  const role = normalizeText(actor.role);
  const isFemale = role.includes("aktrisa");

  if (requestedRole === "female") {
    return isFemale;
  }

  if (requestedRole === "male") {
    return !isFemale;
  }

  return true;
}

async function analyzeCastingPrompt(prompt) {
  const fallback = promptProfileToAnalysis(prompt);

  if (!openaiApiKey) {
    return fallback;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content:
            [
              "Sən kastinq brifini analiz edən asistentsən.",
              "Rejissorun qeyri-dəqiq təsvirindən ehtimal olunan tələbləri çıxar.",
              "Açıq yazılmayan detalları yalnız məntiqli ehtimal kimi yaz, qəti fakt kimi yox.",
              "Azərbaycan dilində yalnız JSON object qaytar.",
              "Schema:",
              "{\"rawSummary\":\"AI bu obrazı necə başa düşdü\",\"ageRange\":\"məsələn 25-35 və ya boş\",\"gender\":\"kişi/qadın/uşaq/fərq etmir və ya boş\",\"characterType\":\"xarakter tipi\",\"genre\":\"janr ehtimalı\",\"languageNeeds\":[\"dil\"],\"look\":[\"görünüş ehtimalı\"],\"skills\":[\"bacarıq\"],\"mustHave\":[\"mütləq şərt\"],\"niceToHave\":[\"üstünlük\"],\"concerns\":[\"risk/qeyri-müəyyənlik\"]}",
            ].join(" "),
          role: "system",
        },
        {
          content: prompt,
          role: "user",
        },
      ],
      max_output_tokens: 700,
      model: openaiModel,
      temperature: 0.15,
    }),
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    return fallback;
  }

  const data = await response.json();
  const text =
    data.output_text ??
    data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ??
    "{}";

  return normalizePromptAnalysis(parseOpenAiJsonObject(text), fallback);
}

async function aiCastingSearch(prompt, actors, limit) {
  const analysis = await analyzeCastingPrompt(prompt);
  const searchText = analysisSearchText(prompt, analysis);
  const requestedRole = getRequestedRoleFromAnalysis(prompt, analysis);
  const searchableActors = requestedRole
    ? actors.filter((actor) => actorMatchesRequestedRole(actor, requestedRole))
    : actors;

  if (!openaiApiKey) {
    return { analysis, mode: "rules", results: fallbackCastingSearch(searchText, searchableActors, limit) };
  }

  const vectorActors = await vectorCandidateSearch(searchText, searchableActors, Math.min(searchableActors.length, 18));
  const fallbackActors = fallbackCastingSearch(searchText, searchableActors, Math.min(searchableActors.length, 18))
    .map((result) => searchableActors.find((actor) => actor.id === result.actorId))
    .filter(Boolean);
  const candidateActors = [
    ...vectorActors,
    ...fallbackActors.filter((actor) => !vectorActors.some((item) => item.id === actor.id)),
  ].slice(0, 18).map(actorPublicSummary);
  const response = await fetch("https://api.openai.com/v1/responses", {
    body: JSON.stringify({
      input: [
        {
          content:
            [
              "Sən peşəkar kastinq direktoruna kömək edən asistentsən.",
              "Ssenari/personaj təsvirinə görə yalnız verilən aktyor bazasından ən uyğun namizədləri seç.",
              "İstifadəçi promptundan çıxarılmış analysis obyektini əsas kastinq brifi kimi qəbul et.",
              "Yaş aralığı, rol/kateqoriya, dil, bacarıq, şəhər, boy/çəki, saç rəngi, təcrübə tonu və reytinqi birlikdə qiymətləndir.",
              "Uyğun olmayan namizədi yüksək bal ilə vermə. Uydurma aktyor yaratma.",
              "Yalnız JSON array qaytar:",
              "[{\"actorId\":\"...\",\"score\":0-100,\"reason\":\"qısa Azərbaycan dilində yekun səbəb\",\"matched\":[\"uyğun faktor\"],\"concerns\":[\"qısa risk/qeyd\"]}]",
            ].join(" "),
          role: "system",
        },
        {
          content: JSON.stringify({
            analysis,
            actors: candidateActors,
            limit,
            prompt,
          }),
          role: "user",
        },
      ],
      max_output_tokens: 1200,
      model: openaiModel,
      temperature: 0.2,
    }),
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status}`);
  }

  const data = await response.json();
  const text =
    data.output_text ??
    data.output?.flatMap((item) => item.content ?? []).map((item) => item.text ?? "").join("\n") ??
    "[]";
  const allowedIds = new Set(searchableActors.map((actor) => actor.id));
  const results = parseOpenAiJson(text)
    .filter((item) => allowedIds.has(item.actorId))
    .map((item) => ({
      actorId: item.actorId,
      concerns: Array.isArray(item.concerns) ? item.concerns.slice(0, 3).map(String) : [],
      matched: Array.isArray(item.matched) ? item.matched.slice(0, 5).map(String) : [],
      reason: String(item.reason ?? "uyğun profil"),
      score: Math.min(100, Math.max(0, Number(item.score) || 0)),
    }))
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);

  return {
    analysis,
    mode: "openai",
    results: results.length ? results : fallbackCastingSearch(searchText, searchableActors, limit),
  };
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "aktyor-az-api" });
});

app.get("/robots.txt", (_request, response) => {
  response.type("text/plain").send(`User-agent: *
Allow: /
Sitemap: ${sitemapBaseUrl}/sitemap.xml
`);
});

app.get("/og/default.svg", (_request, response) => {
  response
    .type("image/svg+xml")
    .set("Cache-Control", "public, max-age=3600")
    .send(ogSvg({
      footer: "Aktyor.az",
      subtitle: "Kastinq profilləri, rəqəmsal ID, QR və PDF kart sistemi",
      title: "Azərbaycan Aktyor və Aktrisa Bazası",
    }));
});

app.get("/og/actors/:id.svg", (request, response) => {
  const actor = getActorById(request.params.id);

  if (!actor) {
    response.status(404).send("actor not found");
    return;
  }

  response
    .type("image/svg+xml")
    .set("Cache-Control", "public, max-age=3600")
    .send(ogSvg({
      footer: `${actor.id} · ${actor.city} · ${actor.ageRange}`,
      subtitle: `${actor.role} · ${actor.skills.slice(0, 3).join(", ")}`,
      title: actor.name,
    }));
});

app.get("/sitemap.xml", (_request, response) => {
  const actors = getActors().filter((actor) => actor.status !== "inactive");
  const staticUrls = [
    sitemapUrl("/", "1.0"),
    sitemapUrl("/actors", "0.9"),
    sitemapUrl("/apply", "0.7"),
    sitemapUrl("/casting-ai", "0.7"),
  ];
  const actorUrls = actors.flatMap((actor) => [
    sitemapUrl(`/actors/${encodeURIComponent(actor.slug)}`, "0.8"),
    sitemapUrl(`/id/${encodeURIComponent(actor.id)}`, "0.6"),
  ]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticUrls, ...actorUrls].join("\n")}
</urlset>
`;

  response.type("application/xml").send(xml);
});

app.get("/api/actors", (_request, response) => {
  response.json({ actors: getActors() });
});

app.get("/api/health", (_request, response) => {
  response.json({
    database: "ok",
    environment: process.env.NODE_ENV ?? "development",
    ok: true,
    service: "aktyor-az-api",
  });
});

app.post("/api/ai/casting-search", async (request, response, next) => {
  const prompt = String(request.body?.prompt ?? "").trim();
  const limit = Math.min(12, Math.max(1, Number(request.body?.limit ?? 6)));

  if (prompt.length < 10) {
    response.status(400).json({ error: "prompt must be at least 10 characters" });
    return;
  }

  try {
    const actors = getActors();
    const result = await aiCastingSearch(prompt, actors, limit);
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]));

    response.json({
      analysis: result.analysis,
      mode: result.mode,
      results: result.results.map((item) => ({
        actor: actorsById.get(item.actorId),
        actorId: item.actorId,
        concerns: item.concerns ?? [],
        matched: item.matched ?? [],
        reason: item.reason,
        score: item.score,
      })),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/actors/:id/qr.svg", async (request, response, next) => {
  const actor = getActorById(request.params.id);

  if (!actor) {
    response.status(404).send("actor not found");
    return;
  }

  try {
    const svg = await QRCode.toString(getVerificationUrl(actor), {
      errorCorrectionLevel: "M",
      margin: 1,
      type: "svg",
      width: 220,
    });

    response.type("image/svg+xml").send(svg);
  } catch (error) {
    next(error);
  }
});

app.get("/api/actors/:id/card.pdf", async (request, response, next) => {
  const actor = getActorById(request.params.id);

  if (!actor) {
    response.status(404).send("actor not found");
    return;
  }

  try {
    const qrBuffer = await QRCode.toBuffer(getVerificationUrl(actor), {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    });
    const doc = new PDFDocument({ margin: 0, size: [420, 620] });

    response.setHeader("Content-Type", "application/pdf");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${actor.id.toLowerCase()}-aktyor-card.pdf"`,
    );
    doc.pipe(response);
    drawPdfCard(doc, actor, qrBuffer);
    doc.end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/applications", (request, response) => {
  const application = {
    ...request.body?.application,
    photo: null,
  };

  if (!application?.name || !application?.contact || !application?.role) {
    response.status(400).json({ error: "name, role and contact are required" });
    return;
  }

  response.status(201).json({ application: createApplication(application) });
});

app.post("/api/admin/login", checkAdminLoginRateLimit, async (request, response) => {
  const email = String(request.body?.email ?? "").trim().toLowerCase();
  const password = String(request.body?.password ?? "");
  const admin = getAdminByEmail(email);

  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    recordFailedAdminLogin(request);
    response.status(401).json({ error: "email or password is incorrect" });
    return;
  }

  clearAdminLoginRateLimit(request);
  response.json({
    admin: {
      email: admin.email,
      id: admin.id,
      name: admin.name,
    },
    token: signAdminToken(admin),
  });
});

app.get("/api/admin/me", requireAdmin, (request, response) => {
  response.json({ admin: request.admin });
});

app.get("/api/admin/applications", requireAdmin, (_request, response) => {
  response.json({ applications: getApplications() });
});

app.get("/api/admin/audit-logs", requireAdmin, (_request, response) => {
  response.json({ logs: getAuditLogs() });
});

app.get("/api/admin/ai-feedback", requireAdmin, (_request, response) => {
  response.json({ feedback: getAiCastingFeedback() });
});

app.post("/api/admin/ai-feedback", requireAdmin, (request, response) => {
  const actorId = String(request.body?.actorId ?? "").trim();
  const decision = String(request.body?.decision ?? "").trim();
  const prompt = String(request.body?.prompt ?? "").trim();
  const note = String(request.body?.note ?? "").trim();
  const promptAnalysis = request.body?.promptAnalysis ?? {};

  if (!actorId || !getActorById(actorId)) {
    response.status(400).json({ error: "valid actorId is required" });
    return;
  }

  if (!["good", "bad", "maybe"].includes(decision)) {
    response.status(400).json({ error: "decision must be good, bad or maybe" });
    return;
  }

  if (prompt.length < 10) {
    response.status(400).json({ error: "prompt must be at least 10 characters" });
    return;
  }

  const feedback = createAiCastingFeedback({
    actorId,
    adminEmail: request.admin.email,
    decision,
    note,
    prompt,
    promptAnalysis,
  });

  createAuditLog({
    action: "ai_casting_feedback",
    adminEmail: request.admin.email,
    details: { actorId, decision, note },
    entityId: actorId,
    entityType: "actor",
  });

  response.status(201).json({ feedback });
});

app.get("/api/admin/ai-index/status", requireAdmin, (_request, response) => {
  response.json({
    embeddingModel: openaiEmbeddingModel,
    enabled: Boolean(openaiApiKey),
    indexedCount: getEmbeddingStats().count,
  });
});

app.post("/api/admin/ai-index/reindex", requireAdmin, async (request, response, next) => {
  if (!openaiApiKey) {
    response.status(400).json({ error: "OPENAI_API_KEY is required for AI indexing" });
    return;
  }

  try {
    const actors = getActors().filter((actor) => actor.status !== "inactive");

    for (const actor of actors) {
      await ensureActorEmbedding(actor);
    }

    createAuditLog({
      action: "ai_reindex",
      adminEmail: request.admin.email,
      details: { count: actors.length, embeddingModel: openaiEmbeddingModel },
      entityId: "ai-index",
      entityType: "system",
    });

    response.json({
      count: actors.length,
      embeddingModel: openaiEmbeddingModel,
      indexedCount: getEmbeddingStats().count,
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/applications/:id", requireAdmin, (request, response) => {
  const status = String(request.body?.status ?? "");

  if (!["new", "review", "approved", "rejected"].includes(status)) {
    response.status(400).json({ error: "valid status is required" });
    return;
  }

  const application = updateApplicationStatus(Number(request.params.id), status);

  if (!application) {
    response.status(404).json({ error: "application not found" });
    return;
  }

  createAuditLog({
    action: "application_status_update",
    adminEmail: request.admin.email,
    details: { status },
    entityId: String(application.id),
    entityType: "application",
  });

  response.json({ application });
});

app.post("/api/admin/uploads/photo", requireAdmin, upload.single("photo"), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: "photo file is required" });
    return;
  }

  response.status(201).json({
    file: {
      filename: request.file.filename,
      mimetype: request.file.mimetype,
      size: request.file.size,
      url: `${uploadBaseUrl}/uploads/${request.file.filename}`.replace(/^\/\//, "/"),
    },
  });
});

app.put("/api/actors", requireAdmin, (request, response) => {
  const actors = request.body?.actors;

  if (!Array.isArray(actors)) {
    response.status(400).json({ error: "actors array is required" });
    return;
  }

  const previousActors = new Map(getActors().map((actor) => [actor.id, actor]));
  const savedActors = replaceActors(actors);

  for (const actor of actors) {
    const previousActor = previousActors.get(actor.id);

    if (!previousActor) {
      createAuditLog({
        action: "actor_create",
        adminEmail: request.admin.email,
        details: { name: actor.name },
        entityId: actor.id,
        entityType: "actor",
      });
      continue;
    }

    if (
      previousActor.rating !== actor.rating ||
      previousActor.ratingCount !== actor.ratingCount ||
      previousActor.adminBoost !== actor.adminBoost
    ) {
      createAuditLog({
        action: "rating_update",
        adminEmail: request.admin.email,
        details: {
          after: {
            adminBoost: actor.adminBoost,
            rating: actor.rating,
            ratingCount: actor.ratingCount,
          },
          before: {
            adminBoost: previousActor.adminBoost,
            rating: previousActor.rating,
            ratingCount: previousActor.ratingCount,
          },
          name: actor.name,
        },
        entityId: actor.id,
        entityType: "actor",
      });
    }

    if (
      previousActor.status !== actor.status ||
      previousActor.featuredOrder !== actor.featuredOrder ||
      previousActor.homeOrder !== actor.homeOrder ||
      previousActor.cardStatus !== actor.cardStatus ||
      previousActor.cardIssuedAt !== actor.cardIssuedAt ||
      previousActor.cardExpiresAt !== actor.cardExpiresAt ||
      previousActor.membershipStatus !== actor.membershipStatus ||
      previousActor.annualPaymentStatus !== actor.annualPaymentStatus ||
      previousActor.annualPaymentDate !== actor.annualPaymentDate ||
      previousActor.paymentManualConfirmed !== actor.paymentManualConfirmed ||
      previousActor.paymentProvider !== actor.paymentProvider ||
      previousActor.paymentReference !== actor.paymentReference
    ) {
      createAuditLog({
        action: "actor_visibility_update",
        adminEmail: request.admin.email,
        details: {
          annualPaymentStatus: actor.annualPaymentStatus,
          cardExpiresAt: actor.cardExpiresAt,
          cardIssuedAt: actor.cardIssuedAt,
          cardStatus: actor.cardStatus,
          featuredOrder: actor.featuredOrder,
          homeOrder: actor.homeOrder,
          membershipStatus: actor.membershipStatus,
          name: actor.name,
          paymentManualConfirmed: actor.paymentManualConfirmed,
          paymentProvider: actor.paymentProvider,
          paymentReference: actor.paymentReference,
          annualPaymentDate: actor.annualPaymentDate,
          status: actor.status,
        },
        entityId: actor.id,
        entityType: "actor",
      });
    }
  }

  for (const actorId of previousActors.keys()) {
    if (!actors.some((actor) => actor.id === actorId)) {
      createAuditLog({
        action: "actor_delete",
        adminEmail: request.admin.email,
        details: { name: previousActors.get(actorId)?.name },
        entityId: actorId,
        entityType: "actor",
      });
    }
  }

  response.json({ actors: savedActors });
});

app.post("/api/actors", requireAdmin, (request, response) => {
  const actor = request.body?.actor;

  if (!actor?.id || !actor?.name || !actor?.slug) {
    response.status(400).json({ error: "actor id, name and slug are required" });
    return;
  }

  const savedActor = saveActor(actor);
  createAuditLog({
    action: "actor_create",
    adminEmail: request.admin.email,
    details: { name: actor.name },
    entityId: actor.id,
    entityType: "actor",
  });

  response.status(201).json({ actor: savedActor });
});

app.put("/api/actors/:id", requireAdmin, (request, response) => {
  const actor = request.body?.actor;

  if (!actor || actor.id !== request.params.id) {
    response.status(400).json({ error: "actor payload does not match route id" });
    return;
  }

  const previousActor = getActorById(request.params.id);
  const savedActor = saveActor(actor);

  createAuditLog({
    action:
      previousActor?.rating !== actor.rating ||
      previousActor?.ratingCount !== actor.ratingCount ||
      previousActor?.adminBoost !== actor.adminBoost
        ? "rating_update"
        : "actor_update",
    adminEmail: request.admin.email,
    details: { name: actor.name },
    entityId: actor.id,
    entityType: "actor",
  });

  response.json({ actor: savedActor });
});

app.delete("/api/actors/:id", requireAdmin, (request, response) => {
  const actor = getActorById(request.params.id);
  const result = deleteActor(request.params.id);
  createAuditLog({
    action: "actor_delete",
    adminEmail: request.admin.email,
    details: { name: actor?.name },
    entityId: request.params.id,
    entityType: "actor",
  });
  response.json({ deleted: result.changes > 0 });
});

app.post("/api/actors/:id/rate", (request, response) => {
  const actor = getActorById(request.params.id);
  const rating = Number(request.body?.rating);
  const voterId = String(request.body?.voterId ?? "");

  if (!actor) {
    response.status(404).json({ error: "actor not found" });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5 || !voterId) {
    response.status(400).json({ error: "rating 1-5 and voterId are required" });
    return;
  }

  try {
    const nextCount = actor.ratingCount + 1;
    const nextRating = Number(((actor.rating * actor.ratingCount + rating) / nextCount).toFixed(2));

    const update = db.transaction(() => {
      db.prepare("INSERT INTO votes (actor_id, voter_id, rating) VALUES (?, ?, ?)").run(
        actor.id,
        voterId,
        rating,
      );
      db.prepare(
        "UPDATE actors SET rating = ?, rating_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(nextRating, nextCount, actor.id);
    });

    update();
    response.json({ actor: getActorById(actor.id), vote: rating });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      response.status(409).json({ error: "voter already rated this actor" });
      return;
    }

    throw error;
  }
});

app.post("/api/admin/reset-seed", requireAdmin, (request, response) => {
  createAuditLog({
    action: "reset_seed",
    adminEmail: request.admin.email,
    entityId: "seed",
    entityType: "system",
  });
  response.json({ actors: resetSeed() });
});

app.use((error, _request, response, _next) => {
  if (error instanceof multer.MulterError || error.message?.includes("only jpeg")) {
    response.status(400).json({ error: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ error: "internal server error" });
});

const server = host
  ? app.listen(port, host, () => {
      console.log(`Aktyor.az API running on http://${host}:${port}`);
    })
  : app.listen(port, () => {
      console.log(`Aktyor.az API running on http://localhost:${port}`);
    });

function shutdown(signal) {
  console.log(`${signal} received, shutting down Aktyor.az API`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
