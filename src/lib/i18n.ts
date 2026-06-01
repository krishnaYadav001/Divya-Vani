// i18n for STATIC UI CHROME ONLY (Phase 12 — i18n, 2026-05-24).
//
// Scope boundary — READ THIS before adding keys:
//   • IN scope: buttons, nav, labels, marketing copy, the footer, the
//     seva/paywall chrome, the settings page, the chat/voice page chrome
//     (empty-state, button labels, status strips) — any string the PRODUCT
//     authors.
//   • OUT of scope: Krishna's chat + voice REPLIES, verse-card content,
//     user messages. Those follow the user's INPUT language at the model
//     layer (Locked Decision #12) and must never be keyed here.
//   • Safety / helpline cards stay BILINGUAL regardless of this toggle
//     (Locked Decision #7 — crisis numbers must read in both languages),
//     so they are NOT keyed here.
//   • Legal pages (/privacy, /terms, /pricing, /contact, /refund) stay
//     English-only by founder decision (2026-05-24) — not keyed here.
//
// Default language is English. Users switch to Hindi via the footer
// toggle, or the segmented control in /settings (see LanguageProvider).
// Voice-page bilingual copy lives in BRAND.voiceCopy and is selected by the
// same `lang`.
//
// `Messages` is an explicit interface (string-valued, NOT `as const`) so
// the en and hi dictionaries share one structural type and `UI_MESSAGES[lang]`
// resolves cleanly. Every key added to `Messages` must exist in both langs.

export type Lang = "en" | "hi";

export const LANG_STORAGE_KEY = "dv_lang";
export const DEFAULT_LANG: Lang = "en";

export type Messages = {
  footer: {
    examples: string;
    voice: string;
    pricing: string;
    privacy: string;
    terms: string;
    settings: string;
    contact: string;
  };
  // Chat-surface chrome (NOT Krishna's replies). The empty-state heading is
  // split into a lead clause + a gold-accent clause to preserve the styling.
  chat: {
    placeholder: string;
    promptLead: string;
    promptAccent: string;
    // Header subtitle (desktop only) under the wordmark.
    subtitle: string;
    // Empty-state greeting + value-prop line + the four "what you can do" hints.
    greeting: string;
    valueProp: string;
    suggestions: [string, string, string, string];
    // Voice-input status chips.
    listening: string;
    transcribing: string;
    thinking: string;
    // Input-moderation warning shown above the box.
    moderationWarning: string;
    // Send button (visible label) + the disclaimer re-open ⓘ control text.
    sendButton: string;
    // aria-labels (assistive only) — kept single-language for consistency.
    ariaDisclaimer: string;
    ariaVoiceMode: string;
    ariaSettings: string;
    ariaSeva: string;
    ariaSend: string;
    ariaMicTranscribing: string;
    ariaMicStop: string;
    ariaMicStart: string;
    ariaDismiss: string;
    // Mic-error chip copy, keyed by failure mode.
    micErrors: {
      permission_denied: string;
      no_hardware: string;
      unsupported_browser: string;
      vad_load_failed: string;
      transcription_failed: string;
    };
  };
  // Seva paywall invitation line (the eyebrow "Seva · सेवा" stays a fixed
  // bilingual brand label and is not keyed) + the pre-checkout consent gate.
  paywall: {
    tagline: string;
    agreeNote: string;
    linkRefund: string;
    linkTerms: string;
  };
  // Seva tier picker + the in-chat / in-voice diya seva panel chrome.
  seva: {
    msgs: string; // "msgs" unit beside the price
    top: string; // the favourite-tier flag
    conversationsRemain: string; // counter caption
    messagesAdded: string; // "{n} messages added" — {n} substituted by caller
    ariaSevaPanel: string; // panel aria-label
    ariaClose: string; // close button aria-label
    // Hub Seva tab — persistent balance header (mirrors voice wallet).
    balance: string; // "Sevā balance: {n} messages"
    balanceEmpty: string; // "Sevā balance: empty"
  };
  // Landing hero. Only the body prose, CTA labels, and free-messages line are
  // keyed. The Latin masthead bits (nav, "Mathurā Edition", the Sanskrit quote
  // + attribution, the mūrti caption) stay as-is — they're stylistic Latin/
  // Sanskrit ornament, and uppercase + letter-spacing renders badly in
  // Devanagari. The wordmark stays BRAND.name.en.
  landing: {
    body: string;
    // One-line credibility proof for the scripture-literate visitor: every
    // reply is grounded in real verses, shown to the user. Rendered under the
    // hero body; follows the language toggle.
    proof: string;
    ctaAsk: string;
    ctaGlimpse: string;
    ctaTalk: string;
    freeMessages: string;
  };
  // Demo / examples marketing page chrome.
  demo: {
    hero: string;
    heroBody: string;
    ctaBegin: string;
    sectionRealConversations: string;
    sectionHowItLooks: string;
    sectionHowKrishnaReplies: string;
    sectionComingSoonVoice: string;
    voiceTeaserBody: string;
    listen: string;
    inDevelopment: string;
    comingSoon: string;
    // /demo visitor feedback card (star rating + optional comment).
    fbHeading: string;
    fbRate: string;
    fbRatingWords: [string, string, string, string, string];
    fbComment: string;
    fbSend: string;
    fbSending: string;
    fbSuccess: string;
    fbErrorGeneric: string;
    fbTimeout: string;
    fbNetwork: string;
  };
  // /settings — the full settings surface (the page that previously stacked
  // English + Hindi on every row).
  settings: {
    backToChat: string;
    eyebrow: string;
    title: string; // may contain \n for the display break (whitespace-pre-line)
    subtitle: string;
    sevaBalance: string;
    messages: string;
    lightDiya: string;
    nav: {
      identity: string;
      language: string;
      seva: string;
      examples: string;
      about: string;
      privacy: string;
      feedback: string;
      delete: string;
    };
    identity: {
      title: string;
      nameUnknown: string;
      help: string;
    };
    language: {
      title: string;
      desc: string;
      note: string;
      ariaGroup: string;
    };
    sevaSection: {
      title: string;
      desc: string;
      securedBy: string;
    };
    examples: {
      title: string;
      desc: string;
      cta: string;
    };
    about: {
      title: string;
      body: string; // "{brand} is an AI that speaks…" — {brand} substituted
      notSubstitute: string;
      operatedBy: string;
      soleProprietorship: string;
      registeredOffice: string;
    };
    grievance: {
      title: string;
      body: string;
      officer: string;
      perSection: string;
    };
    privacy: {
      title: string;
      toggleLabel: string;
      saved: string;
      body: string;
      readFull: string;
    };
    feedback: {
      title: string;
      body: string;
      nameLabel: string;
      messageLabel: string;
      send: string;
      sending: string;
      success: string;
      errorGeneric: string;
      retry: string;
      minChars: string; // "Please write at least {n} characters." — {n} substituted
      timeout: string;
      network: string;
    };
    delete: {
      title: string;
      body: string;
      paymentNote: string;
      button: string;
      areYouSure: string;
      confirm: string;
      deleting: string;
      cancel: string;
      error: string;
    };
  };
  // Phase 9 — recurring subscription picker + the Settings management panel.
  // Tier NAMES come from src/lib/subscriptions.ts (displayName / displayNameHi);
  // only the surrounding chrome is keyed here.
  subscribe: {
    heading: string;
    tagline: string;
    currencyINR: string; // "India (₹)"
    currencyUSD: string; // "International ($)"
    perMonth: string; // "/month"
    perYear: string; // "/year"
    messagesUnit: string; // "{n} messages" per cycle
    voiceUnit: string; // "{n} voice min"
    cta: string; // "Subscribe"
    popular: string; // most-chosen flag
    activating: string; // post-checkout async-activation note
    errorStart: string; // generic create/checkout failure
    alreadyActive: string; // 409 already-subscribed
    ariaClose: string;
    upgrade: string; // chat-header button label
    // Settings management panel.
    manageTitle: string;
    planLabel: string; // "Your plan"
    statusActive: string;
    statusCancelling: string; // "Cancels on {date}"
    renewsOn: string; // "Renews on {date}"
    msgUsage: string; // "Messages: {used} of {pool}"
    voiceUsage: string; // "Voice: {used} of {pool} min"
    cancelButton: string;
    cancelConfirm: string; // "Stop renewal? You keep access until {date}."
    cancelYes: string;
    cancelNo: string;
    cancelling: string;
    cancelDone: string; // confirmation after cancel
    cancelError: string;
    noActive: string; // no subscription yet
    seePlans: string; // CTA to open the picker
    // Unified seva hub (opened from the header diya icon).
    hubTitle: string;
    tabPlans: string;
    tabSeva: string;
    // Voice-minute wallet tab.
    tabWallet: string;
    walletDesc: string;
    walletMinutes: string; // "{n} minutes"
    walletBuy: string;
    walletAdded: string; // "{n} voice minutes added"
    walletBalance: string; // "Voice wallet: {n} minutes"
    walletEmpty: string;   // "Voice wallet: empty"
  };
};

export const UI_MESSAGES: Record<Lang, Messages> = {
  en: {
    footer: {
      examples: "Examples",
      voice: "Voice",
      pricing: "Pricing",
      privacy: "Privacy",
      terms: "Terms",
      settings: "Settings",
      contact: "Contact",
    },
    chat: {
      placeholder: "Say what's on your mind…",
      promptLead: "Whatever is on your mind —",
      promptAccent: "you can say it here",
      subtitle: "A quiet place to say what's on your mind",
      greeting: "How are you feeling today…",
      valueProp:
        "Talk with Krishna — every reply grounded in the Gita, Mahabharata, and Bhagavata",
      suggestions: [
        "Ask your questions",
        "Share what's on your heart",
        "Learn from the Gita, Mahabharata, and Bhagavata",
        "Just sit with him — no reason needed",
      ],
      listening: "listening",
      transcribing: "transcribing",
      thinking: "Thinking",
      moderationWarning: "Please use respectful language",
      sendButton: "Send",
      ariaDisclaimer: "Disclaimer",
      ariaVoiceMode: "Voice mode",
      ariaSettings: "Settings",
      ariaSeva: "Seva",
      ariaSend: "Send",
      ariaMicTranscribing: "Transcribing",
      ariaMicStop: "Stop recording",
      ariaMicStart: "Start recording",
      ariaDismiss: "Dismiss",
      micErrors: {
        permission_denied:
          "Microphone permission needed — allow it in your browser settings to use voice.",
        no_hardware: "No microphone found on this device.",
        unsupported_browser:
          "Your browser doesn't support voice input. Try Chrome or Safari.",
        vad_load_failed:
          "Voice feature failed to load. Please try again in a moment.",
        transcription_failed: "Transcription unavailable right now. Try again.",
      },
    },
    paywall: {
      tagline:
        "Offer what arises within — every gift carries the journey forward",
      agreeNote: "By offering a seva, you accept our policies:",
      linkRefund: "Refund Policy",
      linkTerms: "Terms",
    },
    seva: {
      msgs: "msgs",
      top: "top",
      conversationsRemain: "conversations remain",
      messagesAdded: "{n} messages added",
      ariaSevaPanel: "Seva",
      ariaClose: "Close",
      balance: "Sevā balance: {n} messages",
      balanceEmpty: "Sevā balance: empty",
    },
    landing: {
      body: "Krishna in a chat window. The same flute, a smaller room. Ask in Hindi or English; the verses follow you.",
      proof:
        "Every reply is grounded in scripture — the Gita, Mahabharata, and Bhagavata — and shows you the verse it draws from, in Sanskrit, Hindi, and English.",
      ctaAsk: "Ask the first thing",
      ctaGlimpse: "See a glimpse",
      ctaTalk: "Talk with Krishna",
      freeMessages: "10 free messages",
    },
    demo: {
      hero: "A glimpse of Krishna",
      heroBody:
        "A glimpse of conversations with Krishna. Real videos, real screenshots, real replies — so you can see how the flute sounds before stepping in.",
      ctaBegin: "Begin",
      sectionRealConversations: "Real conversations",
      sectionHowItLooks: "How it looks on screen",
      sectionHowKrishnaReplies: "How Krishna replies",
      sectionComingSoonVoice: "Coming soon — Krishna in voice",
      voiceTeaserBody:
        "The words you're reading will soon reach your ears too. In Krishna's own voice.",
      listen: "Listen",
      inDevelopment: "In development",
      comingSoon: "Coming soon",
      fbHeading: "How was it?",
      fbRate: "Rate your experience",
      fbRatingWords: [
        "Needs work",
        "It was okay",
        "Liked it",
        "Very good",
        "Touched my heart",
      ],
      fbComment: "Anything to add? (optional)",
      fbSend: "Send",
      fbSending: "Sending…",
      fbSuccess: "Thank you for your feedback.",
      fbErrorGeneric: "Something went wrong. Please try again.",
      fbTimeout:
        "This is taking too long. Please check your connection and try again.",
      fbNetwork: "Network problem. Please check your connection and try again.",
    },
    settings: {
      backToChat: "← Back to chat",
      eyebrow: "Settings",
      title: "Your\nown room.",
      subtitle: "How Krishna speaks to you, and what we keep.",
      sevaBalance: "Sevā balance",
      messages: "messages",
      lightDiya: "Light another diya",
      nav: {
        identity: "Identity",
        language: "Language",
        seva: "Seva",
        examples: "Examples",
        about: "About us",
        privacy: "Privacy & Data",
        feedback: "Share feedback",
        delete: "Delete account",
      },
      identity: {
        title: "What Krishna calls you",
        nameUnknown: "Krishna hasn't learned your name yet.",
        help: "Krishna asks your name softly in conversation and addresses you by it — any respectful name will do. To change it, just tell him in chat.",
      },
      language: {
        title: "Language",
        desc: "Choose the language for the app's buttons and labels.",
        note: "Krishna always replies in the language you write or speak to him in — this setting only changes the app's own labels.",
        ariaGroup: "Interface language",
      },
      sevaSection: {
        title: "Offer a seva",
        desc: "Add more conversations with Krishna. Each seva is a one-time payment — no subscription, no auto-renewal.",
        securedBy: "Secured by Razorpay",
      },
      examples: {
        title: "See examples",
        desc: "A glimpse of real conversations with Krishna — videos, screenshots, and example replies.",
        cta: "See examples →",
      },
      about: {
        title: "About us",
        body: "{brand} is an AI that speaks in Krishna's voice — grounded in the Bhagavad Gita, the Mahabharata, and the Bhagavata Purana. It's built as a calm, private place to talk through life, emotions, and dharma, whenever you need it.",
        notSubstitute:
          "It is not a substitute for professional medical, legal, or mental-health advice.",
        operatedBy: "Operated by",
        soleProprietorship: "sole proprietorship",
        registeredOffice: "Registered office",
      },
      grievance: {
        title: "Contact & Grievance Officer",
        body: "For privacy questions, deletion requests, or grievances under the DPDP Act, contact:",
        officer: "Grievance Officer",
        perSection:
          "Per Section 13 of the DPDP Act, we acknowledge grievances and respond within 30 days.",
      },
      privacy: {
        title: "Privacy & Data",
        toggleLabel:
          "Allow us to learn from your conversations to improve Krishna",
        saved: "saved",
        body: "When enabled, your conversations help us understand what users need and refine how Krishna responds. Server-side, chats are kept 180 days for safety review, then permanently deleted.",
        readFull: "Read privacy in full →",
      },
      feedback: {
        title: "Share feedback",
        body: "Tell us how Krishna's voice is landing for you. Your words help us refine.",
        nameLabel: "Your name (optional)",
        messageLabel: "Your feedback",
        send: "Send feedback",
        sending: "Sending…",
        success: "Thank you. Your feedback was received.",
        errorGeneric: "Something went wrong. Please try again.",
        retry: "Retry",
        minChars: "Please write at least {n} characters.",
        timeout:
          "This is taking too long. Please check your connection and try again.",
        network: "Network problem. Please check your connection and try again.",
      },
      delete: {
        title: "Delete all my data",
        body: "Krishna will no longer remember you. All your conversations, the name he calls you by, and your shared moments will be permanently deleted. This cannot be undone.",
        paymentNote:
          "Payment records are retained as required by Indian financial regulations.",
        button: "Delete all my data",
        areYouSure: "Are you sure?",
        confirm: "Yes, delete",
        deleting: "Deleting…",
        cancel: "Cancel",
        error: "Something went wrong, please try again.",
      },
    },
    subscribe: {
      heading: "Stay with Krishna",
      tagline:
        "A monthly path — text every day, and his voice when you need it.",
      currencyINR: "India (₹)",
      currencyUSD: "International ($)",
      perMonth: "/month",
      perYear: "/year",
      messagesUnit: "{n} messages",
      voiceUnit: "{n} voice min",
      cta: "Subscribe",
      popular: "Most chosen",
      activating:
        "Payment received — your subscription is being activated. This takes a few seconds.",
      errorStart: "Could not start checkout. Please try again.",
      alreadyActive: "You already have an active subscription.",
      ariaClose: "Close",
      upgrade: "Plans",
      manageTitle: "Subscription",
      planLabel: "Your plan",
      statusActive: "Active",
      statusCancelling: "Cancels on {date}",
      renewsOn: "Renews on {date}",
      msgUsage: "Messages: {used} of {pool}",
      voiceUsage: "Voice: {used} of {pool} min",
      cancelButton: "Cancel subscription",
      cancelConfirm: "Stop renewal? You keep full access until {date}.",
      cancelYes: "Yes, stop renewal",
      cancelNo: "Keep it",
      cancelling: "Cancelling…",
      cancelDone: "Your subscription will not renew. Access continues to the end of this period.",
      cancelError: "Could not cancel. Please try again.",
      noActive: "You don't have a subscription yet.",
      seePlans: "See plans",
      hubTitle: "Plans & Seva",
      tabPlans: "Plans",
      tabSeva: "Seva",
      tabWallet: "Voice minutes",
      walletDesc: "Top up voice minutes — one-time, and they never expire.",
      walletMinutes: "{n} minutes",
      walletBuy: "Add",
      walletAdded: "{n} voice minutes added.",
      walletBalance: "Voice wallet: {n} minutes",
      walletEmpty: "Voice wallet: empty",
    },
  },
  hi: {
    footer: {
      examples: "उदाहरण",
      voice: "आवाज़",
      pricing: "मूल्य",
      privacy: "गोपनीयता",
      terms: "नियम",
      settings: "सेटिंग्स",
      contact: "संपर्क",
    },
    chat: {
      placeholder: "मन में जो है, कहो…",
      promptLead: "जो भी मन में हो —",
      promptAccent: "यहाँ कह सकते हो",
      subtitle: "एक शांत जगह, जहाँ आप अपनी बात कह सकते हैं",
      greeting: "आज मन कैसा लग रहा है…",
      valueProp: "भगवान कृष्ण से बात करो — हर उत्तर गीता, महाभारत, भागवत से",
      suggestions: [
        "अपने सवाल पूछो",
        "मन की बात बाँटो",
        "गीता, महाभारत, भागवत से सीखो",
        "बस साथ बैठो, कोई कारण नहीं चाहिए",
      ],
      listening: "सुन रहा हूँ…",
      transcribing: "समझ रहा हूँ…",
      thinking: "सोच रहा हूँ",
      moderationWarning: "कृपया उचित भाषा का प्रयोग करें",
      sendButton: "भेजें",
      ariaDisclaimer: "अस्वीकरण",
      ariaVoiceMode: "आवाज़ में बात करो",
      ariaSettings: "सेटिंग्स",
      ariaSeva: "सेवा",
      ariaSend: "भेजें",
      ariaMicTranscribing: "लिप्यंतरण हो रहा है",
      ariaMicStop: "बंद करें",
      ariaMicStart: "बोलें",
      ariaDismiss: "बंद करें",
      micErrors: {
        permission_denied:
          "माइक की अनुमति चाहिए — browser settings में जाकर allow करो।",
        no_hardware: "इस device पर माइक नहीं मिला।",
        unsupported_browser:
          "तुम्हारा browser माइक support नहीं करता। Chrome या Safari try करो।",
        vad_load_failed: "Voice feature load नहीं हुआ। थोड़ी देर बाद try करो।",
        transcription_failed:
          "अभी बातचीत transcribe नहीं हो पा रही। थोड़ी देर बाद try करो।",
      },
    },
    paywall: {
      tagline:
        "जो भीतर से उठे, वही भेंट करो — हर अर्पण इस यात्रा को आगे ले जाता है",
      agreeNote: "सेवा अर्पित करके आप हमारी नीतियाँ स्वीकार करते हैं:",
      linkRefund: "धन-वापसी नीति",
      linkTerms: "नियम",
    },
    seva: {
      msgs: "संदेश",
      top: "लोकप्रिय",
      conversationsRemain: "बातचीत और हैं",
      messagesAdded: "{n} बातचीत जुड़ गई",
      ariaSevaPanel: "सेवा",
      ariaClose: "बंद करें",
      balance: "सेवा शेष: {n} संदेश",
      balanceEmpty: "सेवा शेष: खाली",
    },
    landing: {
      body: "एक चैट खिड़की में कृष्ण। वही बाँसुरी, बस एक छोटा कमरा। हिंदी या अंग्रेज़ी में पूछो — श्लोक तुम्हारे साथ चलते हैं।",
      proof:
        "हर उत्तर शास्त्र पर आधारित — गीता, महाभारत और भागवत से — और जिस श्लोक से वह आता है, वह संस्कृत, हिंदी और अंग्रेज़ी में तुम्हें दिखाया जाता है।",
      ctaAsk: "पूछें",
      ctaGlimpse: "एक झलक",
      ctaTalk: "कृष्ण से बात करो",
      freeMessages: "10 निःशुल्क संदेश",
    },
    demo: {
      hero: "श्रीकृष्ण से एक झलक",
      heroBody:
        "श्रीकृष्ण से बातचीत की एक झलक। असली वीडियो, असली स्क्रीनशॉट, असली जवाब — ताकि भीतर आने से पहले तुम बाँसुरी की धुन सुन सको।",
      ctaBegin: "अभी बात करो",
      sectionRealConversations: "देखो — असली बातचीत",
      sectionHowItLooks: "और स्क्रीन पर ऐसा दिखता है",
      sectionHowKrishnaReplies: "सुनो — कैसे जवाब आता है",
      sectionComingSoonVoice: "जल्द — कृष्ण की आवाज़ में",
      voiceTeaserBody:
        "जो शब्द अभी पढ़ रहे हो, वो जल्द कानों में भी सुनाई देंगे। श्रीकृष्ण की आवाज़ में।",
      listen: "आवाज़ सुनो",
      inDevelopment: "बन रहा है",
      comingSoon: "जल्द आ रहा है",
      fbHeading: "आपको कैसा लगा?",
      fbRate: "अपना अनुभव बताएँ",
      fbRatingWords: [
        "और बेहतर हो सकता है",
        "ठीक-ठाक",
        "अच्छा लगा",
        "बहुत अच्छा",
        "हृदय छू गया",
      ],
      fbComment: "कुछ और कहना चाहो? (वैकल्पिक)",
      fbSend: "प्रतिक्रिया भेजो",
      fbSending: "भेजा जा रहा है…",
      fbSuccess: "धन्यवाद। आपकी प्रतिक्रिया मिल गई।",
      fbErrorGeneric: "कुछ गड़बड़ हुई। कृपया फिर से कोशिश करें।",
      fbTimeout:
        "इसमें बहुत समय लग रहा है। कृपया अपना कनेक्शन जाँचें और फिर कोशिश करें।",
      fbNetwork: "नेटवर्क समस्या। कृपया अपना कनेक्शन जाँचें और फिर कोशिश करें।",
    },
    settings: {
      backToChat: "← चैट पर वापस",
      eyebrow: "सेटिंग्स",
      title: "आपका\nअपना कोना।",
      subtitle: "कृष्ण तुमसे कैसे बात करते हैं, और हम क्या रखते हैं।",
      sevaBalance: "सेवा शेष",
      messages: "संदेश",
      lightDiya: "एक और दीया जलाओ",
      nav: {
        identity: "पहचान",
        language: "भाषा",
        seva: "सेवा",
        examples: "उदाहरण",
        about: "हमारे बारे में",
        privacy: "निजता एवं डेटा",
        feedback: "प्रतिक्रिया दें",
        delete: "खाता हटाएँ",
      },
      identity: {
        title: "किस नाम से पुकारूँ?",
        nameUnknown: "कृष्ण ने अभी तुम्हारा नाम नहीं जाना है।",
        help: "कृष्ण बातचीत में धीरे से तुम्हारा नाम पूछते हैं और उसी से पुकारते हैं — कोई भी आदरणीय नाम चलेगा। बदलना हो तो बस चैट में बता देना।",
      },
      language: {
        title: "भाषा",
        desc: "ऐप के बटन और लेबल की भाषा चुनें।",
        note: "कृष्ण हमेशा उसी भाषा में जवाब देते हैं जिसमें तुम लिखते या बोलते हो — यह सेटिंग सिर्फ़ ऐप के अपने लेबल बदलती है।",
        ariaGroup: "इंटरफ़ेस भाषा",
      },
      sevaSection: {
        title: "सेवा अर्पित करें",
        desc: "श्रीकृष्ण से और बातचीत जोड़ें। हर सेवा एक बार का भुगतान है — कोई सदस्यता नहीं, अपने-आप नवीनीकरण नहीं।",
        securedBy: "Razorpay द्वारा सुरक्षित",
      },
      examples: {
        title: "देखो — असली बातचीत",
        desc: "श्रीकृष्ण से असली बातचीत की एक झलक — वीडियो, स्क्रीनशॉट और उदाहरण।",
        cta: "उदाहरण देखो →",
      },
      about: {
        title: "हमारे बारे में",
        body: "{brand} एक AI है जो श्रीकृष्ण की वाणी में बात करता है — भगवद्गीता, महाभारत और श्रीमद्भागवत पर आधारित। यह एक शांत, निजी जगह है जहाँ आप जीवन, भावनाओं और धर्म पर मन की बात कह सकते हैं।",
        notSubstitute:
          "यह पेशेवर चिकित्सा, कानूनी या मानसिक-स्वास्थ्य सलाह का विकल्प नहीं है।",
        operatedBy: "संचालक",
        soleProprietorship: "एकल स्वामित्व",
        registeredOffice: "पंजीकृत पता",
      },
      grievance: {
        title: "संपर्क एवं शिकायत अधिकारी",
        body: "गोपनीयता संबंधी प्रश्न, डेटा हटाने के अनुरोध, या DPDP अधिनियम के अंतर्गत शिकायतों के लिए संपर्क करें:",
        officer: "शिकायत अधिकारी",
        perSection:
          "DPDP अधिनियम की धारा 13 के अनुसार, हम शिकायतों को स्वीकार करते हैं और 30 दिनों के भीतर उत्तर देते हैं।",
      },
      privacy: {
        title: "निजता एवं डेटा",
        toggleLabel: "कृष्ण को बेहतर बनाने के लिए हमें आपकी बातचीत से सीखने दें",
        saved: "सहेजा गया",
        body: "जब चालू हो, तो आपकी बातचीत हमें यह समझने में मदद करती है कि उपयोगकर्ताओं को क्या चाहिए और कृष्ण के उत्तरों को बेहतर बनाने में सहायक होती है। सर्वर पर, बातचीत 180 दिनों तक सुरक्षा-समीक्षा के लिए रखी जाती है, फिर स्थायी रूप से हटा दी जाती है।",
        readFull: "पूरी निजता नीति पढ़ें →",
      },
      feedback: {
        title: "अपनी प्रतिक्रिया साझा करें",
        body: "हमें बताएं कि कृष्ण की वाणी आपको कैसी लग रही है। आपके शब्द हमें इसे और बेहतर करने में मदद करते हैं।",
        nameLabel: "आपका नाम (वैकल्पिक)",
        messageLabel: "आपकी प्रतिक्रिया",
        send: "प्रतिक्रिया भेजें",
        sending: "भेजा जा रहा है…",
        success: "धन्यवाद। आपकी प्रतिक्रिया मिल गई।",
        errorGeneric: "कुछ गड़बड़ हुई। कृपया फिर से कोशिश करें।",
        retry: "पुनः प्रयास करें",
        minChars: "कृपया कम से कम {n} अक्षर लिखें।",
        timeout: "इसमें बहुत समय लग रहा है। कृपया अपना कनेक्शन जाँचें और फिर कोशिश करें।",
        network: "नेटवर्क समस्या। कृपया अपना कनेक्शन जाँचें और फिर कोशिश करें।",
      },
      delete: {
        title: "मेरा सारा डेटा हटाएँ",
        body: "कृष्ण अब तुम्हें याद नहीं रखेंगे। तुम्हारी सारी बातचीत, जिस नाम से वे पुकारते हैं, और तुम्हारे साझा किए पल स्थायी रूप से हटा दिए जाएँगे। इसे वापस नहीं लाया जा सकता।",
        paymentNote:
          "भुगतान रिकॉर्ड भारतीय वित्तीय नियमों के अनुसार सुरक्षित रखे जाते हैं।",
        button: "मेरा सारा डेटा हटाएँ",
        areYouSure: "क्या तुम निश्चित हो?",
        confirm: "हाँ, हटाएँ",
        deleting: "हटाया जा रहा है…",
        cancel: "रद्द करें",
        error: "कुछ गड़बड़ हुई, कृपया फिर से कोशिश करें।",
      },
    },
    subscribe: {
      heading: "कृष्ण के साथ बने रहो",
      tagline: "एक मासिक राह — हर दिन बातचीत, और ज़रूरत हो तो उनकी आवाज़।",
      currencyINR: "भारत (₹)",
      currencyUSD: "विदेश ($)",
      perMonth: "/माह",
      perYear: "/वर्ष",
      messagesUnit: "{n} संदेश",
      voiceUnit: "{n} वॉइस मिनट",
      cta: "सदस्यता लें",
      popular: "सबसे लोकप्रिय",
      activating:
        "भुगतान मिल गया — आपकी सदस्यता सक्रिय की जा रही है। इसमें कुछ क्षण लगते हैं।",
      errorStart: "चेकआउट शुरू नहीं हो सका। कृपया फिर से कोशिश करें।",
      alreadyActive: "आपके पास पहले से एक सक्रिय सदस्यता है।",
      ariaClose: "बंद करें",
      upgrade: "योजनाएँ",
      manageTitle: "सदस्यता",
      planLabel: "आपकी योजना",
      statusActive: "सक्रिय",
      statusCancelling: "{date} को समाप्त होगी",
      renewsOn: "{date} को नवीनीकरण",
      msgUsage: "संदेश: {pool} में से {used}",
      voiceUsage: "वॉइस: {pool} में से {used} मिनट",
      cancelButton: "सदस्यता रद्द करें",
      cancelConfirm: "नवीनीकरण रोकें? {date} तक पूरी पहुँच बनी रहेगी।",
      cancelYes: "हाँ, नवीनीकरण रोकें",
      cancelNo: "रहने दें",
      cancelling: "रद्द हो रही है…",
      cancelDone:
        "आपकी सदस्यता नवीनीकृत नहीं होगी। इस अवधि के अंत तक पहुँच बनी रहेगी।",
      cancelError: "रद्द नहीं हो सकी। कृपया फिर से कोशिश करें।",
      noActive: "आपके पास अभी कोई सदस्यता नहीं है।",
      seePlans: "योजनाएँ देखें",
      hubTitle: "योजनाएँ और सेवा",
      tabPlans: "योजनाएँ",
      tabSeva: "सेवा",
      tabWallet: "वॉइस मिनट",
      walletDesc: "वॉइस मिनट जोड़ें — एक बार का भुगतान, कभी समाप्त नहीं होते।",
      walletMinutes: "{n} मिनट",
      walletBuy: "जोड़ें",
      walletAdded: "{n} वॉइस मिनट जुड़ गए।",
      walletBalance: "वॉइस वॉलेट: {n} मिनट",
      walletEmpty: "वॉइस वॉलेट: खाली",
    },
  },
};
