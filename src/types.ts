export interface NewsChapter {
  topic: string;
  scriptText: string;
  summaryBullets: string[];
}

export interface SummaryPayload {
  title: string;
  introduction: string;
  chapters: NewsChapter[];
  conclusion: string;
}

export interface SummaryPreferences {
  targetDuration: "short" | "medium" | "long";
  tone: "conversational" | "informative" | "upbeat" | "analytical" | "witty";
  voice: "Kore" | "Puck" | "Charon" | "Fenrir" | "Zephyr" | "vi-HN" | "vi-HCM" | "en-UK" | "en-US";
  focus: string;
  commuteType: "driving" | "transit" | "walking" | "cycling";
  customInstructions: string;
  language: "en" | "vi" | "bilingual";
}

export interface SavedSummary {
  id: string;
  timestamp: string;
  preferences: SummaryPreferences;
  payload: SummaryPayload;
  audioChunks?: string[]; // Base64 audio strings match: [Intro, ...Chapters, Conclusion]
}
