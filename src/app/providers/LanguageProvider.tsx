"use client";

// Phase 12 — i18n. Client context that holds the active UI language for
// STATIC chrome (see src/lib/i18n.ts for the scope boundary). Default is
// English; on mount we hydrate from localStorage so a returning user's
// choice sticks. We also write a cookie (for a future SSR initial-lang
// pass) and keep <html lang> in sync for a11y/SEO.
//
// Krishna's chat/voice replies are NOT affected by this — they follow the
// user's input language at the model layer (Locked Decision #12).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  DEFAULT_LANG,
  LANG_STORAGE_KEY,
  UI_MESSAGES,
  type Lang,
  type Messages,
} from "@/lib/i18n";

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
  t: Messages;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  toggle: () => {},
  t: UI_MESSAGES[DEFAULT_LANG],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  // Hydrate from a prior choice after mount. Server render + first client
  // render are both DEFAULT_LANG, so there is no hydration mismatch; the
  // switch (if any) happens in this effect, post-hydration.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === "hi" || saved === "en") {
        // Intentional post-hydration sync from localStorage (see comment above).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLangState(saved);
        document.documentElement.lang = saved;
      }
    } catch {
      /* localStorage blocked (private mode / SSR) — stay on default */
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
      document.cookie = `${LANG_STORAGE_KEY}=${next}; path=/; max-age=${365 * 24 * 60 * 60}; samesite=lax`;
      document.documentElement.lang = next;
    } catch {
      /* non-fatal — in-memory state still updates the UI for this session */
    }
  }, []);

  const toggle = useCallback(() => {
    setLang(lang === "en" ? "hi" : "en");
  }, [lang, setLang]);

  return (
    <LanguageContext.Provider
      value={{ lang, setLang, toggle, t: UI_MESSAGES[lang] }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
