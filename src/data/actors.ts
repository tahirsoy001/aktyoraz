export type Actor = {
  id: string;
  slug: string;
  initials: string;
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
  browseCategories?: string[];
  medals?: string[];
  filmography?: Array<{
    project: string;
    role: string;
  }>;
  status: "verified" | "review" | "inactive";
  summary: string;
  aiBio?: string;
  aiProfile?: {
    cameraExperience?: string;
    dialects?: string[];
    emotionalRange?: string[];
    lookNotes?: string;
    limitations?: string[];
    performanceNotes?: string;
    stageExperience?: string;
    typecasts?: string[];
  };
  photo?: string;
  gallery?: string[];
  showreel?: string;
  contact?: string;
  rating: number;
  ratingCount: number;
  adminBoost: number;
  profileKind?: "demo" | "real";
  featuredOrder?: number;
  homeOrder?: number;
  cardStatus?: "active" | "inactive";
  cardIssuedAt?: string;
  cardExpiresAt?: string;
  membershipStatus?: "active" | "pending" | "expired" | "cancelled";
  annualPaymentStatus?: "paid" | "pending" | "expired";
  annualPaymentDate?: string;
  paymentManualConfirmed?: boolean;
  paymentProvider?: "manual" | "online";
  paymentReference?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const initialActors: Actor[] = [
  {
    id: "AAAB-000124",
    slug: "anar-memmedov",
    initials: "AM",
    name: "Anar Məmmədov",
    role: "Aktyor",
    city: "Bakı",
    ageRange: "28-35",
    height: "178 sm",
    weight: "74 kg",
    hairColor: "Qara",
    languages: ["Azərbaycan", "Rus"],
    skills: ["Kino", "Teatr", "Reklam"],
    status: "verified",
    summary: "Kino və teatr layihələri üçün təsdiqlənmiş aktyor profili.",
    rating: 4.8,
    ratingCount: 42,
    adminBoost: 0,
  },
  {
    id: "AAAB-000125",
    slug: "leyla-aliyeva",
    initials: "LA",
    name: "Leyla Əliyeva",
    role: "Aktrisa",
    city: "Bakı",
    ageRange: "22-30",
    height: "168 sm",
    weight: "56 kg",
    hairColor: "Qəhvəyi",
    languages: ["Azərbaycan", "İngilis"],
    skills: ["Kino", "Reklam", "Dublyaj"],
    status: "verified",
    summary: "Ekran, reklam və dublyaj işləri üçün aktiv aktrisa profili.",
    rating: 4.6,
    ratingCount: 38,
    adminBoost: 0.1,
  },
  {
    id: "AAAB-000126",
    slug: "murad-huseynli",
    initials: "MH",
    name: "Murad Hüseynli",
    role: "Tələbə aktyor",
    city: "Gəncə",
    ageRange: "18-24",
    height: "181 sm",
    weight: "77 kg",
    hairColor: "Qara",
    languages: ["Azərbaycan"],
    skills: ["Kütləvi səhnə", "Teatr"],
    status: "review",
    summary: "Tələbə aktyor kimi ilkin portfolio və kastinq məlumatları.",
    rating: 4.2,
    ratingCount: 15,
    adminBoost: 0,
  },
  {
    id: "AAAB-000127",
    slug: "nigar-safarova",
    initials: "NS",
    name: "Nigar Səfərova",
    role: "Aktrisa",
    city: "Sumqayıt",
    ageRange: "30-40",
    height: "165 sm",
    weight: "60 kg",
    hairColor: "Tünd qəhvəyi",
    languages: ["Azərbaycan", "Türk"],
    skills: ["Teatr", "Serial", "Reklam"],
    status: "verified",
    summary: "Teatr və serial rolları üçün təcrübəli aktrisa profili.",
    rating: 4.9,
    ratingCount: 57,
    adminBoost: 0,
  },
  {
    id: "AAAB-000128",
    slug: "kamran-ismayilov",
    initials: "KI",
    name: "Kamran İsmayılov",
    role: "Aktyor",
    city: "Bakı",
    ageRange: "35-45",
    height: "183 sm",
    weight: "82 kg",
    hairColor: "Qara",
    languages: ["Azərbaycan", "Rus", "Türk"],
    skills: ["Kino", "Serial", "Dublaj"],
    status: "verified",
    summary: "Dram və xarakter rolları üçün təcrübəli ekran aktyoru.",
    rating: 4.7,
    ratingCount: 49,
    adminBoost: 0,
  },
  {
    id: "AAAB-000129",
    slug: "sara-quliyeva",
    initials: "SQ",
    name: "Sara Quliyeva",
    role: "Aktrisa",
    city: "Bakı",
    ageRange: "20-28",
    height: "170 sm",
    weight: "54 kg",
    hairColor: "Açıq qəhvəyi",
    languages: ["Azərbaycan", "İngilis", "Türk"],
    skills: ["Reklam", "Kino", "Model performansı"],
    status: "verified",
    summary: "Reklam və gənc obrazlar üçün aktiv aktrisa profili.",
    rating: 4.5,
    ratingCount: 31,
    adminBoost: 0,
  },
  {
    id: "AAAB-000130",
    slug: "elvin-rzayev",
    initials: "ER",
    name: "Elvin Rzayev",
    role: "Aktyor",
    city: "Şəki",
    ageRange: "25-34",
    height: "176 sm",
    weight: "73 kg",
    hairColor: "Qara",
    languages: ["Azərbaycan"],
    skills: ["Teatr", "Komedya", "Kütləvi səhnə"],
    status: "review",
    summary: "Teatr və komediya rolları üçün yoxlanışda olan aktyor profili.",
    rating: 4.1,
    ratingCount: 12,
    adminBoost: 0,
  },
  {
    id: "AAAB-000131",
    slug: "aysel-nagiyeva",
    initials: "AN",
    name: "Aysel Nağıyeva",
    role: "Aktrisa",
    city: "Bakı",
    ageRange: "27-36",
    height: "166 sm",
    weight: "58 kg",
    hairColor: "Qəhvəyi",
    languages: ["Azərbaycan", "Rus"],
    skills: ["Serial", "Teatr", "Səhnə nitqi"],
    status: "verified",
    summary: "Serial və səhnə rolları üçün təsdiqlənmiş aktrisa profili.",
    rating: 4.7,
    ratingCount: 44,
    adminBoost: 0,
  },
  {
    id: "AAAB-000132",
    slug: "tural-abbasov",
    initials: "TA",
    name: "Tural Abbasov",
    role: "Aktyor",
    city: "Lənkəran",
    ageRange: "40-55",
    height: "180 sm",
    weight: "86 kg",
    hairColor: "Boz",
    languages: ["Azərbaycan", "Türk"],
    skills: ["Kino", "Tarixi obraz", "Səs aktyorluğu"],
    status: "verified",
    summary: "Yetkin xarakter və tarixi obrazlar üçün aktyor profili.",
    rating: 4.4,
    ratingCount: 28,
    adminBoost: 0,
  },
  {
    id: "AAAB-000133",
    slug: "gulnar-hasanova",
    initials: "GH",
    name: "Gülnar Həsənova",
    role: "Aktrisa",
    city: "Gəncə",
    ageRange: "18-24",
    height: "164 sm",
    weight: "52 kg",
    hairColor: "Qara",
    languages: ["Azərbaycan", "İngilis"],
    skills: ["Tələbə filmi", "Reklam", "Kütləvi səhnə"],
    status: "review",
    summary: "Gənc və tələbə layihələri üçün yeni aktrisa profili.",
    rating: 4,
    ratingCount: 9,
    adminBoost: 0,
  },
  {
    id: "AAAB-000134",
    slug: "rasim-kerimli",
    initials: "RK",
    name: "Rasim Kərimli",
    role: "Uşaq aktyor",
    city: "Bakı",
    ageRange: "12-15",
    height: "154 sm",
    weight: "45 kg",
    hairColor: "Qara",
    languages: ["Azərbaycan", "Rus"],
    skills: ["Reklam", "Uşaq rolları", "Səhnə"],
    status: "verified",
    summary: "Uşaq rolları və reklam layihələri üçün təsdiqlənmiş profil.",
    rating: 4.6,
    ratingCount: 23,
    adminBoost: 0,
  },
  {
    id: "AAAB-000135",
    slug: "diana-muradova",
    initials: "DM",
    name: "Diana Muradova",
    role: "Aktrisa",
    city: "Bakı",
    ageRange: "32-42",
    height: "172 sm",
    weight: "61 kg",
    hairColor: "Sarışın",
    languages: ["Azərbaycan", "Rus", "İngilis"],
    skills: ["Kino", "Serial", "Dublyaj"],
    status: "verified",
    summary: "Kino, serial və dublyaj işləri üçün peşəkar aktrisa profili.",
    rating: 4.9,
    ratingCount: 61,
    adminBoost: 0,
  },
];
