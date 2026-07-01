import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedActors } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DATABASE_PATH ?? path.resolve(__dirname, "../data/aktyor.sqlite");
const resolvedDatabasePath = path.isAbsolute(databasePath)
  ? databasePath
  : path.resolve(__dirname, "..", databasePath);

fs.mkdirSync(path.dirname(resolvedDatabasePath), { recursive: true });

export const db = new Database(resolvedDatabasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS actors (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    initials TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    city TEXT NOT NULL,
    age_range TEXT NOT NULL,
    height TEXT NOT NULL,
    weight TEXT NOT NULL DEFAULT '',
    hair_color TEXT NOT NULL DEFAULT '',
    languages TEXT NOT NULL,
    skills TEXT NOT NULL,
    genres TEXT NOT NULL DEFAULT '[]',
    special_skills TEXT NOT NULL DEFAULT '[]',
    titles TEXT NOT NULL DEFAULT '[]',
    browse_categories TEXT NOT NULL DEFAULT '[]',
    medals TEXT NOT NULL DEFAULT '[]',
    filmography TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL CHECK (status IN ('verified', 'review', 'inactive')),
    summary TEXT NOT NULL,
    photo TEXT,
    gallery TEXT NOT NULL DEFAULT '[]',
    showreel TEXT,
    contact TEXT,
    rating REAL NOT NULL DEFAULT 0,
    rating_count INTEGER NOT NULL DEFAULT 0,
    admin_boost REAL NOT NULL DEFAULT 0,
    profile_kind TEXT NOT NULL DEFAULT 'real' CHECK (profile_kind IN ('demo', 'real')),
    featured_order INTEGER,
    home_order INTEGER,
    card_status TEXT NOT NULL DEFAULT 'active' CHECK (card_status IN ('active', 'inactive')),
    card_issued_at TEXT NOT NULL DEFAULT '',
    card_expires_at TEXT NOT NULL DEFAULT '',
    membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'pending', 'expired', 'cancelled')),
    annual_payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (annual_payment_status IN ('paid', 'pending', 'expired')),
    annual_payment_date TEXT NOT NULL DEFAULT '',
    payment_manual_confirmed INTEGER NOT NULL DEFAULT 0,
    payment_provider TEXT NOT NULL DEFAULT 'manual' CHECK (payment_provider IN ('manual', 'online')),
    payment_reference TEXT NOT NULL DEFAULT '',
    ai_bio TEXT NOT NULL DEFAULT '',
    ai_profile TEXT NOT NULL DEFAULT '{}',
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(actor_id, voter_id),
    FOREIGN KEY(actor_id) REFERENCES actors(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    city TEXT NOT NULL,
    age_range TEXT NOT NULL,
    height TEXT NOT NULL,
    weight TEXT NOT NULL DEFAULT '',
    hair_color TEXT NOT NULL DEFAULT '',
    languages TEXT NOT NULL,
    skills TEXT NOT NULL,
    genres TEXT NOT NULL DEFAULT '[]',
    special_skills TEXT NOT NULL DEFAULT '[]',
    titles TEXT NOT NULL DEFAULT '[]',
    summary TEXT NOT NULL,
    photo TEXT,
    showreel TEXT,
    contact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'review', 'approved', 'rejected')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS actor_embeddings (
    actor_id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    embedding TEXT NOT NULL,
    model TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(actor_id) REFERENCES actors(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS ai_casting_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    prompt TEXT NOT NULL,
    prompt_analysis TEXT NOT NULL DEFAULT '{}',
    actor_id TEXT NOT NULL,
    decision TEXT NOT NULL CHECK (decision IN ('good', 'bad', 'maybe')),
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(actor_id) REFERENCES actors(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS news_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    excerpt TEXT NOT NULL,
    content TEXT NOT NULL,
    project_name TEXT NOT NULL DEFAULT '',
    cover_image TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at TEXT NOT NULL DEFAULT '',
    seo_title TEXT NOT NULL DEFAULT '',
    seo_description TEXT NOT NULL DEFAULT '',
    view_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS unique_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('site', 'actor', 'news')),
    entity_id TEXT NOT NULL DEFAULT '',
    visitor_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(entity_type, entity_id, visitor_hash)
  );
`);

for (const statement of [
  "ALTER TABLE actors ADD COLUMN weight TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE actors ADD COLUMN hair_color TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE applications ADD COLUMN weight TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE applications ADD COLUMN hair_color TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE actors ADD COLUMN featured_order INTEGER",
  "ALTER TABLE actors ADD COLUMN genres TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE actors ADD COLUMN special_skills TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE actors ADD COLUMN titles TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE actors ADD COLUMN browse_categories TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE actors ADD COLUMN medals TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE actors ADD COLUMN filmography TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE applications ADD COLUMN genres TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE applications ADD COLUMN special_skills TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE applications ADD COLUMN titles TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE actors ADD COLUMN gallery TEXT NOT NULL DEFAULT '[]'",
  "ALTER TABLE actors ADD COLUMN home_order INTEGER",
  "ALTER TABLE actors ADD COLUMN profile_kind TEXT NOT NULL DEFAULT 'real'",
  "ALTER TABLE actors ADD COLUMN card_status TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE actors ADD COLUMN card_issued_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE actors ADD COLUMN card_expires_at TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE actors ADD COLUMN membership_status TEXT NOT NULL DEFAULT 'active'",
  "ALTER TABLE actors ADD COLUMN annual_payment_status TEXT NOT NULL DEFAULT 'paid'",
  "ALTER TABLE actors ADD COLUMN annual_payment_date TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE actors ADD COLUMN payment_manual_confirmed INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE actors ADD COLUMN payment_provider TEXT NOT NULL DEFAULT 'manual'",
  "ALTER TABLE actors ADD COLUMN payment_reference TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE actors ADD COLUMN ai_bio TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE actors ADD COLUMN ai_profile TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE actors ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE news_posts ADD COLUMN project_name TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE news_posts ADD COLUMN seo_title TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE news_posts ADD COLUMN seo_description TEXT NOT NULL DEFAULT ''",
  "ALTER TABLE news_posts ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0",
]) {
  try {
    db.prepare(statement).run();
  } catch (error) {
    if (!String(error.message).includes("duplicate column name")) {
      throw error;
    }
  }
}

function actorTableSql() {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'actors'").get()?.sql ?? "";
}

if (actorTableSql().includes("'unpaid'") || actorTableSql().includes("'overdue'")) {
  db.transaction(() => {
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("ALTER TABLE actors RENAME TO actors_old_payment_status");
    db.exec(`
      CREATE TABLE actors (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        initials TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        city TEXT NOT NULL,
        age_range TEXT NOT NULL,
        height TEXT NOT NULL,
        weight TEXT NOT NULL DEFAULT '',
        hair_color TEXT NOT NULL DEFAULT '',
        languages TEXT NOT NULL,
        skills TEXT NOT NULL,
        genres TEXT NOT NULL DEFAULT '[]',
        special_skills TEXT NOT NULL DEFAULT '[]',
        titles TEXT NOT NULL DEFAULT '[]',
        browse_categories TEXT NOT NULL DEFAULT '[]',
        medals TEXT NOT NULL DEFAULT '[]',
        filmography TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL CHECK (status IN ('verified', 'review', 'inactive')),
        summary TEXT NOT NULL,
        photo TEXT,
        gallery TEXT NOT NULL DEFAULT '[]',
        showreel TEXT,
        contact TEXT,
        rating REAL NOT NULL DEFAULT 0,
        rating_count INTEGER NOT NULL DEFAULT 0,
        admin_boost REAL NOT NULL DEFAULT 0,
        profile_kind TEXT NOT NULL DEFAULT 'real' CHECK (profile_kind IN ('demo', 'real')),
        featured_order INTEGER,
        home_order INTEGER,
        card_status TEXT NOT NULL DEFAULT 'active' CHECK (card_status IN ('active', 'inactive')),
        card_issued_at TEXT NOT NULL DEFAULT '',
        card_expires_at TEXT NOT NULL DEFAULT '',
        membership_status TEXT NOT NULL DEFAULT 'active' CHECK (membership_status IN ('active', 'pending', 'expired', 'cancelled')),
        annual_payment_status TEXT NOT NULL DEFAULT 'paid' CHECK (annual_payment_status IN ('paid', 'pending', 'expired')),
        annual_payment_date TEXT NOT NULL DEFAULT '',
        payment_manual_confirmed INTEGER NOT NULL DEFAULT 0,
        payment_provider TEXT NOT NULL DEFAULT 'manual' CHECK (payment_provider IN ('manual', 'online')),
        payment_reference TEXT NOT NULL DEFAULT '',
        ai_bio TEXT NOT NULL DEFAULT '',
        ai_profile TEXT NOT NULL DEFAULT '{}',
        view_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    db.exec(`
      INSERT INTO actors (
        id, slug, initials, name, role, city, age_range, height, weight, hair_color, languages, skills, genres,
        special_skills, titles, browse_categories, medals, filmography, status, summary, photo, gallery, showreel, contact, rating, rating_count,
        admin_boost, profile_kind, featured_order, home_order, card_status, card_issued_at, card_expires_at, membership_status,
        annual_payment_status, annual_payment_date, payment_manual_confirmed, payment_provider, payment_reference,
        ai_bio, ai_profile, view_count, created_at, updated_at
      )
      SELECT
        id, slug, initials, name, role, city, age_range, height, weight, hair_color, languages, skills, genres,
        special_skills, titles, COALESCE(browse_categories, '[]'), '[]', '[]', status, summary, photo, gallery, showreel, contact, rating, rating_count,
        admin_boost, COALESCE(profile_kind, 'real'), featured_order, home_order, card_status, card_issued_at, card_expires_at, membership_status,
        CASE annual_payment_status
          WHEN 'unpaid' THEN 'pending'
          WHEN 'overdue' THEN 'expired'
          ELSE annual_payment_status
        END,
        annual_payment_date, payment_manual_confirmed, payment_provider, payment_reference,
        ai_bio, ai_profile, 0, created_at, updated_at
      FROM actors_old_payment_status;
    `);
    db.exec("DROP TABLE actors_old_payment_status");
    db.exec("PRAGMA foreign_keys = ON");
  })();
}

const backfillActorAppearance = db.prepare(
  "UPDATE actors SET weight = COALESCE(NULLIF(weight, ''), ?), hair_color = COALESCE(NULLIF(hair_color, ''), ?) WHERE id = ?",
);

function inferGenres(actor) {
  const text = [actor.summary, ...(actor.skills ?? [])].join(" ").toLocaleLowerCase("az");
  const genres = [];

  if (text.includes("dram")) genres.push("Dram");
  if (text.includes("komed") || text.includes("yumor")) genres.push("Komediya");
  if (text.includes("tarixi")) genres.push("Tarixi");
  if (text.includes("reklam")) genres.push("Reklam");
  if (text.includes("serial")) genres.push("Serial");
  if (text.includes("uşaq")) genres.push("Uşaq layihələri");

  return genres.length ? genres : ["Kino", "Teatr"];
}

function inferSpecialSkills(actor) {
  return (actor.skills ?? []).filter((skill) =>
    ["Səhnə nitqi", "Səs aktyorluğu", "Model performansı", "Dublyaj", "Dublaj", "Kütləvi səhnə"].includes(skill),
  );
}

for (const actor of seedActors) {
  if (actor.weight || actor.hairColor) {
    backfillActorAppearance.run(actor.weight ?? "", actor.hairColor ?? "", actor.id);
  }
}

const backfillActorAiMeta = db.prepare(
  "UPDATE actors SET genres = CASE WHEN genres = '[]' THEN ? ELSE genres END, special_skills = CASE WHEN special_skills = '[]' THEN ? ELSE special_skills END WHERE id = ?",
);

for (const actor of seedActors) {
  backfillActorAiMeta.run(JSON.stringify(actor.genres ?? inferGenres(actor)), JSON.stringify(actor.specialSkills ?? inferSpecialSkills(actor)), actor.id);
}

const insertActor = db.prepare(`
  INSERT INTO actors (
    id, slug, initials, name, role, city, age_range, height, weight, hair_color, languages, skills, genres, special_skills, titles, browse_categories, medals, filmography,
    status, summary, ai_bio, ai_profile, photo, gallery, showreel, contact, rating, rating_count, admin_boost, profile_kind, featured_order, home_order,
    card_status, card_issued_at, card_expires_at, membership_status, annual_payment_status, annual_payment_date,
    payment_manual_confirmed, payment_provider, payment_reference, view_count, updated_at
  ) VALUES (
    @id, @slug, @initials, @name, @role, @city, @ageRange, @height, @weight, @hairColor, @languages, @skills, @genres, @specialSkills, @titles, @browseCategories, @medals, @filmography,
    @status, @summary, @aiBio, @aiProfile, @photo, @gallery, @showreel, @contact, @rating, @ratingCount, @adminBoost, @profileKind, @featuredOrder, @homeOrder,
    @cardStatus, @cardIssuedAt, @cardExpiresAt, @membershipStatus, @annualPaymentStatus, @annualPaymentDate,
    @paymentManualConfirmed, @paymentProvider, @paymentReference, @viewCount, CURRENT_TIMESTAMP
  )
  ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    initials = excluded.initials,
    name = excluded.name,
    role = excluded.role,
    city = excluded.city,
    age_range = excluded.age_range,
    height = excluded.height,
    weight = excluded.weight,
    hair_color = excluded.hair_color,
    languages = excluded.languages,
    skills = excluded.skills,
    genres = excluded.genres,
    special_skills = excluded.special_skills,
    titles = excluded.titles,
    browse_categories = excluded.browse_categories,
    medals = excluded.medals,
    filmography = excluded.filmography,
    status = excluded.status,
    summary = excluded.summary,
    ai_bio = excluded.ai_bio,
    ai_profile = excluded.ai_profile,
    photo = excluded.photo,
    gallery = excluded.gallery,
    showreel = excluded.showreel,
    contact = excluded.contact,
    rating = excluded.rating,
    rating_count = excluded.rating_count,
    admin_boost = excluded.admin_boost,
    profile_kind = excluded.profile_kind,
    featured_order = excluded.featured_order,
    home_order = excluded.home_order,
    card_status = excluded.card_status,
    card_issued_at = excluded.card_issued_at,
    card_expires_at = excluded.card_expires_at,
    membership_status = excluded.membership_status,
    annual_payment_status = excluded.annual_payment_status,
    annual_payment_date = excluded.annual_payment_date,
    payment_manual_confirmed = excluded.payment_manual_confirmed,
    payment_provider = excluded.payment_provider,
    payment_reference = excluded.payment_reference,
    updated_at = CURRENT_TIMESTAMP
`);

export function toDbActor(actor) {
  return {
    id: actor.id,
    slug: actor.slug,
    initials: actor.initials,
    name: actor.name,
    role: actor.role,
    city: actor.city,
    ageRange: actor.ageRange,
    height: actor.height,
    weight: actor.weight ?? "",
    hairColor: actor.hairColor ?? "",
    languages: JSON.stringify(actor.languages ?? []),
    skills: JSON.stringify(actor.skills ?? []),
    genres: JSON.stringify(actor.genres ?? []),
    specialSkills: JSON.stringify(actor.specialSkills ?? []),
    titles: JSON.stringify(actor.titles ?? []),
    browseCategories: JSON.stringify(actor.browseCategories ?? []),
    medals: JSON.stringify(actor.medals ?? []),
    filmography: JSON.stringify(actor.filmography ?? []),
    status: actor.status,
    summary: actor.summary,
    aiBio: actor.aiBio ?? "",
    aiProfile: JSON.stringify(actor.aiProfile ?? {}),
    photo: actor.photo ?? null,
    gallery: JSON.stringify(actor.gallery ?? []),
    showreel: actor.showreel ?? null,
    contact: actor.contact ?? null,
    rating: Number(actor.rating ?? 0),
    ratingCount: Number(actor.ratingCount ?? 0),
    adminBoost: Number(actor.adminBoost ?? 0),
    profileKind: actor.profileKind === "demo" ? "demo" : "real",
    featuredOrder: actor.featuredOrder ? Math.min(5, Math.max(1, Number(actor.featuredOrder))) : null,
    homeOrder: actor.homeOrder ? Math.min(6, Math.max(1, Number(actor.homeOrder))) : null,
    cardStatus: actor.cardStatus === "inactive" ? "inactive" : "active",
    cardIssuedAt: actor.cardIssuedAt ?? "",
    cardExpiresAt: actor.cardExpiresAt ?? "",
    membershipStatus: ["active", "pending", "expired", "cancelled"].includes(actor.membershipStatus)
      ? actor.membershipStatus
      : "active",
    annualPaymentStatus: ["paid", "pending", "expired"].includes(actor.annualPaymentStatus)
      ? actor.annualPaymentStatus
      : "paid",
    annualPaymentDate: actor.annualPaymentDate ?? "",
    paymentManualConfirmed: actor.paymentManualConfirmed ? 1 : 0,
    paymentProvider: ["manual", "online"].includes(actor.paymentProvider) ? actor.paymentProvider : "manual",
    paymentReference: actor.paymentReference ?? "",
    viewCount: Number(actor.viewCount ?? 0),
  };
}

export function fromDbActor(row) {
  return {
    id: row.id,
    slug: row.slug,
    initials: row.initials,
    name: row.name,
    role: row.role,
    city: row.city,
    ageRange: row.age_range,
    height: row.height,
    weight: row.weight ?? "",
    hairColor: row.hair_color ?? "",
    languages: JSON.parse(row.languages),
    skills: JSON.parse(row.skills),
    genres: JSON.parse(row.genres ?? "[]"),
    specialSkills: JSON.parse(row.special_skills ?? "[]"),
    titles: JSON.parse(row.titles ?? "[]"),
    browseCategories: JSON.parse(row.browse_categories ?? "[]"),
    medals: JSON.parse(row.medals ?? "[]"),
    filmography: JSON.parse(row.filmography ?? "[]"),
    status: row.status,
    summary: row.summary,
    aiBio: row.ai_bio ?? "",
    aiProfile: JSON.parse(row.ai_profile ?? "{}"),
    photo: row.photo ?? undefined,
    gallery: JSON.parse(row.gallery ?? "[]"),
    showreel: row.showreel ?? undefined,
    contact: row.contact ?? undefined,
    rating: row.rating,
    ratingCount: row.rating_count,
    adminBoost: row.admin_boost,
    profileKind: row.profile_kind ?? "real",
    featuredOrder: row.featured_order ?? undefined,
    homeOrder: row.home_order ?? undefined,
    cardStatus: row.card_status ?? "active",
    cardIssuedAt: row.card_issued_at ?? "",
    cardExpiresAt: row.card_expires_at ?? "",
    membershipStatus: row.membership_status ?? "active",
    annualPaymentStatus: row.annual_payment_status ?? "paid",
    annualPaymentDate: row.annual_payment_date ?? "",
    paymentManualConfirmed: Boolean(row.payment_manual_confirmed),
    paymentProvider: row.payment_provider ?? "manual",
    paymentReference: row.payment_reference ?? "",
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getActors() {
  return db
    .prepare("SELECT * FROM actors ORDER BY datetime(created_at) DESC, name COLLATE NOCASE")
    .all()
    .map(fromDbActor);
}

export function saveActor(actor) {
  insertActor.run(toDbActor(actor));
  return getActorById(actor.id);
}

export function replaceActors(actors) {
  const replace = db.transaction((nextActors) => {
    const ids = nextActors.map((actor) => actor.id);
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(`DELETE FROM actors WHERE id NOT IN (${placeholders})`).run(...ids);
    } else {
      db.prepare("DELETE FROM actors").run();
    }
    nextActors.forEach((actor) => insertActor.run(toDbActor(actor)));
  });

  replace(actors);
  return getActors();
}

export function getActorById(id) {
  const row = db.prepare("SELECT * FROM actors WHERE id = ?").get(id);
  return row ? fromDbActor(row) : null;
}

export function deleteActor(id) {
  return db.prepare("DELETE FROM actors WHERE id = ?").run(id);
}

export function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) as count FROM actors").get().count;

  if (count === 0) {
    replaceActors(seedActors);
  }
}

export function resetSeed() {
  return replaceActors(seedActors);
}

export function getAdminByEmail(email) {
  return db.prepare("SELECT * FROM admin_users WHERE email = ?").get(email);
}

export function getAdminById(id) {
  return db.prepare("SELECT id, email, name FROM admin_users WHERE id = ?").get(id);
}

export function createAdminUser({ email, passwordHash, name }) {
  db.prepare(
    `INSERT INTO admin_users (email, password_hash, name, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(email) DO NOTHING`,
  ).run(email, passwordHash, name);

  return getAdminByEmail(email);
}

function fromDbApplication(row) {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    city: row.city,
    ageRange: row.age_range,
    height: row.height,
    weight: row.weight ?? "",
    hairColor: row.hair_color ?? "",
    languages: JSON.parse(row.languages),
    skills: JSON.parse(row.skills),
    genres: JSON.parse(row.genres ?? "[]"),
    specialSkills: JSON.parse(row.special_skills ?? "[]"),
    titles: JSON.parse(row.titles ?? "[]"),
    summary: row.summary,
    photo: row.photo ?? undefined,
    showreel: row.showreel ?? undefined,
    contact: row.contact,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createApplication(application) {
  const result = db
    .prepare(
      `INSERT INTO applications (
        name, role, city, age_range, height, weight, hair_color, languages, skills, genres, special_skills, titles, summary,
        photo, showreel, contact, status, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP)`,
    )
    .run(
      application.name,
      application.role,
      application.city,
      application.ageRange,
      application.height,
      application.weight ?? "",
      application.hairColor ?? "",
      JSON.stringify(application.languages ?? []),
      JSON.stringify(application.skills ?? []),
      JSON.stringify(application.genres ?? []),
      JSON.stringify(application.specialSkills ?? []),
      JSON.stringify(application.titles ?? []),
      application.summary,
      application.photo ?? null,
      application.showreel ?? null,
      application.contact,
    );

  return getApplicationById(result.lastInsertRowid);
}

export function getApplications() {
  return db
    .prepare("SELECT * FROM applications ORDER BY created_at DESC")
    .all()
    .map(fromDbApplication);
}

export function getApplicationById(id) {
  const row = db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
  return row ? fromDbApplication(row) : null;
}

export function updateApplicationStatus(id, status) {
  db.prepare("UPDATE applications SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(
    status,
    id,
  );
  return getApplicationById(id);
}

export function deleteApplication(id) {
  const application = getApplicationById(id);

  if (!application) {
    return false;
  }

  db.prepare("DELETE FROM applications WHERE id = ?").run(id);
  return true;
}

export function createAuditLog({ adminEmail, action, entityType, entityId, details = {} }) {
  pruneAuditLogs();

  db.prepare(
    `INSERT INTO audit_logs (admin_email, action, entity_type, entity_id, details)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(adminEmail, action, entityType, entityId ?? null, JSON.stringify(details));
}

export function pruneAuditLogs() {
  db.prepare("DELETE FROM audit_logs WHERE action = 'rating_update' AND created_at < datetime('now', '-30 days')").run();
  db.prepare("DELETE FROM audit_logs WHERE action = 'actor_visibility_update' AND created_at < datetime('now', '-365 days')").run();
  db.prepare(
    "DELETE FROM audit_logs WHERE action NOT IN ('rating_update', 'actor_visibility_update') AND created_at < datetime('now', '-7 days')",
  ).run();
}

export function getAuditLogs(limit = 80) {
  pruneAuditLogs();

  return db
    .prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?")
    .all(limit)
    .map((row) => ({
      id: row.id,
      action: row.action,
      adminEmail: row.admin_email,
      createdAt: row.created_at,
      details: JSON.parse(row.details ?? "{}"),
      entityId: row.entity_id ?? undefined,
      entityType: row.entity_type,
    }));
}

export function getActorEmbedding(actorId) {
  const row = db.prepare("SELECT * FROM actor_embeddings WHERE actor_id = ?").get(actorId);

  if (!row) {
    return null;
  }

  return {
    actorId: row.actor_id,
    contentHash: row.content_hash,
    embedding: JSON.parse(row.embedding),
    model: row.model,
    updatedAt: row.updated_at,
  };
}

export function saveActorEmbedding({ actorId, contentHash, embedding, model }) {
  db.prepare(
    `INSERT INTO actor_embeddings (actor_id, content_hash, embedding, model, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(actor_id) DO UPDATE SET
       content_hash = excluded.content_hash,
       embedding = excluded.embedding,
       model = excluded.model,
       updated_at = CURRENT_TIMESTAMP`,
  ).run(actorId, contentHash, JSON.stringify(embedding), model);
}

export function getEmbeddingStats() {
  return db.prepare("SELECT COUNT(*) as count FROM actor_embeddings").get();
}

export function createAiCastingFeedback({ adminEmail, prompt, promptAnalysis, actorId, decision, note }) {
  const result = db.prepare(
    `INSERT INTO ai_casting_feedback (admin_email, prompt, prompt_analysis, actor_id, decision, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    adminEmail,
    prompt,
    JSON.stringify(promptAnalysis ?? {}),
    actorId,
    decision,
    note ?? "",
  );

  return getAiCastingFeedbackById(result.lastInsertRowid);
}

export function getAiCastingFeedbackById(id) {
  const row = db
    .prepare(
      `SELECT feedback.*, actors.name as actor_name
       FROM ai_casting_feedback feedback
       LEFT JOIN actors ON actors.id = feedback.actor_id
       WHERE feedback.id = ?`,
    )
    .get(id);

  return row ? fromDbAiCastingFeedback(row) : null;
}

export function getAiCastingFeedback(limit = 80) {
  return db
    .prepare(
      `SELECT feedback.*, actors.name as actor_name
       FROM ai_casting_feedback feedback
       LEFT JOIN actors ON actors.id = feedback.actor_id
       ORDER BY feedback.created_at DESC
       LIMIT ?`,
    )
    .all(limit)
    .map(fromDbAiCastingFeedback);
}

function fromDbAiCastingFeedback(row) {
  return {
    actorId: row.actor_id,
    actorName: row.actor_name ?? row.actor_id,
    adminEmail: row.admin_email,
    createdAt: row.created_at,
    decision: row.decision,
    id: row.id,
    note: row.note,
    prompt: row.prompt,
    promptAnalysis: JSON.parse(row.prompt_analysis ?? "{}"),
  };
}

function fromDbNewsPost(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    content: row.content,
    projectName: row.project_name ?? "",
    coverImage: row.cover_image ?? undefined,
    status: row.status,
    publishedAt: row.published_at ?? "",
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
    viewCount: row.view_count ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getNewsPosts({ includeDrafts = false } = {}) {
  const rows = includeDrafts
    ? db.prepare("SELECT * FROM news_posts ORDER BY COALESCE(NULLIF(published_at, ''), created_at) DESC, id DESC").all()
    : db
        .prepare(
          "SELECT * FROM news_posts WHERE status = 'published' ORDER BY COALESCE(NULLIF(published_at, ''), created_at) DESC, id DESC",
        )
        .all();

  return rows.map(fromDbNewsPost);
}

export function getNewsPostBySlug(slug, { includeDrafts = false } = {}) {
  const row = includeDrafts
    ? db.prepare("SELECT * FROM news_posts WHERE slug = ?").get(slug)
    : db.prepare("SELECT * FROM news_posts WHERE slug = ? AND status = 'published'").get(slug);

  return row ? fromDbNewsPost(row) : null;
}

export function getNewsPostById(id) {
  const row = db.prepare("SELECT * FROM news_posts WHERE id = ?").get(id);
  return row ? fromDbNewsPost(row) : null;
}

export function saveNewsPost(post) {
  const payload = {
    id: post.id ?? null,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    projectName: post.projectName ?? "",
    coverImage: post.coverImage ?? null,
    status: post.status === "published" ? "published" : "draft",
    publishedAt: post.publishedAt ?? "",
    seoTitle: post.seoTitle ?? "",
    seoDescription: post.seoDescription ?? "",
  };

  const result = db
    .prepare(
      `INSERT INTO news_posts (
        id, slug, title, excerpt, content, project_name, cover_image, status, published_at,
        seo_title, seo_description, updated_at
      ) VALUES (
        @id, @slug, @title, @excerpt, @content, @projectName, @coverImage, @status, @publishedAt,
        @seoTitle, @seoDescription, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        excerpt = excluded.excerpt,
        content = excluded.content,
        project_name = excluded.project_name,
        cover_image = excluded.cover_image,
        status = excluded.status,
        published_at = excluded.published_at,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        updated_at = CURRENT_TIMESTAMP`,
    )
    .run(payload);

  return getNewsPostById(post.id ?? result.lastInsertRowid);
}

export function deleteNewsPost(id) {
  return db.prepare("DELETE FROM news_posts WHERE id = ?").run(id);
}

export function getSiteViewCount() {
  return (
    db
      .prepare("SELECT COUNT(*) as count FROM unique_views WHERE entity_type = 'site' AND entity_id = ''")
      .get().count ?? 0
  );
}

function getSiteViewCountSince(modifier) {
  return (
    db
      .prepare(
        "SELECT COUNT(*) as count FROM unique_views WHERE entity_type = 'site' AND entity_id = '' AND created_at >= datetime('now', ?)",
      )
      .get(modifier).count ?? 0
  );
}

export function getSiteViewStats() {
  return {
    daily: getSiteViewCountSince("-1 day"),
    monthly: getSiteViewCountSince("-30 days"),
    total: getSiteViewCount(),
    weekly: getSiteViewCountSince("-7 days"),
  };
}

export function recordUniqueView({ entityType, entityId = "", visitorHash }) {
  const normalizedEntityType = ["site", "actor", "news"].includes(entityType) ? entityType : "";
  const normalizedEntityId = normalizedEntityType === "site" ? "" : String(entityId ?? "");

  if (!normalizedEntityType || !visitorHash) {
    throw new Error("invalid unique view payload");
  }

  const result = db
    .prepare(
      `INSERT OR IGNORE INTO unique_views (entity_type, entity_id, visitor_hash)
       VALUES (?, ?, ?)`,
    )
    .run(normalizedEntityType, normalizedEntityId, visitorHash);

  if (result.changes && normalizedEntityType === "actor") {
    db.prepare("UPDATE actors SET view_count = view_count + 1 WHERE id = ?").run(normalizedEntityId);
  }

  if (result.changes && normalizedEntityType === "news") {
    db.prepare("UPDATE news_posts SET view_count = view_count + 1 WHERE slug = ?").run(normalizedEntityId);
  }

  if (normalizedEntityType === "site") {
    return {
      counted: result.changes > 0,
      stats: getSiteViewStats(),
    };
  }

  if (normalizedEntityType === "actor") {
    const actor = getActorById(normalizedEntityId);
    return {
      counted: result.changes > 0,
      count: actor?.viewCount ?? 0,
    };
  }

  const post = getNewsPostBySlug(normalizedEntityId);
  return {
    counted: result.changes > 0,
    count: post?.viewCount ?? 0,
  };
}
