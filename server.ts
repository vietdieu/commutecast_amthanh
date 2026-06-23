import express from "express";
import path from "path";
import dotenv from "dotenv";
import cors from "cors";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import * as edgeTTS from "edge-tts";
import fs from "fs";
import { Storage } from "@google-cloud/storage";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { v4 as uuidv4 } from "uuid";
import xml2js from "xml2js";
import { createClient } from "@supabase/supabase-js";


dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Middleware
app.use(cors()); // Cho phép mọi origin (có thể giới hạn nếu cần)
app.use(express.json({ limit: "50mb" }));

// Health check endpoint (cho UptimeRobot)
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Active index of the selected Gemini key
let currentKeyIndex = 0;

// Helper to get all configured keys
function getKeysList(): string[] {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY.trim());
  for (let i = 2; i <= 6; i++) {
    const key = process.env[`GEMINI_API_KEY${i}`];
    if (key) keys.push(key.trim());
  }
  return keys.filter(k => k !== "");
}

// Kiểm tra ngay khi khởi động
if (getKeysList().length === 0) {
  console.warn("[Warning] No Gemini API keys found. Some features may fail.");
}

// Lazy initializer (không cần dùng trực tiếp, nhưng giữ để tương thích)
function getGenAI(): GoogleGenAI {
  const keys = getKeysList();
  if (keys.length === 0) {
    throw new Error("GEMINI_API_KEY is not defined. Please check Settings -> Secrets.");
  }
  const idx = currentKeyIndex % keys.length;
  return new GoogleGenAI({
    apiKey: keys[idx],
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });
}

// Function with built-in automatic key rotation on 429 / Quota Limit failures
async function callGeminiWithRotation<T>(
  apiCall: (ai: GoogleGenAI) => Promise<T>
): Promise<T> {
  const keys = getKeysList();
  if (keys.length === 0) {
    throw new Error("No GEMINI_API_KEY is configured. Please set at least GEMINI_API_KEY in Settings -> Secrets.");
  }

  let attempts = 0;
  let lastError: any = null;

  while (attempts < keys.length) {
    const keyIndex = currentKeyIndex % keys.length;
    const currentKey = keys[keyIndex];
    
    const ai = new GoogleGenAI({
      apiKey: currentKey,
      httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
    });

    try {
      console.log(`[Gemini Rotation] Attempting call using Key Index #${keyIndex + 1} of ${keys.length} (ending ...${currentKey.slice(-4)})`);
      const result = await apiCall(ai);
      return result;
    } catch (error: any) {
      lastError = error;
      const errMsg = (error.message || "").toLowerCase();
      const isQuotaLimit = 
        errMsg.includes("resource_exhausted") || 
        errMsg.includes("quota") || 
        errMsg.includes("limit") ||
        errMsg.includes("429");

      if (isQuotaLimit && keys.length > 1) {
        console.warn(`[Gemini Rotation] Key Index #${keyIndex + 1} hit quota. Falling back to next key...`);
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        attempts++;
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error("All configured GEMINI_API_KEY entries returned quota limits.");
}

// Helper function to query Groq Cloud API when GROQ_API_KEY is supplied by the user
async function generateWithGroq(systemPrompt: string, userPrompt: string, responseFormatJson: boolean = false): Promise<string> {
  const gApiKey = process.env.GROQ_API_KEY;
  if (!gApiKey) {
    throw new Error("GROQ_API_KEY is not defined in system environment.");
  }

  const modelName = "llama-3.3-70b-versatile";

  let finalSystemPrompt = systemPrompt;
  if (responseFormatJson) {
    finalSystemPrompt += "\nCRITICAL: Your entire output must be one single valid JSON object strictly matching the requested JSON Schema structure. Do not output any markdown code blocks, surround with triple backticks, or write conversational surrounding wrapper text.";
  }

  const payload: any = {
    model: modelName,
    messages: [
      { role: "system", content: finalSystemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: 0.3,
  };

  if (responseFormatJson) {
    payload.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${gApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Groq API returned error status ${response.status}: ${errorText}`);
  }

  const data: any = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Groq API returned empty choices content.");
  }
  return content;
}


// Helper to extract clean messages from any nested Gaxios or Google API failures
function extractErrorMessage(error: any): string {
  if (!error) return "Unknown error";
  
  let details = "";
  if (error.response && error.response.data) {
    const data = error.response.data;
    if (typeof data === "string") {
      details = data;
    } else if (typeof data === "object") {
      if (data.error) {
        if (typeof data.error === "object") {
          details = data.error.message || JSON.stringify(data.error);
        } else {
          details = String(data.error);
        }
      } else {
        details = JSON.stringify(data);
      }
    }
  }

  const baseMsg = error.message || "";
  let fullMsg = baseMsg;
  if (details) {
    fullMsg += ` (Details: ${details})`;
  }
  
  if (error.status) {
    fullMsg = `[Status ${error.status}] ${fullMsg}`;
  }
  
  return fullMsg;
}

// Maps technical quota/rate limit errors to friendly instructions in VN and EN
function parseGeminiError(error: any, isVi: boolean = true, isTTS: boolean = false): string {
  const fullMsg = extractErrorMessage(error);
  const lowercaseMsg = fullMsg.toLowerCase();
  
  if (
    lowercaseMsg.includes("resource_exhausted") || 
    lowercaseMsg.includes("quota") || 
    lowercaseMsg.includes("limit") ||
    lowercaseMsg.includes("429") ||
    lowercaseMsg.includes("rate limit")
  ) {
    if (isTTS) {
      if (isVi) {
        return "QUOTA_LIMIT: Bạn đã tạm thời sử dụng hết số lượt chuyển đổi giọng nói miễn phí của Google TTS (Giới hạn tối đa là 10 lượt gọi mỗi ngày của mô hình thử nghiệm gemini-3.1-flash-tts). Để tiếp tục trải nghiệm toàn bộ thiết kế Trình Player & Hiệu ứng phòng thu live, bạn hãy phát các bản tin mẫu lưu sẵn ở mục 'Lịch sử phát thanh' (chứa tệp âm thanh hoàn chỉnh) ngay bên dưới!";
      } else {
        return "QUOTA_LIMIT: You have temporarily reached Google's free-tier daily call limit for the experimental 'gemini-3.1-flash-tts-preview' model (capped at exactly 10 requests per day per project). To continue experiencing the dynamic live player spectrum and effects, simply select and play any pre-cached briefings from the 'Commute Briefing Archive' below!";
      }
    } else {
      if (isVi) {
        return "QUOTA_LIMIT: Bạn đã tạm thời vượt quá giới hạn cuộc gọi miễn phí của mô hình Gemini (Giới hạn tài nguyên). Vui lòng đợi 30 giây rùi thử lại hoặc bấm phát các bản tin lưu sẵn ở mục 'Lịch sử phát thanh' bên dưới!";
      } else {
        return "QUOTA_LIMIT: You have hit the default free-tier rate limits for the Gemini model. Please wait 30 seconds before retrying, or explore our pre-cached archives below!";
      }
    }
  }

  if (lowercaseMsg.includes("api_key_invalid") || lowercaseMsg.includes("api key not valid") || lowercaseMsg.includes("invalid api key") || lowercaseMsg.includes("key is invalid")) {
    if (isVi) {
      return "LỖI: Khóa API Gemini của bạn không hợp lệ hoặc đã bị khóa. Vui lòng kiểm tra lại thiết lập Secrets trong AI Studio.";
    } else {
      return "ERROR: Your Gemini API key is invalid or suspended. Please check your Secrets configuration in AI Studio.";
    }
  }

  return fullMsg || "An unexpected error occurred during cloud server operations.";
}

// 1. API: Summarize provided articles into a broad-cast ready script
app.post("/api/summarize", async (req, res): Promise<any> => {
  const language = req.body?.preferences?.language || "en";
  const isVi = language === "vi" || language === "bilingual";

  try {
    const { content, preferences } = req.body;
    if (!content || content.trim() === "") {
      return res.status(400).json({ error: "No news articles content provided." });
    }

    const targetDuration = preferences?.targetDuration || "medium"; // short (~1m), medium (~3m), long (~6m)
    const tone = preferences?.tone || "conversational"; // radio anchor, podcast co-host, etc.
    const focus = preferences?.focus || "general overview";
    const commuteType = preferences?.commuteType || "driving";
    const customInstructions = preferences?.customInstructions || "";

    const lengthGuidelines = 
      targetDuration === "short" 
        ? "Keep it brief. Write an introduction, exactly 1-2 concise chapters with 200-300 characters each, and a short outro. Total length should be around 1-2 minutes of speech."
        : targetDuration === "long"
        ? "Deep dive. Write an introduction, 4-5 core chapters with 350-450 characters each, and an outro. Total length should be deep and rich, around 5-7 minutes of speech."
        : "Standard. Write an introduction, 2-3 core chapters with 300-400 characters each, and an outro. Total length should be around 3-4 minutes of speech.";

    let languageInstructions = "";
    if (language === "vi") {
      languageInstructions = `
LANGUAGE RULE: The entire report MUST be generated in VIETNAMESE (Tiếng Việt).
- Provide warm greetings, friendly transitions, and professional sign-offs in natural, elegant, standard spoken Vietnamese.
- For English technical acronyms or terms, explain them naturally in Vietnamese or spell out how they are pronounced if necessary.
- Ensure titles, topics, scriptText, summaryBullets, and conclusion are 100% in Vietnamese.`;
    } else if (language === "bilingual") {
      languageInstructions = `
LANGUAGE RULE: The entire report MUST be written in a graceful, engaging BILINGUAL (English / Vietnamese) format.
- This is for language learners and international travelers on their commute.
- In 'introduction', 'scriptText' of each chapter, and 'conclusion', every main concept or sentence should first be spoken in English and then immediately followed by its friendly, natural translation in Vietnamese (for example: "Good morning dynamic commuters! / Chào buổi sáng quý thính giả năng động! Today we look at green energy... / Hôm nay chúng ta sẽ tìm hiểu về năng lượng xanh...").
- Keep the alternating flow extremely smooth and natural.
- Each chapter's 'topic' and the 'title' should use bilingual slash formatting (e.g. "Tech Breakthroughs / Những đột phá Công nghệ" or "Space Discovery / Khám phá Không gian").
- The 'summaryBullets' list items should also be presented in bilingual pairs (e.g. "Quantum chip uses 40 percent less power. / Chip lượng tử sử dụng ít năng lượng hơn 40 phần trăm.").`;
    } else {
      languageInstructions = `
LANGUAGE RULE: The entire report MUST be generated in ENGLISH.
- Maintain native, polished English phrasing throughout all fields.`;
    }

    const systemPrompt = `You are a professional broadcast radio host, podcast producer, or personal briefing anchor. 
Your goal is to digest the provided text of raw news articles, clean up the formatting, remove any noisy HTML/ad boilerplate, and organize it into a highly compelling speaker script for a personal daily briefing. 

${languageInstructions}

IMPORTANT GUIDELINES:
1. The script fields MUST be written EXACTLY as they should be spoken out loud. 
2. NEVER include markdown code formatting like bullet points (*, -), double asterisks (**), hashtags, or brackets inside the introduction, text, or conclusion fields. Spell out metrics and symbols if necessary (e.g., use "and" instead of "&", "dollars" instead of "$", "percent" instead of "%" where appropriate so TTS reads it elegantly). Also spell out numbers where it would improve TTS pronounciation.
3. Ensure natural transitions between chapters. Make it feel personal and modern depending on the chosen commute type (${commuteType}) and tone-styling (${tone}).
4. Customize the summaries according to user's specified focus constraint: "${focus}".
5. Apply length guidelines: ${lengthGuidelines}
6. Follow these specific instructions if provided by user: "${customInstructions}"`;

    const promptText = `Generate a news broadcast report from the following raw news materials:\n\n${content}`;

    const hasGroq = !!process.env.GROQ_API_KEY;
    let outputText = "";

    if (hasGroq) {
      console.log("[CommuteCast] Groq API setup detected! Routing text summarization to Llama 3.3...");
      const schemaPrompt = `
You must respond with a JSON object containing these keys exactly:
- "title" (string): A catchy report title
- "introduction" (string): A warm, speaker-ready welcome message. Keeps the user hooked.
- "chapters" (array): array of chapter objects. Each chapter must have:
    - "topic" (string): snappy chapter theme title
    - "scriptText" (string): continuous spoken script written only with read-out-loud standard phrasing. No asterisks, stars, blocks, or lists.
    - "summaryBullets" (array of strings): 2-3 short, punchy bullet points to display in the UI as visual takeaways.
- "conclusion" (string): A charming, friendly closing remark with safe-travel wishes suited for their commute.

Keep scriptText very natural for speaking. Do not include markdown bold or headers inside fields.`;
      outputText = await generateWithGroq(systemPrompt + "\n" + schemaPrompt, promptText, true);
    } else {
      console.log("[CommuteCast] GROQ_API_KEY not found. Using standard Gemini model for summarization.");
      const response = await callGeminiWithRotation((ai) => 
        ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: promptText,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { 
                  type: Type.STRING, 
                  description: "A catchy report title" 
                },
                introduction: { 
                  type: Type.STRING, 
                  description: "A warm, speaker-ready welcome message. Keeps the user hooked." 
                },
                chapters: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      topic: { 
                        type: Type.STRING, 
                        description: "Snappy chapter theme title" 
                      },
                      scriptText: { 
                        type: Type.STRING, 
                        description: "Continuous spoken script written only with read-out-loud standard phrasing. No asterisks, stars, blocks, or lists." 
                      },
                      summaryBullets: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description: "2-3 short, punchy, bullet points to display in the UI as visual takeaways."
                      }
                    },
                    required: ["topic", "scriptText", "summaryBullets"]
                  }
                },
                conclusion: { 
                  type: Type.STRING, 
                  description: "A charming, friendly closing remark with safe-travel wishes suited for their commute." 
                }
              },
              required: ["title", "introduction", "chapters", "conclusion"]
            }
          }
        })
      );
      outputText = response.text || "";
    }

    if (!outputText || outputText.trim() === "") {
      throw new Error("Empty response received from content generation model.");
    }

    const payload = JSON.parse(outputText);
    return res.json(payload);


  } catch (error: any) {
    console.error("Summarization error:", error);
    const friendlyError = parseGeminiError(error, isVi, false);
    return res.status(500).json({ error: friendlyError });
  }
});

// 2. API: Synthesize text into single-speaker audio using multi-tier TTS engines (1st Gemini, 2nd Google Cloud TTS, 3rd Edge TTS)
let gcloudTTSClientInstance: TextToSpeechClient | null = null;

function getGCloudTTSClient(): TextToSpeechClient | null {
  if (gcloudTTSClientInstance) return gcloudTTSClientInstance;

  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      gcloudTTSClientInstance = new TextToSpeechClient({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
      console.log("[TTS - Google Cloud] Initialized client with keyFilename.");
    } else if (process.env.GCS_PRIVATE_KEY && process.env.GCS_CLIENT_EMAIL) {
      const privateKey = process.env.GCS_PRIVATE_KEY.replace(/\\n/g, "\n");
      gcloudTTSClientInstance = new TextToSpeechClient({
        credentials: {
          client_email: process.env.GCS_CLIENT_EMAIL,
          private_key: privateKey,
        }
      });
      console.log("[TTS - Google Cloud] Initialized client with service account email/private key.");
    } else {
      // Find a Gemini API key to use as apiKey fallback if Google Cloud Speech is enabled with API keys
      const keys = getKeysList();
      const apiKey = keys.length > 0 ? keys[0] : undefined;
      if (apiKey) {
        gcloudTTSClientInstance = new TextToSpeechClient({ apiKey });
        console.log("[TTS - Google Cloud] Initialized client with Gemini/Google API Key.");
      } else {
        // Fallback to empty default constructor
        gcloudTTSClientInstance = new TextToSpeechClient();
        console.log("[TTS - Google Cloud] Initialized client with default credentials.");
      }
    }
    return gcloudTTSClientInstance;
  } catch (err: any) {
    console.error("[TTS - Google Cloud] Failed to initialize Google Cloud TextToSpeechClient:", err.message || err);
    return null;
  }
}

app.post("/api/tts", async (req, res): Promise<any> => {
  const { text, voice, tone } = req.body;
  const isVi = voice?.startsWith("vi-") || false;

  try {
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "No text provided for audio synthesis." });
    }

    // --- HÀM GỌI GEMINI TTS ---
    const callGeminiTTS = async (): Promise<string> => {
      let voiceName = voice || "Kore";
      const speedTone = tone || "conversational";
      let accentInstruction = "";

      if (voice === "vi-HN") {
        voiceName = "Kore";
        accentInstruction = "Speak this text with a highly precise standard Northern Vietnamese (Hanoi / Hà Nội) accent. Pronounce every syllable cleanly, in standard Northern broadcaster cadence.";
      } else if (voice === "vi-HCM") {
        voiceName = "Zephyr";
        accentInstruction = "Speak this text with a warm, natural Southern Vietnamese (Ho Chi Minh City / Sài Gòn) accent. Pronounce with Southern dialect cadence, friendly, sweet, and engaging.";
      } else if (voice === "en-UK") {
        voiceName = "Puck";
        accentInstruction = "Speak this text with a highly refined British English accent (Received Pronunciation - RP). Pronounce with clear, elegant British broadcaster cadence and superb pronunciation.";
      } else if (voice === "en-US") {
        voiceName = "Zephyr";
        accentInstruction = "Speak this text with a highly natural standard General American (GA) accent. Pronounce with premium American radio broadcast cadence, smooth and professional.";
      }

      const ttsPrompt = accentInstruction 
        ? `${accentInstruction} Speak with a warm, natural, ${speedTone} tone: ${text}`
        : `Speak with a warm, natural, ${speedTone} tone: ${text}`;

      const response = await callGeminiWithRotation((ai) => 
        ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: ttsPrompt }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            }
          }
        })
      );

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("No inline audio data found in TTS model response.");
      }
      return base64Audio;
    };

    // --- HÀM GỌI GOOGLE CLOUD TTS (DỰ PHÒNG CẤP 1) ---
    const callGoogleCloudTTS = async (): Promise<string> => {
      const client = getGCloudTTSClient();
      if (!client) {
        throw new Error("Google Cloud Text-to-Speech client is not initialized.");
      }

      const voiceMap: Record<string, { languageCode: string; name: string; fallbackName: string }> = {
        "vi-HN": { languageCode: "vi-VN", name: "vi-VN-Wavenet-B", fallbackName: "vi-VN-Standard-B" },
        "vi-HCM": { languageCode: "vi-VN", name: "vi-VN-Wavenet-A", fallbackName: "vi-VN-Standard-A" },
        "en-US": { languageCode: "en-US", name: "en-US-Neural2-F", fallbackName: "en-US-Standard-C" },
        "en-UK": { languageCode: "en-GB", name: "en-GB-Wavenet-A", fallbackName: "en-GB-Standard-A" },
      };

      const requestedVoice = voiceMap[voice] || { languageCode: "en-US", name: "en-US-Neural2-F", fallbackName: "en-US-Standard-C" };
      let speakingRate = 1.0;
      if (tone === "fast") speakingRate = 1.15;
      else if (tone === "slow") speakingRate = 0.85;

      try {
        console.log(`[TTS - Google Cloud] Synthesizing with main voice: ${requestedVoice.name}`);
        const [response] = await client.synthesizeSpeech({
          input: { text },
          voice: { languageCode: requestedVoice.languageCode, name: requestedVoice.name },
          audioConfig: { audioEncoding: "MP3" as const, speakingRate, pitch: 0 },
        });

        if (response.audioContent) {
          return Buffer.from(response.audioContent as Uint8Array).toString("base64");
        }
        throw new Error("Empty audio content from Google Cloud main voice.");
      } catch (mainVoiceErr: any) {
        console.warn(`[TTS - Google Cloud] Main voice failed: ${mainVoiceErr.message || mainVoiceErr}. Trying fallback voice: ${requestedVoice.fallbackName}`);
        
        const [response] = await client.synthesizeSpeech({
          input: { text },
          voice: { languageCode: requestedVoice.languageCode, name: requestedVoice.fallbackName },
          audioConfig: { audioEncoding: "MP3" as const, speakingRate, pitch: 0 },
        });

        if (response.audioContent) {
          return Buffer.from(response.audioContent as Uint8Array).toString("base64");
        }
        throw new Error("Empty audio content from fallback Google Cloud voice.");
      }
    };

    // --- HÀM GỌI EDGE TTS (DỰ PHÒNG CẤP 2) ---
    const callEdgeTTS = async (): Promise<string> => {
      const voiceMap: Record<string, string> = {
        "vi-HN": "vi-VN-HoangMinhNeural",
        "vi-HCM": "vi-VN-NamMinhNeural",
        "en-US": "en-US-AriaNeural",
        "en-UK": "en-GB-SoniaNeural",
      };
      const edgeVoice = voiceMap[voice] || "en-US-AriaNeural";

      let rate = "0%";
      if (tone === "fast") rate = "+15%";
      else if (tone === "slow") rate = "-15%";

      try {
        console.log(`[Edge TTS] Trying Edge TTS synthesis for ${edgeVoice} with text length: ${text.length}`);
        
        // Method A: Check default / original export ttsFn
        const ttsFn = typeof edgeTTS.tts === "function" 
          ? edgeTTS.tts 
          : ((edgeTTS as any).default?.tts || (edgeTTS as any).default || edgeTTS);

        if (typeof ttsFn === "function") {
          const audioBuffer = await ttsFn(text, {
            voice: edgeVoice,
            rate: rate,
            pitch: "0%"
          });
          if (audioBuffer && audioBuffer.length > 0) {
            console.log(`[Edge TTS] Method A succeeded. Buffer size: ${audioBuffer.length} bytes.`);
            return audioBuffer.toString("base64");
          }
        }

        // Method B: Fallback to .synthesize as streaming format if .synthesize exists
        const ttsInstance = (edgeTTS as any).default || edgeTTS;
        if (ttsInstance && typeof ttsInstance.synthesize === "function") {
          console.log(`[Edge TTS] Method A did not return a valid buffer, trying Method B (streaming synthesize)...`);
          const audioStream = await ttsInstance.synthesize(text, edgeVoice, { rate, pitch: "0%" });
          const chunks: Buffer[] = [];
          for await (const chunk of audioStream) {
            chunks.push(chunk);
          }
          const audioBuffer = Buffer.concat(chunks);
          if (audioBuffer && audioBuffer.length > 0) {
            console.log(`[Edge TTS] Method B succeeded. Buffer size: ${audioBuffer.length} bytes.`);
            return audioBuffer.toString("base64");
          }
        }

        throw new Error("No edge-tts synthesis method succeeded.");
      } catch (err: any) {
        console.error(`[Edge TTS] Edge TTS failed completely:`, err.message || err);
        throw new Error(`Edge TTS failed: ${err.message || err}`);
      }
    };

    // --- CHẠY TUẦN TỰ: Gemini -> Google Cloud TTS -> Edge TTS ---
    let base64Audio = "";
    let geminiErrLog = "";
    let gcloudErrLog = "";

    // 1. Thử Gemini TTS
    try {
      console.log(`[TTS] [Engine 1] Attempting Gemini TTS for voice: ${voice || "default"}`);
      base64Audio = await callGeminiTTS();
      console.log(`[TTS] Gemini TTS succeeded.`);
      return res.json({ base64Audio });
    } catch (geminiError: any) {
      geminiErrLog = geminiError.message || String(geminiError);
      console.warn(`[TTS] [Engine 1] Gemini TTS failed with error: ${geminiErrLog}. Moving to Google Cloud TTS...`);
    }

    // 2. Thử Google Cloud TTS
    try {
      console.log(`[TTS] [Engine 2] Attempting Google Cloud TTS fallback...`);
      base64Audio = await callGoogleCloudTTS();
      console.log(`[TTS] Google Cloud TTS succeeded.`);
      return res.json({ base64Audio });
    } catch (gcloudError: any) {
      gcloudErrLog = gcloudError.message || String(gcloudError);
      console.warn(`[TTS] [Engine 2] Google Cloud TTS failed with error: ${gcloudErrLog}. Moving to Edge TTS...`);
    }

    // 3. Thử Edge TTS
    try {
      console.log(`[TTS] [Engine 3] Attempting Edge TTS fallback...`);
      base64Audio = await callEdgeTTS();
      console.log(`[TTS] Edge TTS fallback succeeded.`);
      return res.json({ base64Audio });
    } catch (edgeError: any) {
      const edgeErrLog = edgeError.message || String(edgeError);
      console.error(`[TTS] All 3 Speech synthesizers failed.`);
      throw new Error(
        `All TTS engines failed:\n` +
        `- Gemini TTS: ${geminiErrLog}\n` +
        `- Google Cloud TTS: ${gcloudErrLog}\n` +
        `- Edge TTS: ${edgeErrLog}`
      );
    }

  } catch (error: any) {
    console.error("TTS Synthesis error:", error);
    const friendlyError = parseGeminiError(error, isVi, true);
    return res.status(500).json({ error: friendlyError });
  }
});

// 3. API: Generate fresh news articles based on selected category & language
app.post("/api/generate-news", async (req, res): Promise<any> => {
  const { category, language } = req.body;
  const isVi = language === "vi" || language === "bilingual";

  try {
    if (!category) {
      return res.status(400).json({ error: "Category is required." });
    }

    let prompt = "";
    if (language === "vi" || language === "bilingual") {
      prompt = `Hãy viết một bài báo/tin tức nóng hổi, thực tế, hấp dẫn và chi tiết về lĩnh vực "${category}" bằng Tiếng Việt.
Tin tức cần có tiêu đề rõ ràng (ví dụ: "[Tiêu đề]: nội dung..."), chứa khoảng 2-3 thông tin/sự kiện nổi bật khác nhau mang tính thời sự cao.
Độ dài khoảng 300-400 từ. Hãy viết trực tiếp nội dung bài viết, không thêm lời chào hay ghi chú ngoài lề.`;
    } else {
      prompt = `Write a realistic, engaging, and detailed news article or report about the field "${category}" in English.
It should have a clear title (e.g., "[Title]: content..."), contain 2-3 fresh breaking events or interesting analysis.
Length: roughly 300-400 words. Write the article content directly, with no extra conversational preambles or notes.`;
    }

    const hasGroq = !!process.env.GROQ_API_KEY;
    let newsText = "";

    if (hasGroq) {
      console.log("[CommuteCast] Groq API setup detected for News Generation. Running Llama 3.3...");
      newsText = await generateWithGroq(
        "You are an expert news writer assistant that outputs highly engaging local news articles/materials exactly as requested.",
        prompt,
        false
      );
    } else {
      console.log("[CommuteCast] Using Gemini API for news generation.");
      const response = await callGeminiWithRotation((ai) => 
        ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
        })
      );
      newsText = response.text || "";
    }

    if (!newsText) {
      throw new Error("No text generated by content generation model.");
    }

    return res.json({ newsText });
  } catch (error: any) {
    console.error("News Generation error:", error);
    const friendlyError = parseGeminiError(error, isVi, false);
    return res.status(500).json({ error: friendlyError });
  }
});

// 4. API: Voice Query & Knowledge Search
app.post("/api/voice-query", async (req, res): Promise<any> => {
  const { text, language } = req.body;
  const isVi = language === "vi" || language === "vi-VN" || language === "bilingual";

  try {
    if (!text || text.trim() === "") {
      return res.status(400).json({ error: "No text provided." });
    }

    const systemPrompt = `
You are a helpful broadcast assistant that processes voice commands and queries. 
The user is talking to a smart news radio application. They spoke a query or made a statement.
Determine if the user is asking for information (a query/question) or just making a simple statement.

CRITICAL LANGUAGE REQUIREMENT:
You MUST output your response in the EXACT same language as the user's spoken input.
- If the user speaks/asks in Vietnamese (or if the input contains Vietnamese characters, diacritics, or looks like Vietnamese), your complete answer MUST be in high-quality, fluent, natural Vietnamese (Tiếng Việt standard). Under NO circumstances should you return an English or Chinese (Chữ Hán, "是在", etc.) answer or mix random foreign words for a Vietnamese query! This is extremely important to the user.
- If the user speaks/asks in English, write the answer in English.
- Avoid introducing any raw foreign/machine-translated phrases. Ensure 100% human-like phrasing. Do NOT use literal translations, Chinese helper verbs, or transliterated characters.

If it is a query/question (e.g., asking about weather, tech, news, details about anything, or requesting a summary/explanation of some topics), use Google Search grounding results to provide an engaging, clear, concise, and highly accurate answer. Keep the answer brief and natural to read out loud (max 3-4 sentences), written in high-quality spoken phrasing.
If it is not a query/question (e.g., a greeting, a simple statement, empty or random words), indicate it is not a query (isQuery: false) and give a simple friendly closing/greeting reply in the same language.

Your response must be a JSON object with the following structure:
{
  "isQuery": boolean, // true if user asks a question or requests info
  "answer": string    // accurate concise answer derived from search results, or friendly statement response
}
`;

    const userPrompt = `User said: "${text}"`;

    const hasGroq = !!process.env.GROQ_API_KEY;
    let result: { isQuery: boolean; answer: string; sources?: Array<{ title: string; uri: string }> };

    try {
      const response = await callGeminiWithRotation((ai) =>
        ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents: userPrompt,
          config: {
            systemInstruction: systemPrompt,
            tools: [{ googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isQuery: { type: Type.BOOLEAN },
                answer: { type: Type.STRING }
              },
              required: ["isQuery", "answer"]
            }
          }
        })
      );
      
      const parsed = JSON.parse(response.text || '{"isQuery": false, "answer": ""}');
      
      // Extract Google Search Grounding sources
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const sourcesList = chunks
        .map((c: any) => c.web)
        .filter((w: any) => w && w.uri)
        .map((w: any) => ({
          title: w.title || w.uri,
          uri: w.uri
        }));

      // Remove duplicate sources
      const uniqueSources = sourcesList.filter((src: any, idx: number, self: any[]) =>
        self.findIndex((s) => s.uri === src.uri) === idx
      );

      result = {
        isQuery: !!parsed.isQuery,
        answer: parsed.answer || "",
        sources: uniqueSources
      };
    } catch (geminiError: any) {
      console.error("[Voice Query] Gemini rotation failed. Attempting fallback if possible:", geminiError);
      
      if (hasGroq) {
        try {
          console.log("[Voice Query] Routing fallback to Groq...");
          const groqResponse = await generateWithGroq(systemPrompt, userPrompt, true);
          const parsed = JSON.parse(groqResponse || '{"isQuery": false, "answer": ""}');
          result = {
            isQuery: !!parsed.isQuery,
            answer: parsed.answer || "",
            sources: []
          };
        } catch (groqError: any) {
          console.error("[Voice Query] Groq fallback also failed:", groqError);
          const friendlyError = parseGeminiError(geminiError, isVi, false);
          return res.status(500).json({ error: friendlyError });
        }
      } else {
        const friendlyError = parseGeminiError(geminiError, isVi, false);
        return res.status(500).json({ error: friendlyError });
      }
    }

    return res.json(result);
  } catch (error: any) {
    console.error("Voice Query error:", error);
    const isVi = language === "vi" || language === "vi-VN" || language === "bilingual";
    const friendlyError = parseGeminiError(error, isVi, false);
    return res.status(500).json({ error: friendlyError });
  }
});

// --- PODCAST AND GOOGLE CLOUD STORAGE INTEGRATION ---

const PODCASTS_JSON_PATH = path.join(process.cwd(), "published-podcasts.json");
const LOCAL_AUDIO_DIR = path.join(process.cwd(), "local_podcasts");

if (!fs.existsSync(LOCAL_AUDIO_DIR)) {
  fs.mkdirSync(LOCAL_AUDIO_DIR, { recursive: true });
}

interface PublishedEpisode {
  id: string;
  title: string;
  description: string;
  pubDate: string;
  audioUrl: string;
  duration: number;
}

let cachedEpisodesInMem: PublishedEpisode[] | null = null;
let syncLoadedFromSupabase = false;

async function loadPublishedEpisodesFromSupabaseAsync(): Promise<PublishedEpisode[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.storage
      .from("podcast-audio")
      .download("metadata/published-podcasts.json");
    if (!error && data) {
      const text = await data.text();
      const eps = JSON.parse(text);
      if (Array.isArray(eps)) {
        console.log("[Podcast - Supabase] Successfully fetched published episodes from Supabase Storage.");
        try {
          fs.writeFileSync(PODCASTS_JSON_PATH, JSON.stringify(eps, null, 2), "utf8");
        } catch (localWriteErr) {
          // ignore
        }
        cachedEpisodesInMem = eps;
        return eps;
      }
    } else if (error) {
      console.log("[Podcast - Supabase] Fetch metadata warning (might be first run / bucket empty):", error.message || error);
    }
  } catch (err: any) {
    console.error("[Podcast - Supabase] Failed to download metadata from Supabase:", err.message || err);
  }
  return [];
}

async function savePublishedEpisodesToSupabaseAsync(episodes: PublishedEpisode[]) {
  const supabase = getSupabaseClient();
  if (!supabase) return;
  try {
    const jsonStr = JSON.stringify(episodes, null, 2);
    const fileBuffer = Buffer.from(jsonStr, "utf8");
    
    console.log("[Podcast - Supabase] Uploading fresh metadata to Supabase Storage...");
    const { error } = await supabase.storage
      .from("podcast-audio")
      .upload("metadata/published-podcasts.json", fileBuffer, {
        contentType: "application/json",
        upsert: true,
      });

    if (error) {
      console.error("[Podcast - Supabase] Failed to upload metadata to Supabase Storage:", error.message || error);
    } else {
      console.log("[Podcast - Supabase] Metadata synchronized to Supabase Cloud Storage.");
    }
  } catch (err: any) {
    console.error("[Podcast - Supabase] Unexpected error uploading metadata:", err.message || err);
  }
}

function loadPublishedEpisodes(): PublishedEpisode[] {
  if (cachedEpisodesInMem) {
    return cachedEpisodesInMem;
  }
  
  let localEps: PublishedEpisode[] = [];
  try {
    if (fs.existsSync(PODCASTS_JSON_PATH)) {
      const data = fs.readFileSync(PODCASTS_JSON_PATH, "utf8");
      localEps = JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to load local published episodes:", err);
  }

  if (!syncLoadedFromSupabase) {
    syncLoadedFromSupabase = true;
    loadPublishedEpisodesFromSupabaseAsync().then((cloudEps) => {
      if (cloudEps && cloudEps.length > 0) {
        cachedEpisodesInMem = cloudEps;
      }
    });
  }

  return localEps.length > 0 ? localEps : (cachedEpisodesInMem || []);
}

function savePublishedEpisodes(episodes: PublishedEpisode[]) {
  cachedEpisodesInMem = episodes;
  try {
    fs.writeFileSync(PODCASTS_JSON_PATH, JSON.stringify(episodes, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to save published episodes locally:", err);
  }
  savePublishedEpisodesToSupabaseAsync(episodes);
}

// Lazy GCS client initializer & helper
let gcsClientInstance: Storage | null = null;

function getGcsClient(): Storage | null {
  if (gcsClientInstance) return gcsClientInstance;
  
  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    return null;
  }

  try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS && fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
      gcsClientInstance = new Storage({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS });
    } else if (process.env.GCS_PRIVATE_KEY && process.env.GCS_CLIENT_EMAIL) {
      const privateKey = process.env.GCS_PRIVATE_KEY.replace(/\\n/g, "\n");
      gcsClientInstance = new Storage({
        credentials: {
          client_email: process.env.GCS_CLIENT_EMAIL,
          private_key: privateKey,
        }
      });
    } else {
      // Avoid calling new Storage() with NO credentials – which triggers failing Gaxios metadata calls
      console.log("[Podcast - GCS] No valid client keys discovered in env. Disabling active GCS module initialization.");
      return null;
    }
  } catch (err) {
    console.error("[Podcast - GCS] Failed to bootstrap Storage client:", err);
  }

  return gcsClientInstance;
}

// Lazy Supabase client initializer
let supabaseClientInstance: any = null;

function getSupabaseClient() {
  if (supabaseClientInstance) return supabaseClientInstance;

  let url = (process.env.SUPABASE_URL || "https://omcuhthpeenwlzdwzlra.supabase.co").trim();
  const key = (process.env.SUPABASE_ANON_KEY || "sb_publishable_jYhv4P78VyLfdsAEa70Mlw_T3vzR6Ez").trim();

  // If the user inadvertently provided a Supabase web dashboard project URL instead of the REST API URL, auto-resolve it
  if (url.includes("supabase.com/dashboard/project/")) {
    const parts = url.split("supabase.com/dashboard/project/");
    if (parts[1]) {
      const projectRef = parts[1].split("/")[0];
      if (projectRef) {
        url = `https://${projectRef}.supabase.co`;
        console.log(`[Podcast - Supabase] Auto-resolved dashboard URL configuration to REST/Storage API gateway: ${url}`);
      }
    }
  }

  if (!url || !key) {
    console.log("[Podcast - Supabase] Crucial parameters SUPABASE_URL or SUPABASE_ANON_KEY missing.");
    return null;
  }

  try {
    supabaseClientInstance = createClient(url, key, {
      auth: {
        persistSession: false
      }
    });
    console.log(`[Podcast - Supabase] Initialized Supabase client successfully with URL: ${url}`);
  } catch (err) {
    console.error("[Podcast - Supabase] Failed to bootstrap Supabase client:", err);
  }

  return supabaseClientInstance;
}

// Hàm upload audio lên Supabase
async function uploadAudioToSupabase(
  audioBuffer: Buffer,
  fileName: string
): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client not configured or initialized.");
  }

  // Create unique filename mapping
  const uniqueFileName = `audio/${uuidv4()}-${fileName}.mp3`;
  console.log(`[Supabase] Uploading audio binary to bucket "podcast-audio": ${uniqueFileName}`);

  const { data, error } = await supabase.storage
    .from("podcast-audio")
    .upload(uniqueFileName, audioBuffer, {
      contentType: "audio/mpeg",
      cacheControl: "3600",
      upsert: false
    });

  if (error) {
    console.error("[Supabase] Upload error detail:", error);
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Retrieve public URL
  const { data: publicUrlData } = supabase.storage
    .from("podcast-audio")
    .getPublicUrl(uniqueFileName);

  if (!publicUrlData || !publicUrlData.publicUrl) {
    throw new Error("Failed to capture public URL from Supabase Storage.");
  }

  console.log(`[Supabase] Success! Public url generated: ${publicUrlData.publicUrl}`);
  return publicUrlData.publicUrl;
}

// Serve local podcast audio files when GCS is off (with full 206 Partial Content Range streaming support)
app.get("/api/local-podcasts/:filename", (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(LOCAL_AUDIO_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Local podcast audio file not found.");
  }

  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res.status(416).set({
          "Content-Range": `bytes */${fileSize}`
        }).send("Requested range not satisfiable\n");
        return;
      }

      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "audio/mpeg",
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "audio/mpeg",
        "Accept-Ranges": "bytes",
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err: any) {
    console.error("Error streaming local podcast:", err);
    if (!res.headersSent) {
      res.status(500).send("Internal server error during media stream.");
    }
  }
});

// API: Get published episodes
app.get("/api/podcast/episodes", (req, res) => {
  try {
    const episodes = loadPublishedEpisodes();
    res.json(episodes);
  } catch (err: any) {
    console.error("Failed to fetch published episodes:", err);
    res.status(500).json({ error: err.message || "Failed to load episodes" });
  }
});

// API: Publish new podcast episode
app.post("/api/podcast/publish", async (req, res): Promise<any> => {
  try {
    const { briefId, briefing } = req.body;
    if (!briefing || !briefing.audioChunks || briefing.audioChunks.length === 0) {
      return res.status(400).json({ error: "No compiled briefing audio chunks provided for publishing." });
    }

    const episodes = loadPublishedEpisodes();
    // Check if duplicate already exists
    const existing = episodes.find(ep => ep.id === briefId);
    if (existing) {
      return res.json({
        success: true,
        audioUrl: existing.audioUrl,
        message: "This episode is already published!"
      });
    }

    // Merge base64 audio chunks into a physical binary Buffer
    const fullAudioBase64 = briefing.audioChunks.join("");
    const audioBuffer = Buffer.from(fullAudioBase64, "base64");

    const sanitizedTitle = briefing.payload?.title 
      ? briefing.payload.title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()
      : "podcast";
    const uniqueId = uuidv4();
    const filename = `${uniqueId}_${sanitizedTitle}.mp3`;

    let finalAudioUrl = "";
    let uploadedToSupabase = false;
    let supabaseErrorMsg = "";

    // 1st Priority: Try Supabase Upload
    try {
      finalAudioUrl = await uploadAudioToSupabase(audioBuffer, sanitizedTitle);
      uploadedToSupabase = true;
    } catch (sbErr: any) {
      supabaseErrorMsg = sbErr.message || String(sbErr);
      console.warn("[Podcast - Supabase] Supabase upload failed, trying GCS fallback:", sbErr.message || sbErr);
    }

    // 2nd Priority Fallback: Try GCS Upload
    if (!uploadedToSupabase) {
      const gcs = getGcsClient();
      const bucketName = process.env.GCS_BUCKET_NAME;

      if (gcs && bucketName) {
        try {
          console.log(`[Podcast - GCS] Fallback active. Uploading to GCS: ${filename}...`);
          const bucket = gcs.bucket(bucketName);
          const file = bucket.file(`audio/${filename}`);

          await file.save(audioBuffer, {
            metadata: {
              contentType: "audio/mpeg",
            }
          });

          const publicUrlPrefix = process.env.CLOUD_STORAGE_PUBLIC_URL || "https://storage.googleapis.com";
          finalAudioUrl = `${publicUrlPrefix}/${bucketName}/audio/${filename}`;
          console.log(`[Podcast - GCS] Fallback uploaded! Public URL: ${finalAudioUrl}`);
          uploadedToSupabase = true; // mapped for generic flow
        } catch (gcsErr) {
          console.error("[Podcast - GCS] GCS fallback failed as well:", gcsErr);
        }
      }
    }

    // 3rd Priority Emergency: Local server fallback
    if (!finalAudioUrl) {
      console.log(`[Podcast] GCS & Supabase offline. Writing file locally as emergency backup...`);
      const localPath = path.join(LOCAL_AUDIO_DIR, filename);
      fs.writeFileSync(localPath, audioBuffer);
      const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      finalAudioUrl = `${appUrl}/api/local-podcasts/${filename}`;
    }

    // Calculate duration in seconds (rough estimate: each chunk is ~0.5s speech, or minimum of 30)
    let calculatedDuration = 120;
    if (briefing.audioChunks && briefing.audioChunks.length > 0) {
      calculatedDuration = Math.max(30, Math.floor(briefing.audioChunks.length * 0.45));
    }

    const newEpisode: PublishedEpisode = {
      id: briefId,
      title: briefing.payload?.title || "Bản tin không tên",
      description: (briefing.payload?.introduction || "Bản tin phát thanh CommuteCast").substring(0, 400) + "...",
      pubDate: briefing.timestamp || new Date().toISOString(),
      audioUrl: finalAudioUrl,
      duration: calculatedDuration
    };

    episodes.unshift(newEpisode);
    savePublishedEpisodes(episodes);

    return res.json({
      success: true,
      audioUrl: finalAudioUrl,
      storageType: uploadedToSupabase ? "supabase" : "local",
      supabaseError: supabaseErrorMsg || undefined,
      message: "Podcast published successfully!"
    });
  } catch (err: any) {
    console.error("Publish podcast error:", err);
    res.status(500).json({ error: err.message || "Failed to publish podcast episode" });
  }
});

// API: Delete published podcast episode
app.delete("/api/podcast/episodes/:id", async (req, res): Promise<any> => {
  try {
    const { id } = req.params;
    const episodes = loadPublishedEpisodes();
    const index = episodes.findIndex(ep => ep.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Podcast episode not found." });
    }

    const targetEpisode = episodes[index];
    const urlParts = targetEpisode.audioUrl.split("/");
    const filename = urlParts[urlParts.length - 1];

    if (targetEpisode.audioUrl.includes("/api/local-podcasts/")) {
      // Delete from local disk
      const localPath = path.join(LOCAL_AUDIO_DIR, filename);
      if (fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
          console.log(`[Podcast] Deleted local file: ${localPath}`);
        } catch (fErr) {
          console.error("Error deleting local file:", fErr);
        }
      }
    } else if (targetEpisode.audioUrl.includes("supabase.co") || targetEpisode.audioUrl.includes("podcast-audio")) {
      // Delete from Supabase Storage
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          console.log(`[Podcast - Supabase] Attempting file removal from storage bucket: audio/${filename}`);
          // Extract file path inside the bucket, which lies after 'podcast-audio/'
          let storagePath = `audio/${filename}`;
          if (targetEpisode.audioUrl.includes("/podcast-audio/")) {
            const splitKey = "/podcast-audio/";
            const remaining = targetEpisode.audioUrl.substring(targetEpisode.audioUrl.indexOf(splitKey) + splitKey.length);
            if (remaining) {
              storagePath = decodeURIComponent(remaining);
            }
          }
          
          const { error } = await supabase.storage
            .from("podcast-audio")
            .remove([storagePath]);

          if (error) {
            console.warn("[Supabase] Delete warning:", error.message || error);
          } else {
            console.log(`[Podcast - Supabase] Successfully removed file from buckets: ${storagePath}`);
          }
        } catch (sbDelErr) {
          console.error("Error deleting file from Supabase storage:", sbDelErr);
        }
      }
    } else {
      // Fallback GCS removal
      const gcs = getGcsClient();
      const bucketName = process.env.GCS_BUCKET_NAME;
      if (gcs && bucketName) {
        try {
          const bucket = gcs.bucket(bucketName);
          const file = bucket.file(`audio/${filename}`);
          const [exists] = await file.exists();
          if (exists) {
            await file.delete();
            console.log(`[Podcast - GCS] Deleted GCS object: audio/${filename}`);
          }
        } catch (gcsDelErr) {
          console.error("Error deleting file from GCS:", gcsDelErr);
        }
      }
    }

    // Remove from memory state & update index file
    episodes.splice(index, 1);
    savePublishedEpisodes(episodes);

    return res.json({ success: true, message: "Episode deleted successfully" });
  } catch (err: any) {
    console.error("Failed to delete episode:", err);
    res.status(500).json({ error: err.message || "Failed to delete episode" });
  }
});

// ===== HELPERS FOR RSS FEED =====

// Định dạng ngày tháng theo chuẩn RFC 822 cho RSS
function formatRFC822(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[date.getUTCDay()]}, ${String(date.getUTCDate()).padStart(2, '0')} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} GMT`;
}

// Ước lượng thời lượng dựa trên số ký tự (mỗi 100 ký tự ~ 30 giây)
function estimateDuration(text: string): number {
  if (!text) return 30;
  const charCount = text.length;
  // Giả định: 100 ký tự ~ 30 giây đọc
  const seconds = Math.max(30, Math.floor(charCount / 100) * 30);
  return Math.min(seconds, 3600); // Tối đa 1 giờ
}

// API: Generate RSS Feed XML complying with iTunes Podcast spec
app.get("/api/podcast/feed", async (req, res): Promise<any> => {
  try {
    const episodes = loadPublishedEpisodes();
    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;

    // Nếu chưa có episode, tạo feed rỗng nhưng hợp lệ
    if (episodes.length === 0) {
      console.log("[RSS] No episodes found, generating empty feed.");
    }

    const rssItems = episodes.map((ep) => {
      // Sửa pubDate: định dạng đúng RFC 822
      let pubDateStr = "";
      try {
        const pubDate = new Date(ep.pubDate);
        if (!isNaN(pubDate.getTime())) {
          pubDateStr = formatRFC822(pubDate);
        } else {
          // Nếu không parse được, dùng thời gian hiện tại
          pubDateStr = formatRFC822(new Date());
        }
      } catch (e) {
        pubDateStr = formatRFC822(new Date());
      }

      // Tính duration từ description (ước lượng)
      const duration = estimateDuration(ep.description);

      return {
        title: [ep.title],
        description: [ep.description],
        pubDate: [pubDateStr],
        enclosure: {
          $: {
            url: ep.audioUrl,
            length: "0",
            type: "audio/mpeg"
          }
        },
        guid: [ep.audioUrl],
        "itunes:duration": [String(duration)],
        "itunes:image": {
          $: {
            href: `${appUrl}/icon-512.jpg`
          }
        },
        "itunes:explicit": ["false"]
      };
    });

    const feedObj = {
      rss: {
        $: {
          version: "2.0",
          "xmlns:itunes": "http://www.itunes.com/dtds/podcast-1.0.dtd",
          "xmlns:content": "http://purl.org/rss/1.0/modules/content/"
        },
        channel: {
          title: ["CommuteCast - Bản tin phát thanh cá nhân"],
          description: ["Tạo và nghe bản tin phát thanh cá nhân hóa, đồng bộ hóa lộ trình thông tin thông minh mỗi ngày."],
          link: [appUrl],
          language: ["vi"],
          copyright: [`© ${new Date().getFullYear()} CommuteCast`],
          "itunes:author": ["CommuteCast Anchor"],
          "itunes:summary": ["Tạo và nghe bản tin phát thanh cá nhân hóa song ngữ Anh/Việt được dệt tự động từ tin tức của bạn."],
          "itunes:explicit": ["false"],
          "itunes:image": {
            $: {
              href: `${appUrl}/icon-512.jpg`
            }
          },
          "itunes:category": {
            $: {
              text: "Technology"
            }
          },
          item: rssItems
        }
      }
    };

    const builder = new xml2js.Builder({
      xmldec: { version: "1.0", encoding: "UTF-8" }
    });
    const xml = builder.buildObject(feedObj);

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    return res.send(xml);
  } catch (err: any) {
    console.error("RSS feed generation failed:", err);
    res.status(500).send("<error>Failed to generate RSS feed</error>");
  }
});

// API: Kiểm tra thời lượng thực tế của audio (optional)
app.head("/api/podcast/check-duration/:url", async (req, res) => {
  // Dùng để debug, có thể bỏ qua
  res.status(200).json({ message: "OK" });
});

// Serve frontend client
async function serveApp() {
  if (process.env.NODE_ENV !== "production") {
    // Vite Dev Middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production build serves the client assets
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[CommuteCast Backend] running on http://localhost:${PORT}`);
  });
}

serveApp();
