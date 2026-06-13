// Phase 6.9.1 — centralized brand strings.
//
// One frozen object, imported wherever brand text appears. Hedges
// against a third pivot (the brand has already been renamed once,
// from "Krishna AI" to "Divya Vani") becoming a multi-file grep
// rather than a one-line edit.
//
// Pure data only — no helpers, no behavior. `as const` so all
// literals get narrow types and downstream consumers get exhaustive
// autocomplete + compile-time guards against typos.
//
// Skipped intentionally (do NOT add references to BRAND in these):
//   - src/lib/systemPrompt.ts (locked persona file; brand text in
//     the persona prompt would invalidate the Phase 2.6 cache)
//   - src/lib/badWordFilter.ts (locked)
//   - scripts/, test files (intentional fixture hardcoding)

export const BRAND = {
  name: {
    en: "Divya Vani",
    hi: "दिव्य वाणी",
  },
  url: "https://divyavani.co.in",
  description: {
    en: "An AI roleplaying Krishna — speak about life, emotions, and dharma. Grounded in the Bhagavad Gita.",
    hi: "एक शांत जगह, जहाँ आप अपनी बात कह सकते हैं",
  },
  tagline: {
    hi: "जब मन उलझा हो, बस किसी से बात करनी हो…",
  },
  disclaimer: {
    en: "Divya Vani is an AI-based spiritual reflection tool. It does not claim to be the real Lord Krishna or divine guidance.",
    hi: "दिव्य वाणी एक AI-आधारित आध्यात्मिक चिंतन साधन है। यह वास्तविक भगवान कृष्ण या दैवीय मार्गदर्शन होने का दावा नहीं करता।",
  },
  trust: {
    en: {
      eyebrow: "Grounded in scriptures",
      title: "Why trust Divya Vani?",
      body: "Divya Vani is not a random chatbot. Its reflections are grounded in a curated scripture corpus from the Bhagavad Gita, Mahabharata, and Bhagavata Purana.",
      supporting: "When you ask a question, Divya Vani reflects through scripture-backed wisdom instead of giving generic motivational advice.",
      facts: [
        "Grounded in 3,132 scripture verses",
        "701 verses from the Bhagavad Gita",
        "1,704 verses from the Mahabharata",
        "727 verses from the Bhagavata Purana",
        "Hindi + English",
        "Chat + Voice",
      ],
    },
    hi: {
      eyebrow: "शास्त्रों पर आधारित",
      title: "दिव्य वाणी पर भरोसा क्यों?",
      body: "दिव्य वाणी कोई random chatbot नहीं है। इसके चिंतन भगवद्गीता, महाभारत और भागवत पुराण के curated scripture corpus पर आधारित हैं।",
      supporting: "जब आप प्रश्न पूछते हैं, दिव्य वाणी generic motivational advice के बजाय शास्त्र-आधारित ज्ञान से कृष्ण की बुद्धि के माध्यम से चिंतन कराती है।",
      facts: [
        "3,132 शास्त्रीय श्लोकों पर आधारित",
        "भगवद्गीता से 701 श्लोक",
        "महाभारत से 1,704 श्लोक",
        "भागवत पुराण से 727 श्लोक",
        "हिंदी + अंग्रेज़ी",
        "चैट + आवाज़",
      ],
    },
  },
  casual: {
    en: {
      eyebrow: "Casual conversation",
      title: "Talk casually, learn deeply",
      body: "Divya Vani is not only for difficult problems. You can also talk casually with Krishna AI, ask stories, learn verses, understand bhakti, explore dharma, or simply have a devotional conversation.",
      prompts: [
        "Tell me a story about Lord Krishna.",
        "Explain Bhagavad Gita 2.47 in simple words.",
        "Why is Krishna called Govinda?",
        "What is bhakti?",
        "Tell me something beautiful about Vrindavan.",
        "How can I remember Krishna while working?",
      ],
    },
    hi: {
      eyebrow: "सहज बातचीत",
      title: "सहज बात करें, गहराई से सीखें",
      body: "दिव्य वाणी केवल कठिन समस्याओं के लिए नहीं है। आप कृष्ण AI से सहज बातचीत कर सकते हैं, कहानियाँ पूछ सकते हैं, श्लोक सीख सकते हैं, भक्ति समझ सकते हैं, धर्म खोज सकते हैं, या बस एक भक्तिमय बातचीत कर सकते हैं।",
      prompts: [
        "भगवान कृष्ण की कोई कहानी सुनाइए।",
        "भगवद्गीता 2.47 को सरल शब्दों में समझाइए।",
        "कृष्ण को गोविंद क्यों कहा जाता है?",
        "भक्ति क्या है?",
        "वृंदावन के बारे में कुछ सुंदर बताइए।",
        "काम करते हुए मैं कृष्ण को कैसे याद रखूँ?",
      ],
    },
  },
  contact: {
    founder: "Krishna Yadav",
    email: "grievance.divyavani@gmail.com",
    location: "Kanpur, Uttar Pradesh, India",
    phone: "+917275606624",
    phoneDisplay: "+91 72756 06624",
    phoneHours: "Mon–Sat, 10am–6pm IST",
    // Registered business address shown on /contact (Razorpay + Google Ads
    // require a visible physical address). It MUST match the address on your
    // Razorpay business profile, or onboarding can be rejected for a mismatch.
    // (No GST registration yet — sole proprietor below the ₹20L threshold.)
    // Edit here only — /contact + footer read it.
    address: "255 EWS, Barra-4, Janta Nagar, Kanpur, Uttar Pradesh 208027, India",
  },
  copyright: {
    year: 2026,
    text: "© 2026 Divya Vani",
  },
  // Phase 10.5 — /voice (voice-to-voice orb mode) bilingual UI strings.
  // Centralized here so the route, landing CTA, chat-header link, and the
  // orchestrator's error surfaces all read one source. Hindi-first per the
  // project register; small English code-switches (browser, settings) match
  // how the target audience speaks. Krishna's actual spoken voice is the TTS
  // reply — none of these strings are ever spoken aloud, they are screen UI.
  voiceCopy: {
    // Tagline above the orb + landing/chat entry CTAs.
    title: { hi: "कृष्ण से बात करो", en: "Talk with Krishna" },
    cta: { hi: "बात करो", en: "Talk with Krishna" },
    // Always-visible identity disclaimer strip (Locked Decision #1).
    disclaimer: {
      hi: "श्रीकृष्ण रूप — शास्त्र-आधारित AI",
      en: "AI roleplaying Krishna based on scripture",
    },
    voiceGeneratedDisclaimer: {
      hi: "यह आवाज़ AI-generated है और भगवान कृष्ण की वास्तविक आवाज़ होने का दावा नहीं करती।",
      en: "The voice is AI-generated and does not claim to be the real voice of Lord Krishna.",
    },
    // Bottom action button labels per phase.
    begin: { hi: "तैयार हो?", en: "Begin" },
    exit: { hi: "रुको", en: "Exit" },
    retry: { hi: "दोबारा कोशिश", en: "Retry" },
    resume: { hi: "जारी रखो", en: "Resume" },
    // State-indicator strip text (zone 4). speaking deliberately conveys
    // "no text — just the voice" per the voice-only spec.
    states: {
      idle: { hi: "तैयार होने पर शुरू करें", en: "Tap when ready" },
      starting: { hi: "तैयार हो रहा हूँ…", en: "Getting ready…" },
      listening: { hi: "सुन रहा हूँ…", en: "Listening…" },
      transcribing: { hi: "समझ रहा हूँ…", en: "Hearing you…" },
      thinking: { hi: "सोच रहा हूँ…", en: "Thinking…" },
      speaking: { hi: "कृष्ण बोल रहे हैं", en: "Krishna is speaking" },
      ended: { hi: "बातचीत समाप्त", en: "Conversation ended" },
    },
    // Paywall overlay (voice is paid-seva only — matches /api/tts).
    paywall: {
      hi: "आवाज़ सेवा पाएँ",
      en: "Voice access requires seva",
      body: {
        hi: "आवाज़ में बातचीत सेवा-सदस्यों के लिए है। एक छोटी सेवा अर्पित करो।",
        en: "Voice conversation is for seva members. Offer a small seva to begin.",
      },
      openSeva: { hi: "सेवा करें", en: "Open Seva" },
    },
    // Resume-after-background prompt (mobile autoplay returns after a tab
    // is backgrounded — we never auto-resume audio without a fresh gesture).
    backgrounded: {
      hi: "वापस आ गए? बातचीत जारी रखें",
      en: "Welcome back — resume the conversation?",
    },
    // Post-exit affordances.
    readTranscript: { hi: "बातचीत पढ़ें", en: "Read transcript" },
    backToChat: { hi: "चैट पर लौटो", en: "Back to chat" },
    startNew: { hi: "फिर से शुरू करो", en: "Start again" },
    // Transcript modal.
    transcriptTitle: { hi: "बातचीत", en: "Conversation" },
    transcriptEmpty: {
      hi: "अभी कोई बातचीत नहीं हुई।",
      en: "No conversation yet.",
    },
    youLabel: { hi: "तुम", en: "You" },
    krishnaLabel: { hi: "कृष्ण", en: "Krishna" },
    close: { hi: "बंद करें", en: "Close" },
    // Per-failure-mode error prose (mirrors ChatUI's mic-error vocabulary).
    errors: {
      permission_denied: {
        hi: "माइक की अनुमति चाहिए — browser settings में जाकर allow करो, फिर page दोबारा खोलो।",
        en: "Microphone permission needed — allow it in browser settings, then reload this page.",
      },
      no_hardware: {
        hi: "इस device पर माइक नहीं मिला।",
        en: "No microphone found on this device.",
      },
      unsupported_browser: {
        hi: "तुम्हारा browser आवाज़ support नहीं करता। Chrome या Safari try करो।",
        en: "Your browser doesn't support voice. Try Chrome or Safari.",
      },
      vad_load_failed: {
        hi: "आवाज़ feature load नहीं हुआ। थोड़ी देर बाद try करो।",
        en: "Voice feature failed to load. Please try again in a moment.",
      },
      transcribe_failed: {
        hi: "अभी आवाज़ समझ नहीं पाया। फिर से बोलो।",
        en: "Couldn't hear that clearly. Please speak again.",
      },
      network: {
        hi: "connection टूट गया। फिर से कोशिश करो।",
        en: "The connection dropped. Please try again.",
      },
      tts_failed: {
        hi: "अभी आवाज़ नहीं बन पाई। फिर से कोशिश करो।",
        en: "Couldn't generate the voice right now. Please try again.",
      },
      audio_failed: {
        hi: "आवाज़ नहीं चल पाई। फिर से कोशिश करो।",
        en: "Audio playback failed. Please try again.",
      },
      generic: {
        hi: "कुछ गड़बड़ हुई। फिर से कोशिश करो।",
        en: "Something went wrong. Please try again.",
      },
    },
  },
} as const;
