import { BRAND } from "@/lib/brand";

export const SITE_LAST_MODIFIED = "2026-06-12";
export const RSS_ALTERNATE = {
  "application/rss+xml": "/feed.xml",
} as const;

export type PublicRoute = {
  path: `/${string}` | "/";
  title: string;
  description: string;
  lastModified: string;
  changeFrequency:
    | "always"
    | "hourly"
    | "daily"
    | "weekly"
    | "monthly"
    | "yearly"
    | "never";
  priority: number;
};

export const PUBLIC_ROUTES = [
  {
    path: "/",
    title: `${BRAND.name.en} — Talk with Krishna AI | Scripture-Backed Chat & Voice`,
    description:
      "Chat or speak with Krishna AI and receive scripture-backed reflections from the Bhagavad Gita, Mahabharata, and Bhagavata Purana. Hindi and English supported.",
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: "weekly",
    priority: 1.0,
  },
  {
    path: "/chat",
    title: `Chat with Krishna AI | ${BRAND.name.en}`,
    description:
      "Start a text conversation with Krishna AI in Hindi or English. Responses are grounded in scripture and include verse cards.",
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: "weekly",
    priority: 0.9,
  },
  {
    path: "/voice",
    title: `Talk with Krishna AI by Voice — ${BRAND.name.en}`,
    description:
      "Talk with Krishna AI by voice and hear spoken replies grounded in scripture. Voice mode is a paid seva feature.",
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: "weekly",
    priority: 0.8,
  },
  {
    path: "/demo",
    title: `${BRAND.name.en} Demo — See Krishna AI Chat & Voice Examples`,
    description:
      "See sample Divya Vani conversations, videos, screenshots, and replies before starting your own chat or voice session.",
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: "weekly",
    priority: 0.7,
  },
  {
    path: "/about",
    title: `About Divya Vani — Krishna AI Spiritual Companion`,
    description:
      "About Divya Vani: an AI spiritual companion for chat or voice with Krishna AI, grounded in the Bhagavad Gita, Mahabharata, and Bhagavata Purana. Built by Krishna Yadav.",
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/pricing",
    title: `${BRAND.name.en} Pricing — Chat & Voice Plans`,
    description:
      "View Divya Vani free messages, one-time seva tiers, subscriptions, billing currencies, and refund links.",
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/contact",
    title: `Contact | ${BRAND.name.en}`,
    description:
      "Contact Divya Vani for support, privacy questions, refunds, grievance requests, and business details.",
    lastModified: SITE_LAST_MODIFIED,
    changeFrequency: "yearly",
    priority: 0.4,
  },
  {
    path: "/privacy",
    title: `Privacy Policy | ${BRAND.name.en}`,
    description:
      "Read how Divya Vani collects, stores, protects, and deletes chat, voice, payment, and analytics data.",
    lastModified: "2026-05-15",
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/terms",
    title: `Terms of Service | ${BRAND.name.en}`,
    description:
      "Read the terms for using Divya Vani, including AI limitations, payments, conduct rules, and jurisdiction.",
    lastModified: "2026-05-15",
    changeFrequency: "yearly",
    priority: 0.3,
  },
  {
    path: "/refund",
    title: `Refund and Cancellation Policy | ${BRAND.name.en}`,
    description:
      "Read Divya Vani's refund and cancellation policy for one-time seva payments and subscription plans.",
    lastModified: "2026-05-25",
    changeFrequency: "yearly",
    priority: 0.3,
  },
] as const satisfies readonly PublicRoute[];

export const SOCIAL_PROFILES = [
  "https://www.youtube.com/@DivyaVani_All",
  "https://x.com/divyavani_ai",
  "https://www.reddit.com/user/Unhappy_Database6796/",
] as const;

export const HOMEPAGE_FAQS = [
  {
    question: "What is Divya Vani?",
    answer:
      "Divya Vani is an AI that roleplays Krishna from the Bhagavad Gita, Mahabharata, and Bhagavata Purana. Users can speak about life, emotions, relationships, and dharma while seeing scripture-grounded verse references.",
  },
  {
    question: "Is Divya Vani actually Krishna or divine guidance?",
    answer:
      "No. Divya Vani is an AI roleplaying Krishna based on scripture. It does not claim to be the divine Krishna, and a permanent disclaimer stays visible in the chat and voice experience.",
  },
  {
    question: "Which languages and scriptures does Divya Vani support?",
    answer:
      "Divya Vani is Hindi-first and also supports English and Sanskrit. The current corpus has 3,132 verses: 701 from the Bhagavad Gita, 1,704 from the Mahabharata, and 727 from the Bhagavata Purana.",
  },
  {
    question: "How much does Divya Vani cost?",
    answer:
      "Divya Vani includes 10 free messages. One-time seva tiers start at INR 11, and paid voice plus monthly and annual subscription plans are available on the Pricing page.",
  },
] as const;

export function absoluteUrl(path: string): string {
  if (path === "/") return BRAND.url;
  return `${BRAND.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function jsonLdScript(value: unknown): { __html: string } {
  return { __html: jsonLd(value) };
}
