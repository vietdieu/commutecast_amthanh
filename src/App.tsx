import React, { useState, useEffect } from "react";
import { 
  AudioLines, 
  Settings2, 
  HelpCircle, 
  Sparkles, 
  FileText, 
  Volume2, 
  Info, 
  Flame, 
  Download, 
  Trash2, 
  History, 
  CheckCircle, 
  Compass, 
  Clock, 
  AlertCircle,
  RefreshCcw,
  BookOpen,
  Languages,
  ArrowRight,
  ExternalLink,
  Bell,
  BellRing,
  BellOff
} from "lucide-react";
import { SummaryPreferences, SavedSummary, SummaryPayload } from "./types";
import { SAMPLE_ARTICLES_PRESETS } from "./utils";
import ManualPcmPlayer from "./components/ManualPcmPlayer";

// Helper to construct fully qualified API URL on production
export const getApiUrl = (endpoint: string): string => {
  const envApiUrl = (import.meta as any).env?.VITE_API_URL;
  if (envApiUrl) {
    const base = envApiUrl.endsWith("/") ? envApiUrl.slice(0, -1) : envApiUrl;
    const formattedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${base}${formattedEndpoint}`;
  }
  return endpoint;
};

// Translation Dictionary for English and Vietnamese interface
const translations = {
  vi: {
    appTitle: "CommuteCast Song Ngữ",
    appSubtitle: "Chuyển Đổi Tin Tức Thành Bản Tin Phát Thanh Anh - Việt",
    statusBadge: "Đã Kết Nối Gemini 3.1 & 3.5",
    step1Title: "1. Nhập Nội Dung Tin Tức",
    step1Desc: "Dán báo hoặc dán văn bản thô để tổng xuất bản kịch bản song ngữ phát âm thành giọng độc thoại chuyên nghiệp.",
    placeholderText: "Dán nội dung bài báo, bản tin, thư gửi, đoạn văn thô... tại đây hằng ngày của bạn.",
    presetsLabel: "💡 Thêm nhanh văn bản tin tức mẫu có sẵn:",
    clearInput: "Xóa Hết",
    step2Title: "2. Cá Nhân Hóa Bản Tin Phát Thanh",
    labelDuration: "🎙️ Độ Dài Bản Tin",
    durShort: "Ngắn (~2p)",
    durMedium: "Vừa (~4p)",
    durLong: "Dài (~7p)",
    durDescShort: "Dành cho chuyến đi gấp 1-2 phút. Tóm lược nội dung cốt lõi nhanh gọn.",
    durDescMedium: "Phù hợp hành trình 3-4 phút trung bình. Tạp chí phát thanh cân đối.",
    durDescLong: "Deep-dives tin tức chi tiết 5-7 phút. Phân tích hóm hỉnh, sâu sắc.",
    labelCommute: "🚗 Phương Tiện Di Chuyển",
    commuteDriving: "🚗 Tự Lái Xe Hơi",
    commuteTransit: "🚇 Xe Buýt / Tàu Điện",
    commuteWalking: "🚶 Đi Bộ Đi Làm",
    commuteCycling: "🚲 Xe Đạp Đường Phố",
    commuteDesc: "Phát thanh viên tự điều chỉnh lời khuyên giao thông, tốc độ đọc và phong cách.",
    labelLanguage: "🌐 Chọn Ngôn Ngữ Phát Thanh",
    langEn: "🇺🇸 Tiếng Anh (English Only)",
    langVi: "🇻🇳 Tiếng Việt (Vietnamese)",
    langBilingual: "🔥 Song Ngữ Anh - Việt (Bilingual)",
    langDescEn: "Tạo văn bản và âm thanh nói hoàn toàn bằng tiếng Anh.",
    langDescVi: "Bản tin phát thanh 100% bằng tiếng Việt thuần túy.",
    langDescBilingual: "Thần kỳ! Mỗi câu nói sẽ được phát lần lượt bằng tiếng Anh rồi đến tiếng Việt, giúp bạn vừa cập nhật tin tức vừa luyện nghe tiếng Anh trên đường đi làm.",
    labelTone: "✨ Phong Cách Người Dẫn (Persona)",
    toneConversational: "🗣️ Trò Chuyện (Podcast Co-host)",
    toneInformative: "📰 Truyền Thống (Traditional News)",
    toneUpbeat: "🔥 Sôi Nổi (Morning DJ Show)",
    toneAnalytical: "🧠 Phân Tích (Critical Thinker)",
    toneWitty: "🎭 Hóm Hỉnh (Witty Companion)",
    labelVoice: "🗣️ Chọn Giọng Phát Thanh Viên",
    voiceSub: "Hệ thống giọng nói trí tuệ nhân tạo Gemini 3.1 TTS chất lượng cực đỉnh.",
    labelFocus: "🎯 Chủ Đề Trực Quan Muốn Tập Trung",
    placeholderFocus: "ví dụ: tập trung vào công nghệ xanh, bỏ qua các tin thể thao hành lang",
    labelSpecial: "⚠️ Lời Dặn Riêng Cho Phát Thanh Viên (Tùy chọn)",
    placeholderSpecial: "ví dụ: Chào buổi sáng bằng tên Minh, đọc chậm rãi dễ nghe...",
    btnGenerate: "Tạo Bản Tin Phát Thanh Cá Nhân",
    draftingTitle: "Đang Phác Thảo Bản Tin Bản Thảo...",
    synthesizingTitle: "Đang Tổng Hợp Bản Ghi Âm...",
    failedTitle: "Tiến Trình Tạo Bản Tin Thất Bại",
    btnReset: "Khôi Phục Cài Đặt",
    idleTitle: "Bàn Preview Bản Tin Âm Thanh",
    idleSub: "Dán nội dung tin tức thô hoặc nhấp chọn báo mẫu bên trái, tinh chỉnh cấu hình của bạn rồi nhấn nút Tạo Bản Tin!",
    historyTitle: "Lịch Sử Lộ Trình & Bản Tin Đã Lưu",
    historyEmpty: "Chưa có bản tin nào được tạo.",
    historyEmptySub: "Bản tin sau khi tạo thành công sẽ tự động lưu vào bộ nhớ trình duyệt để bạn có thể xem lại bất cứ lúc nào.",
    exportSuccess: "Xuất file WAV 24kHz thành công!",
    switchLangButton: "Switch to English",
    progressStep1: "Đang đọc các nguồn thông tin và biên dịch kịch bản phát thanh song ngữ chuyên nghiệp...",
    progressStep2: "Đang tổng hợp giọng nói trí tuệ nhân tạo m mượt cho bài viết...",
    generateNewsSectionTitle: "🤖 Trợ Lý Tạo Tin Tự Động",
    generateNewsSectionDesc: "Yêu cầu Gemini tạo nhanh một bài báo thời sự thực tế theo lĩnh vực bạn chọn để làm nguồn tin phát thanh.",
    labelSelectCategory: "Lĩnh vực bạn muốn tạo tin:",
    btnGenerateNews: "Tạo & Thêm bản tin",
    generatingNewsStatus: "Đang tạo tin...",
    catTech: "💻 Công nghệ & Trí tuệ nhân tạo (AI)",
    catFinance: "📈 Kinh doanh & Tài chính",
    catScience: "🚀 Khoa học & Vũ trụ",
    catHealth: "🏥 Y tế & Sức khỏe",
    catSports: "⚽ Thể thao & Giải trí",
    catClimate: "🌿 Môi trường & Năng lượng xanh",
    catLifestyle: "🎭 Văn hóa & Đời sống Thế giới",
    catEducation: "🏫 Giáo dục & Học đường",
    charCount: "Ký tự",
    wordCount: "Từ",
    dragToResize: "Kéo góc dưới bên phải để phóng to / thu nhỏ ô nhập",
    voiceSearchTitle: "🎤 Tìm Kiếm Bằng Giọng Nói & Trợ Lý",
    voiceSearchDesc: "Hỏi đáp kiến thức, tin tức mới bằng giọng nói (ví dụ: 'thời tiết hôm nay', 'xu hướng công nghệ năm nay'). Bạn có thể thêm trực tiếp kết quả vào bản tin phát thanh phát sóng.",
    btnStartListening: "Bắt đầu thu âm",
    btnListening: "Đang nghe... nói đi nào",
    btnAddToBriefing: "Thêm vào kịch bản bản tin",
    btnIgnoreQuery: "Hủy bỏ",
    voicePromptAnswerLabel: "💡 Câu trả lời từ trợ lý:",
    speechErrorNotFound: "Không hiểu giọng nói hoặc micro bị tắt.",
    speechNotSupported: "Trình duyệt chưa hỗ trợ ghi âm.",
    queryProcessing: "Đang suy nghĩ xử lý...",
    querySuccess: "Đã tìm kiếm thành công!",
    labelSpeechLanguage: "Ngôn ngữ nói của bạn:",
    speechLangVi: "Tiếng Việt (vi-VN)",
    speechLangEn: "Tiếng Anh (en-US)",
    notificationLabel: "Thông Báo",
    notificationGranted: "Đã Bật Báo Tin",
    notificationBlocked: "Tắt Thông Báo",
    notificationBtnEnable: "Bật Báo Tin Xong",
    notificationSuccessTitle: "🎙️ Bản tin dệt sóng hoàn tất!",
    notificationSuccessBody: "Bản tin cá nhân hóa của bạn đã sẵn sàng phát sóng. Bấm để nghe ngay!",
    notificationToastTitle: "🎙️ Đã Bật Thông Báo!",
    notificationToastBody: "Hệ thống sẽ báo cho bạn ngay khi dệt xong bản phát thanh mới nhất.",
    podcastTitle: "🎙️ Quản Trị Podcast & RSS Feed",
    podcastDesc: "RSS Feed URL: Chia sẻ hoặc nhập link này vào Spotify, Apple Podcasts để đăng ký tải tự động các tập tin phát thanh của bạn.",
    podcastSelectLabel: "-- Chọn bản tin trong lịch sử để xuất bản --",
    podcastBtnPublish: "Phát Hành Podcast",
    podcastBtnPublishing: "Đang Tải Lên GCS...",
    podcastListTitle: "Danh Sách Các Tập Đã Phát Hành",
    podcastEpisodeCount: "tập đã xuất bản",
    podcastNoEpisodes: "Chưa có tập podcast nào được xuất bản lên Cloud.",
    podcastDate: "Ngày đăng",
    podcastDuration: "Thời lượng",
    podcastDeleteConfirm: "Bạn có chắc chắn muốn gỡ bỏ tập này khỏi danh sách và podcast feed?",
    podcastDeleteBtn: "Xóa tập",
    podcastCopySuccess: "Đã sao chép link RSS Feed!"
  },
  en: {
    appTitle: "Bilingual CommuteCast",
    appSubtitle: "Convert News Into English - Vietnamese Commute Audio Broadcasts",
    statusBadge: "Gemini 3.1 & 3.5 Operational",
    step1Title: "1. Furnish Source News Materials",
    step1Desc: "Paste raw markdown reports, emails, or drafts to compile them into a seamless bilingual podcast script.",
    placeholderText: "Paste raw news articles, notes, newsletters, or website texts here...",
    presetsLabel: "💡 Quick Sample Article Presets:",
    clearInput: "Clear Input",
    step2Title: "2. Personalize Radio Broadcast Settings",
    labelDuration: "🎙️ Targeted Playback Length",
    durShort: "Short (~2m)",
    durMedium: "Medium (~4p)",
    durLong: "Long (~7p)",
    durDescShort: "Ideal for warm, quick summaries during short 1-2 min trips.",
    durDescMedium: "Balanced editorial broadcast, great for typical 3-4 min drives.",
    durDescLong: "In-depth investigative podcast, around 5-7 min long.",
    labelCommute: "🚗 Commute Commute Mode",
    commuteDriving: "🚗 Solitary Driving",
    commuteTransit: "🚇 Public Transit / Bus",
    commuteWalking: "🚶 Walking / Running",
    commuteCycling: "🚲 Cycling Mode",
    commuteDesc: "Host customizes safety warnings, greetings, and reading cadence.",
    labelLanguage: "🌐 Broadcast Output Language",
    langEn: "🇺🇸 English Only",
    langVi: "🇻🇳 Vietnamese (Tiếng Việt)",
    langBilingual: "🔥 Bilingual (English - Vietnamese)",
    langDescEn: "Synthesize script and spoken audio exclusively in English.",
    langDescVi: "Synthesize script and spoken audio 100% in Vietnamese.",
    langDescBilingual: "Magical! Every sentence is spoken first in English and immediately translated into Vietnamese. Maximize commute productivity while learning!",
    labelTone: "✨ Host Persona & Spoken Tone",
    toneConversational: "🗣️ Conversational (Friendly Podcast)",
    toneInformative: "📰 Informative (Traditional Anchor)",
    toneUpbeat: "🔥 Upbeat (Morning Radio DJ Show)",
    toneAnalytical: "🧠 Analytical (Critical Thinker)",
    toneWitty: "🎭 Witty (Playful Road Companion)",
    labelVoice: "🗣️ AI Sound Voice Selector",
    voiceSub: "Neural vocoder voices provided by Gemini 3.1 TTS model.",
    labelFocus: "🎯 Deep Dive focus / Accentuation",
    placeholderFocus: "e.g., focus on finance and technology, skip sports speculation",
    labelSpecial: "⚠️ Special Host Directives (Optional)",
    placeholderSpecial: "e.g., greet me by name Alex, speak with friendly pauses...",
    btnGenerate: "Generate Personalized Audio Commute Briefing",
    draftingTitle: "Drafting News Script...",
    synthesizingTitle: "Synthesizing Audio Channels...",
    failedTitle: "Briefing Pipeline Failed",
    btnReset: "Reset Configuration",
    idleTitle: "Audio Preview Desk",
    idleSub: "Paste some articles or pick samples on the left side, choose preferences, and hit compile to hear your custom commute radio host!",
    historyTitle: "Drive Chronicles & Saved Broadcasts",
    historyEmpty: "No previous briefings created yet.",
    historyEmptySub: "Generated travel audio tracks will persist here automatically.",
    exportSuccess: "WAV 24kHz file exported successfully!",
    switchLangButton: "Chuyển sang Tiếng Việt",
    progressStep1: "Reading sources and drafting professional bilingual broadcast script...",
    progressStep2: "Generating warm high-fidelity speech voiceover tracks...",
    generateNewsSectionTitle: "🤖 AI News Generator Assistant",
    generateNewsSectionDesc: "Ask Gemini to generate a fresh, realistic news article on your chosen topic to draft your commute show.",
    labelSelectCategory: "Select a news category to generate:",
    btnGenerateNews: "Generate & Add News",
    generatingNewsStatus: "Generating news...",
    catTech: "💻 Technology, AI & Gadgets",
    catFinance: "📈 Business & Global Finance",
    catScience: "🚀 Science & Space Exploration",
    catHealth: "🏥 Medicine, Health & Well-being",
    catSports: "⚽ Sports & Entertainment",
    catClimate: "🌿 Environment & Green Tech",
    catLifestyle: "🎭 Lifestyle, Art & World Culture",
    catEducation: "🏫 Education & Schooling",
    charCount: "Characters",
    wordCount: "Words",
    dragToResize: "Drag the bottom-right corner to expand/contract input area",
    voiceSearchTitle: "🎤 Voice Search & Smart Assistant",
    voiceSearchDesc: "Ask general knowledge or news questions verbally (e.g. 'tell me about black holes', 'latest trends in tech'). You can directly append response to your broadcast script.",
    btnStartListening: "Start Speaking",
    btnListening: "Listening... speak now",
    btnAddToBriefing: "Add to broadcast script",
    btnIgnoreQuery: "Dismiss",
    voicePromptAnswerLabel: "💡 Assistant's Answer:",
    speechErrorNotFound: "Speech not recognized or mic permissions disabled.",
    speechNotSupported: "Speech recognition not fully supported on this browser.",
    queryProcessing: "Thinking and processing...",
    querySuccess: "Query answered successfully!",
    labelSpeechLanguage: "Your speaking language:",
    speechLangVi: "Vietnamese (vi-VN)",
    speechLangEn: "English (en-US)",
    notificationLabel: "Notifications",
    notificationGranted: "Notifs Enabled",
    notificationBlocked: "Notifs Blocked",
    notificationBtnEnable: "Get Notified",
    notificationSuccessTitle: "🎙️ Broadcast synthesized!",
    notificationSuccessBody: "Your personalized commute radio show is ready. Tap to listen!",
    notificationToastTitle: "🎙️ CommuteCast Activated!",
    notificationToastBody: "You will be alerted immediately when your audio track finishes compile.",
    podcastTitle: "🎙️ Podcast Manager & RSS Feed",
    podcastDesc: "RSS Feed URL: Copy this feed link to subscribe on Spotify, Apple Podcasts, or other podcatchers.",
    podcastSelectLabel: "-- Select a briefing from history to publish --",
    podcastBtnPublish: "Publish Podcast",
    podcastBtnPublishing: "Uploading to GCS...",
    podcastListTitle: "Published Episodes List",
    podcastEpisodeCount: "episodes published",
    podcastNoEpisodes: "No podcast episodes published to the cloud yet.",
    podcastDate: "Published on",
    podcastDuration: "Duration",
    podcastDeleteConfirm: "Are you sure you want to delete this episode from GCS and RSS Feed?",
    podcastDeleteBtn: "Delete",
    podcastCopySuccess: "RSS Feed URL copied!"
  }
};

export default function App() {
  const [uiLanguage, setUiLanguage] = useState<"vi" | "en">("vi");
  const t = translations[uiLanguage];

  // News State
  const [newsContent, setNewsContent] = useState<string>("");
  const charLength = newsContent.length;
  const wordCount = newsContent.trim() === "" ? 0 : newsContent.trim().split(/\s+/).length;
  const [selectedNewsCategory, setSelectedNewsCategory] = useState<string>("Technology");
  const [isGeneratingNews, setIsGeneratingNews] = useState<boolean>(false);
  const [newsGenerationError, setNewsGenerationError] = useState<string>("");

  // Voice Search & Assistant States
  const [isListening, setIsListening] = useState<boolean>(false);
  const [voiceInputLanguage, setVoiceInputLanguage] = useState<"vi-VN" | "en-US">("vi-VN");
  const [voiceQueryStatus, setVoiceQueryStatus] = useState<string>("");
  const [voiceQueryResult, setVoiceQueryResult] = useState<{ answer: string } | null>(null);
  const [voiceQuerySources, setVoiceQuerySources] = useState<Array<{ title: string; uri: string }>>([]);
  const [showVoiceAddPrompt, setShowVoiceAddPrompt] = useState<boolean>(false);
  const [voiceError, setVoiceError] = useState<string>("");
  const [isProcessingVoiceQuery, setIsProcessingVoiceQuery] = useState<boolean>(false);
  const [preferences, setPreferences] = useState<SummaryPreferences>({
    targetDuration: "medium",
    tone: "conversational",
    voice: "Kore",
    focus: uiLanguage === "vi" ? "tổng quan các sự kiện chính" : "general overview of major events",
    commuteType: "driving",
    customInstructions: "",
    language: "bilingual" // Default to Bilingual as requested by Vietnamese users
  });

  // Flow States
  const [step, setStep] = useState<"idle" | "summarizing" | "synthesizing" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [generationProgress, setGenerationProgress] = useState<string>("");

  // Active Briefing Payload State
  const [activePayload, setActivePayload] = useState<SummaryPayload | null>(null);
  const [activeAudioChunks, setActiveAudioChunks] = useState<string[]>([]);
  const [activeTitle, setActiveTitle] = useState<string>("");

  // Podcast manager states
  interface PodcastEpisodeItem {
    id: string;
    title: string;
    description: string;
    pubDate: string;
    audioUrl: string;
    duration: number;
  }
  const [podcastEpisodes, setPodcastEpisodes] = useState<PodcastEpisodeItem[]>([]);
  const [selectedBriefId, setSelectedBriefId] = useState<string>("");
  const [isPublishingPodcast, setIsPublishingPodcast] = useState<boolean>(false);
  const [podcastError, setPodcastError] = useState<string>("");

  const getPublicRssUrl = (): string => {
    const apiPath = getApiUrl("/api/podcast/feed");
    if (apiPath.startsWith("http")) {
      return apiPath;
    }
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`;
    }
    return "/api/podcast/feed";
  };
  const absoluteRssUrl = getPublicRssUrl();

  const loadPodcastEpisodes = async () => {
    try {
      const res = await fetch(getApiUrl("/api/podcast/episodes"));
      if (res.ok) {
        const data = await res.json();
        setPodcastEpisodes(data || []);
      }
    } catch (err) {
      console.error("Failed to load podcast episodes:", err);
    }
  };

  useEffect(() => {
    loadPodcastEpisodes();
  }, []);

  const handlePublishPodcast = async () => {
    if (!selectedBriefId) {
      alert(uiLanguage === "vi" ? "Vui lòng chọn một bản tin để xuất bản." : "Please select a briefing to publish.");
      return;
    }

    const targetBriefing = savedBriefings.find(b => b.id === selectedBriefId);
    if (!targetBriefing) {
      alert(uiLanguage === "vi" ? "Không tìm thấy bản tin cần xuất bản." : "Selected briefing could not be found.");
      return;
    }

    setIsPublishingPodcast(true);
    setPodcastError("");

    try {
      const res = await fetch(getApiUrl("/api/podcast/publish"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          briefId: selectedBriefId,
          briefing: targetBriefing
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Local state synchronization
        const updatedHistory = savedBriefings.map(b => {
          if (b.id === selectedBriefId) {
            return { ...b, audioUrl: data.audioUrl };
          }
          return b;
        });
        setSavedBriefings(updatedHistory);
        localStorage.setItem("commute_cast_history_vi", JSON.stringify(updatedHistory));

        if (data.storageType === "local") {
          const warnMsg = uiLanguage === "vi"
            ? `⚠️ Đã xuất bản podcast thành công, nhưng hiện tại tệp đang được lưu tạm trên Máy chủ Local do lỗi tải lên Supabase Storage.\n\nChi tiết lỗi: ${data.supabaseError || "Không rõ"}\n\n👉 Vui lòng truy cập trang quản lý Supabase Storage và đảm bảo bạn đã tạo Bucket tên là "podcast-audio" ở chế độ Public và cấu hình RLS Policy cho phép INSERT/Upload công khai.`
            : `⚠️ Podcast published successfully, but the audio file is hosted on the Local server backup due to a Supabase upload issue.\n\nError details: ${data.supabaseError || "Unknown"}\n\n👉 Please check that your "podcast-audio" Supabase Storage bucket is set to Public, and that you have enabled an Insert RLS Policy.`;
          alert(warnMsg);
        } else {
          alert(uiLanguage === "vi" ? "🎉 Xuất bản podcast thành công lên Supabase Storage!" : "🎉 Podcast episode published successfully to Supabase Storage!");
        }
        setSelectedBriefId("");
        loadPodcastEpisodes();
      } else {
        const errText = data.error || "Failed to publish.";
        setPodcastError(errText);
        alert(uiLanguage === "vi" ? `Xuất bản thất bại: ${errText}` : `Publishing failed: ${errText}`);
      }
    } catch (err: any) {
      console.error("Failed to publish podcast:", err);
      setPodcastError(err.message || "Network error");
    } finally {
      setIsPublishingPodcast(false);
    }
  };

  const handleDeletePodcastEpisode = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const confirmation = window.confirm(t.podcastDeleteConfirm);
    if (!confirmation) return;

    try {
      const res = await fetch(getApiUrl(`/api/podcast/episodes/${id}`), {
        method: "DELETE"
      });

      if (res.ok) {
        // Remove locally cached audio endpoint as well
        const updatedHistory = savedBriefings.map(b => {
          if (b.id === id) {
            const { audioUrl, ...rest } = b as any;
            return rest;
          }
          return b;
        });
        setSavedBriefings(updatedHistory);
        localStorage.setItem("commute_cast_history_vi", JSON.stringify(updatedHistory));

        loadPodcastEpisodes();
      } else {
        alert(uiLanguage === "vi" ? "Không thể xóa tập podcast này." : "Failed to delete podcast.");
      }
    } catch (err) {
      console.error("Failed to delete podcast:", err);
    }
  };

  // Notification State and Controller
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert(uiLanguage === "vi" 
        ? "Trình duyệt này chưa được tích hợp API thông báo hệ thống bản địa." 
        : "System Notifications API is not supported on this web client."
      );
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      
      if (permission === "granted") {
        new Notification(t.notificationToastTitle, {
          body: t.notificationToastBody,
          icon: "/icon-192.jpg",
          badge: "/icon-192.jpg"
        });
      }
    } catch (err) {
      console.warn("Failed to request notification permission:", err);
    }
  };

  // Storage historical commutes
  const [savedBriefings, setSavedBriefings] = useState<SavedSummary[]>([]);

  // Load saved history
  useEffect(() => {
    try {
      const stored = localStorage.getItem("commute_cast_history_vi");
      if (stored) {
        setSavedBriefings(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load history from local storage:", e);
    }
  }, []);

  // Save history on updates with robust auto-pruning to prevent localStorage QuotaExceeded errors
  const saveToHistory = (newHistory: SavedSummary[]) => {
    let listToSave = [...newHistory];

    // Limit to at most 10 items initially to keep history snappy and compact
    if (listToSave.length > 10) {
      listToSave = listToSave.slice(0, 10);
    }

    let success = false;
    let attempts = 0;

    // Retry loop: if localStorage is full (due to massive base64 audio payloads), 
    // eject the oldest saved briefings (at the end of the list) one by one until it fits.
    while (!success && listToSave.length > 0 && attempts < 15) {
      try {
        localStorage.setItem("commute_cast_history_vi", JSON.stringify(listToSave));
        success = true;
      } catch (e) {
        console.warn("[Quota Monitor] Storage quota exceeded. Evicting the oldest archived briefing to free up space...");
        listToSave.pop(); // Delete the last (oldest) item
        attempts++;
      }
    }

    setSavedBriefings(listToSave);
  };

  const handleApplyPreset = (index: number) => {
    const preset = SAMPLE_ARTICLES_PRESETS[index];
    setNewsContent((prev) => {
      const separator = prev ? "\n\n---\n\n" : "";
      return prev + separator + `Source: ${preset.title}\n\n${preset.content}`;
    });
  };

  const handleClearInput = () => {
    setNewsContent("");
  };

  const handleCreateNews = async () => {
    try {
      setIsGeneratingNews(true);
      setNewsGenerationError("");
      const res = await fetch(getApiUrl("/api/generate-news"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: selectedNewsCategory,
          language: preferences.language
        })
      });

      if (!res.ok) {
        let errorMsg = "Failed to connect to news generation server.";
        try {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await res.json();
            errorMsg = errorData.error || errorMsg;
          } else {
            const errorText = await res.text();
            if (errorText.includes("QUOTA_LIMIT") || res.status === 429) {
              errorMsg = uiLanguage === "vi"
                ? "QUOTA_LIMIT: Bạn đã hết tài nguyên cuộc gọi miễn phí trong ngày hôm nay. Vui lòng thiết lập khóa GROQ_API_KEY hoặc thử lại sau ít phút!"
                : "QUOTA_LIMIT: Free-tier quota limit reached. Please configure GROQ_API_KEY or retry after some time.";
            } else {
              errorMsg = `Server error (${res.status}): ${errorText.substring(0, 200)}`;
            }
          }
        } catch {
          errorMsg = uiLanguage === "vi"
            ? `Máy chủ gặp lỗi (${res.status}). Vui lòng kiểm tra lại kết nối hoặc cài đặt khóa API của bạn.`
            : `Server encountered an error (${res.status}). Please check your API configuration.`;
        }
        throw new Error(errorMsg);
      }

      const data = await res.json();
      if (data.newsText) {
        setNewsContent((prev) => {
          const separator = prev ? "\n\n---\n\n" : "";
          return prev + separator + data.newsText;
        });
      } else {
        throw new Error(uiLanguage === "vi" 
          ? "Máy chủ tạo tin phản hồi dữ liệu trống." 
          : "Response data is empty.");
      }
    } catch (err: any) {
      console.error("AI News generation error:", err);
      setNewsGenerationError(err.message || "Failed to generate AI news.");
    } finally {
      setIsGeneratingNews(false);
    }
  };

  const startVoiceSearch = () => {
    setVoiceError("");
    setVoiceQueryStatus("");
    setVoiceQueryResult(null);
    setVoiceQuerySources([]);
    setShowVoiceAddPrompt(false);

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setVoiceError(t.speechNotSupported);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = voiceInputLanguage;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setVoiceQueryStatus(t.btnListening);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        setVoiceError(t.speechErrorNotFound);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = async (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (!transcript || transcript.trim() === "") {
          setVoiceError(t.speechErrorNotFound);
          return;
        }

        try {
          setIsProcessingVoiceQuery(true);
          setVoiceQueryStatus(t.queryProcessing);
          
          const response = await fetch(getApiUrl("/api/voice-query"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: transcript,
              language: voiceInputLanguage === "vi-VN" ? "vi" : "en"
            })
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Query request failed");
          }

          const data = await response.json();
          if (data.answer) {
            setVoiceQueryResult({ answer: data.answer });
            setVoiceQuerySources(data.sources || []);
            setShowVoiceAddPrompt(true);
            setVoiceQueryStatus(t.querySuccess);
          } else {
            setVoiceError(uiLanguage === "vi" ? "Trợ lý không tìm được câu trả lời phù hợp. Hãy thử hỏi lại nhé!" : "Could not find a relevant answer. Try asking again!");
          }
        } catch (err: any) {
          console.error("Voice processing error:", err);
          setVoiceError(err.message || "Failed to parse query");
        } finally {
          setIsProcessingVoiceQuery(false);
        }
      };

      recognition.start();

    } catch (e: any) {
      console.error("Failed to start Speech Recognition:", e);
      setVoiceError(t.speechNotSupported);
    }
  };

  const handleVoiceAddToBriefing = () => {
    if (voiceQueryResult && voiceQueryResult.answer) {
      setNewsContent((prev) => {
        const separator = prev ? "\n\n---\n\n" : "";
        return prev + separator + voiceQueryResult.answer;
      });
      setShowVoiceAddPrompt(false);
      setVoiceQueryResult(null);
      setVoiceQuerySources([]);
      setVoiceQueryStatus("");
    }
  };

  // Compile full Daily Audio Briefing
  const handleGenerateBriefing = async () => {
    if (!newsContent.trim()) {
      setErrorMessage(uiLanguage === "vi" ? "Vui lòng dán hoặc chọn một chủ đề tin tức mẫu để bắt đầu." : "Please paste or load at least one news article to begin.");
      setStep("error");
      return;
    }

    try {
      setErrorMessage("");
      setStep("summarizing");
      setGenerationProgress(t.progressStep1);

      // Step 1: Query API to draft summary script
      const summaryRes = await fetch(getApiUrl("/api/summarize"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newsContent,
          preferences
        })
      });

      if (!summaryRes.ok) {
        let errorMsg = "Failed to generate narrative summary.";
        try {
          const contentType = summaryRes.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await summaryRes.json();
            errorMsg = errorData.error || errorMsg;
          } else {
            const errorText = await summaryRes.text();
            if (errorText.includes("QUOTA_LIMIT") || summaryRes.status === 429) {
              errorMsg = uiLanguage === "vi" 
                ? "QUOTA_LIMIT: Bạn đã hết tài nguyên cuộc gọi Gemini miễn phí trong ngày hôm nay. Hãy thử lại sau ít phút hoặc dùng các bản tin lưu sẵn phía dưới nhé!"
                : "QUOTA_LIMIT: You have reached the rate or project call quotas on the free-tier Gemini API. Please retry later or play the archived presets!";
            } else {
              errorMsg = `Server error (${summaryRes.status}): ${errorText.substring(0, 200)}`;
            }
          }
        } catch {
          errorMsg = `Server returned an invalid response (Status ${summaryRes.status}). Please check your API usage limits or try again shortly.`;
        }
        throw new Error(errorMsg);
      }

      let scriptPayload: SummaryPayload;
      try {
        scriptPayload = await summaryRes.json();
      } catch (err) {
        throw new Error(uiLanguage === "vi"
          ? "Phản hồi từ máy chủ không hợp lệ (Không phải cấu trúc JSON). Điều này thường xảy ra khi hệ thống bị quá tải hoặc đạt giới hạn lưu lượng (Quota Limit)."
          : "Server response is invalid (Not a valid JSON). This usually happens when the host is rate-limited or quota is exceeded."
        );
      }

      setActivePayload(scriptPayload);
      setActiveTitle(scriptPayload.title);

      // Step 2: Synthesis Preparation
      setStep("synthesizing");
      setGenerationProgress(t.progressStep2);

      const synthesisTimeline = [
        { label: uiLanguage === "vi" ? "Lời chào buổi sáng" : "Welcome Greeting", text: scriptPayload.introduction },
        ...scriptPayload.chapters.map((ch, idx) => ({
          label: `${uiLanguage === "vi" ? "Chương" : "Chapter"} ${idx + 1}: ${ch.topic}`,
          text: ch.scriptText
        })),
        { label: uiLanguage === "vi" ? "Phần kết và giao thông" : "Sign-off Outro", text: scriptPayload.conclusion }
      ];

      const chunks: string[] = [];
      for (let i = 0; i < synthesisTimeline.length; i++) {
        const segment = synthesisTimeline[i];
        const displayLabel = uiLanguage === "vi" 
          ? `Đang tạo âm thanh: [${i + 1}/${synthesisTimeline.length}] - ${segment.label}`
          : `Synthesizing audio: [${i + 1}/${synthesisTimeline.length}] - ${segment.label}`;
        
        setGenerationProgress(displayLabel);

        const ttsRes = await fetch(getApiUrl("/api/tts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: segment.text,
            voice: preferences.voice,
            tone: preferences.tone
          })
        });

        if (!ttsRes.ok) {
          let errorMsg = `Voice synthesis failed on track ${segment.label}.`;
          try {
            const contentType = ttsRes.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
              const ttsErr = await ttsRes.json();
              errorMsg = ttsErr.error || errorMsg;
            } else {
              const errorText = await ttsRes.text();
              if (errorText.includes("QUOTA_LIMIT") || ttsRes.status === 429) {
                errorMsg = uiLanguage === "vi"
                  ? "QUOTA_LIMIT: Đã hết tài nguyên giọng nói miễn phí của Google TTS (Giới hạn tối đa là 10 lượt gọi mỗi ngày của mô hình thử nghiệm gemini-3.1-flash-tts). Để tiếp tục nghe, bạn hay phát các bản tin mẫu lưu sẵn ở mục 'Lịch sử phát thanh' bên dưới!"
                  : "QUOTA_LIMIT: Daily free-tier limit for experimental voice-synthesis (gemini-3.1-flash-tts) has been reached (max 10 requests per day per project). Please select any archived briefs from the history section below!";
              } else {
                errorMsg = `TTS server error (${ttsRes.status}): ${errorText.substring(0, 200)}`;
              }
            }
          } catch {
            errorMsg = `Voice server returned invalid format (Status ${ttsRes.status}). Maybe rate limits or quotas are temporarily hit.`;
          }
          throw new Error(errorMsg);
        }

        let ttsData;
        let originalText = "";
        try {
          originalText = await ttsRes.text();
          ttsData = JSON.parse(originalText);
        } catch (parseErr: any) {
          throw new Error(uiLanguage === "vi"
            ? `Mã hóa dữ liệu giọng nói thất bại (Phản hồi không phải JSON hợp lệ).\nChi tiết phản hồi từ máy chủ: ${originalText.slice(0, 200) || parseErr.message}`
            : `Audio decoding failed (Response is not a valid JSON).\nResponse details from server: ${originalText.slice(0, 200) || parseErr.message}`
          );
        }

        if (!ttsData || !ttsData.base64Audio) {
          throw new Error(uiLanguage === "vi"
            ? `Không nhận được dữ liệu giọng nói (base64) hợp lệ sau khi tổng hợp track: ${segment.label}.`
            : `No valid voice audio data received (base64) for track: ${segment.label}.`
          );
        }
        chunks.push(ttsData.base64Audio);
      }

      setActiveAudioChunks(chunks);

      // Save complete package to local database
      const newBriefing: SavedSummary = {
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36),
        timestamp: new Date().toLocaleString(),
        preferences: { ...preferences },
        payload: scriptPayload,
        audioChunks: chunks
      };

      const updatedHistory = [newBriefing, ...savedBriefings];
      saveToHistory(updatedHistory);

      // Gửi thông báo hệ thống bản địa cực kỳ hiện đại tự động khi dệt xong bản tin
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification(t.notificationSuccessTitle, {
            body: `${t.notificationSuccessBody} (${scriptPayload.title})`,
            icon: "/icon-192.jpg",
            badge: "/icon-192.jpg",
            tag: "commutecast-complete"
          });
        } catch (e) {
          console.warn("Swallowed standard notification display failure:", e);
        }
      }

      setStep("ready");
    } catch (err: any) {
      console.error("Commute Briefing Generation Error:", err);
      setErrorMessage(err.message || "An unexpected error occurred during audio generation.");
      setStep("error");
    }
  };

  const handleApplyHistoryBriefing = (item: SavedSummary) => {
    setActivePayload(item.payload);
    setActiveAudioChunks(item.audioChunks || []);
    setActiveTitle(item.payload.title);
    setPreferences(item.preferences);
    setStep("ready");
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const itemToDelete = savedBriefings.find(item => item.id === id);
    const updated = savedBriefings.filter(item => item.id !== id);
    saveToHistory(updated);

    if (activePayload && itemToDelete && itemToDelete.payload.title === activePayload.title) {
      setActivePayload(null);
      setActiveAudioChunks([]);
      setStep("idle");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans" id="audio-commute-root">
      
      {/* Premium Visual Header Grid Panel */}
      <header className="bg-gradient-to-r from-slate-950 via-slate-900 to-cyan-950 text-white shadow-xl border-b border-cyan-800/40 sticky top-0 z-50 backdrop-blur-md bg-opacity-95">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-amber-300 flex items-center justify-center shadow-lg shadow-cyan-400/20">
              <AudioLines className="w-6 h-6 text-slate-950 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg tracking-tight">{t.appTitle}</span>
                <span className="bg-cyan-500/10 text-cyan-400 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-cyan-500/20">
                  EN/VI
                </span>
              </div>
              <p className="text-xs text-slate-350">{t.appSubtitle}</p>
            </div>
          </div>

          {/* Quick status controls */}
          <div className="flex items-center gap-3">
            {/* Realtime dynamic Language switcher toggle */}
            <button
              onClick={() => setUiLanguage((prev) => (prev === "vi" ? "en" : "vi"))}
              className="px-3.5 py-1.5 bg-cyan-500 text-slate-950 hover:bg-cyan-400 text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-2 cursor-pointer border border-cyan-300/30"
              title="Bấm để chuyển đổi ngôn ngữ giao diện / Click to toggle UI language"
            >
              <Languages className="w-4 h-4" />
              <span>{t.switchLangButton}</span>
            </button>

            {/* Smart PWA Web Notifications Toggle Badge */}
            {typeof window !== "undefined" && "Notification" in window && (
              <button
                onClick={requestNotificationPermission}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border shadow-sm ${
                  notificationPermission === "granted"
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25"
                    : notificationPermission === "denied"
                    ? "bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25"
                    : "bg-amber-500/15 border-amber-500/30 text-amber-400 hover:bg-amber-500/25 animate-pulse"
                }`}
                title={
                  notificationPermission === "granted"
                    ? "Thông báo đang hoạt động / Notifications active"
                    : notificationPermission === "denied"
                    ? "Đã bị chặn trong cài đặt trình duyệt / Blocked in browser setup"
                    : "Ấn để cấp quyền thông báo hoàn tất tạo tin / Prompt system notifications access"
                }
              >
                {notificationPermission === "granted" ? (
                  <>
                    <BellRing className="w-4 h-4 text-emerald-400" />
                    <span>{t.notificationGranted}</span>
                  </>
                ) : notificationPermission === "denied" ? (
                  <>
                    <BellOff className="w-4 h-4 text-rose-400" />
                    <span>{t.notificationBlocked}</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-4 h-4 text-amber-400" />
                    <span>{t.notificationBtnEnable}</span>
                  </>
                )}
              </button>
            )}

            <span className="bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700/60 text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-slate-300 font-mono text-[10px]">{t.statusBadge}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid Workdesk */}
      <main className="max-w-7xl mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side setup */}
        <section className="lg:col-span-7 flex flex-col gap-6" id="setup-panel-desktop">
          
          {/* Article Source Input Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-cyan-500" />
            
            <div className="flex justify-between items-center mb-1.5">
              <h2 className="text-base font-bold text-slate-850 flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-600" />
                <span>{t.step1Title}</span>
              </h2>
              {newsContent && (
                <button
                  onClick={handleClearInput}
                  className="text-xs text-rose-600 hover:text-rose-700 font-bold transition flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.clearInput}</span>
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-4">{t.step1Desc}</p>

            <div className="relative group/textarea">
              <textarea
                className="w-full min-h-[14rem] h-64 p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-600 outline-none transition resize-y placeholder:text-slate-400 custom-scrollbar block"
                placeholder={t.placeholderText}
                value={newsContent}
                onChange={(e) => setNewsContent(e.target.value)}
              />
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mt-2 gap-2 px-1 text-[10px] text-slate-400 font-medium select-none">
                <span className="flex items-center gap-1 text-slate-400">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 group-focus-within/textarea:bg-cyan-500" />
                  {t.dragToResize}
                </span>
                <span className="font-mono bg-slate-100/80 rounded-md px-2 py-0.5 border border-slate-200 flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span>{t.wordCount}: <strong className="text-slate-600 font-bold">{wordCount}</strong></span>
                  <span className="text-slate-300">|</span>
                  <span>{t.charCount}: <strong className="text-slate-600 font-bold">{charLength}</strong></span>
                </span>
              </div>
            </div>

            {/* Automatic AI news generator */}
            <div className="mt-4 p-4 bg-slate-50/70 border border-slate-200 rounded-xl" id="news-generator-container">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
                {t.generateNewsSectionTitle}
              </span>
              <p className="text-[11px] text-slate-500 mb-3 block">
                {t.generateNewsSectionDesc}
              </p>
              
              <div className="flex flex-col sm:flex-row gap-2">
                <select
                  value={selectedNewsCategory}
                  onChange={(e) => setSelectedNewsCategory(e.target.value)}
                  className="flex-1 bg-white border border-slate-250 text-xs px-3 py-2 rounded-lg focus:ring-2 focus:ring-cyan-500/10 outline-none font-medium text-slate-700 cursor-pointer"
                >
                  <option value="Technology">{t.catTech}</option>
                  <option value="Finance">{t.catFinance}</option>
                  <option value="Science">{t.catScience}</option>
                  <option value="Health">{t.catHealth}</option>
                  <option value="Sports">{t.catSports}</option>
                  <option value="Climate">{t.catClimate}</option>
                  <option value="Lifestyle">{t.catLifestyle}</option>
                  <option value="Education">{t.catEducation}</option>
                </select>
                <button
                  onClick={handleCreateNews}
                  disabled={isGeneratingNews}
                  className={`px-4 py-2 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-[0.98] shrink-0 border border-transparent ${
                    isGeneratingNews
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-cyan-600 text-white hover:bg-cyan-700 hover:shadow-sm"
                  }`}
                >
                  {isGeneratingNews ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-1" />
                      <span>{t.generatingNewsStatus}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-cyan-200 animate-pulse" />
                      <span>{t.btnGenerateNews}</span>
                    </>
                  )}
                </button>
              </div>
              
              {newsGenerationError && (
                <p className="text-[10px] text-rose-600 font-medium mt-1">
                  ⚠️ {newsGenerationError}
                </p>
              )}
            </div>

            {/* Voice Search & Smart Assistant */}
            <div className="mt-4 p-4 bg-gradient-to-br from-indigo-50/60 to-cyan-50/40 border border-slate-200 rounded-xl" id="voice-search-assistant-container">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isListening ? 'bg-rose-400' : 'bg-cyan-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isListening ? 'bg-rose-500' : 'bg-cyan-500'}`}></span>
                  </span>
                  {t.voiceSearchTitle}
                </span>
                {isListening && (
                  <span className="text-[10px] text-rose-600 animate-pulse font-medium">
                    ({t.btnListening})
                  </span>
                )}
              </div>
              
              <p className="text-[11px] text-slate-500 mb-3 block">
                {t.voiceSearchDesc}
              </p>

              {/* Language Selector for Voice Input */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-3 pb-2.5 border-b border-indigo-100/40">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">
                  {t.labelSpeechLanguage}
                </span>
                <div className="inline-flex rounded-lg bg-slate-100/80 p-0.5 border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setVoiceInputLanguage("vi-VN")}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition cursor-pointer select-none ${
                      voiceInputLanguage === "vi-VN"
                        ? "bg-white text-indigo-700 shadow-xs border border-indigo-100/40"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    🇻🇳 Vi-VN
                  </button>
                  <button
                    type="button"
                    onClick={() => setVoiceInputLanguage("en-US")}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition cursor-pointer select-none ${
                      voiceInputLanguage === "en-US"
                        ? "bg-white text-indigo-700 shadow-xs border border-indigo-100/40"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    🇺🇸 En-US
                  </button>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 items-center">
                <button
                  type="button"
                  onClick={startVoiceSearch}
                  disabled={isProcessingVoiceQuery}
                  className={`px-4 py-2 font-bold text-xs rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer select-none active:scale-[0.98] border ${
                    isListening
                      ? "bg-rose-500 text-white border-rose-600 shadow-sm animate-pulse"
                      : isProcessingVoiceQuery
                      ? "bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed"
                      : "bg-white hover:bg-slate-50 text-slate-700 border-slate-250 shadow-xs"
                  }`}
                >
                  <AudioLines className={`w-3.5 h-3.5 ${isListening ? 'animate-bounce' : ''}`} />
                  <span>{isListening ? t.btnListening : t.btnStartListening}</span>
                </button>

                {voiceQueryStatus && (
                  <span className="text-xs font-medium text-indigo-600 flex items-center gap-1">
                    {isProcessingVoiceQuery && <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />}
                    {voiceQueryStatus}
                  </span>
                )}
              </div>

              {voiceError && (
                <p className="text-[10px] text-rose-600 font-medium mt-2 bg-rose-50 p-2 rounded-lg border border-rose-100 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{voiceError}</span>
                </p>
              )}

              {showVoiceAddPrompt && voiceQueryResult && (
                <div className="mt-3 bg-white border border-indigo-100 rounded-lg p-3 shadow-xs animate-fadeIn">
                  <span className="text-[10px] font-bold text-indigo-600 block mb-1">
                    {t.voicePromptAnswerLabel}
                  </span>
                  <p className="text-xs text-slate-600 italic leading-relaxed bg-slate-50 p-2.5 rounded border-l-2 border-indigo-500 mb-3 whitespace-pre-wrap">
                    {voiceQueryResult.answer}
                  </p>
                  
                  {voiceQuerySources && voiceQuerySources.length > 0 && (
                    <div className="mb-3">
                      <span className="text-[10px] font-bold text-slate-500 block mb-1">
                        🌐 {uiLanguage === "vi" ? "Nguồn thông tin đã lọc trực tiếp từ các website:" : "Relevant web search sources:"}
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {voiceQuerySources.map((source, sIdx) => (
                          <a
                            key={sIdx}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 bg-slate-50 hover:bg-indigo-50/50 hover:text-indigo-700 hover:border-indigo-200 text-slate-600 text-[10px] px-2 py-1 rounded-lg border border-slate-200 font-medium transition cursor-pointer select-none"
                          >
                            <ExternalLink className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                            <span className="max-w-[170px] truncate">{source.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleVoiceAddToBriefing}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-md transition cursor-pointer flex items-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{t.btnAddToBriefing}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowVoiceAddPrompt(false);
                        setVoiceQueryResult(null);
                        setVoiceQuerySources([]);
                        setVoiceQueryStatus("");
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs rounded-md transition cursor-pointer"
                    >
                      {t.btnIgnoreQuery}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Presets suggestions */}
            <div className="mt-4">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">
                {t.presetsLabel}
              </span>
              <div className="flex flex-wrap gap-2">
                {SAMPLE_ARTICLES_PRESETS.map((preset, index) => (
                  <button
                    key={index}
                    onClick={() => handleApplyPreset(index)}
                    className="text-xs bg-slate-100 hover:bg-cyan-50 border border-slate-200 hover:border-cyan-200 text-slate-700 hover:text-cyan-850 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer flex items-center gap-1.5 max-w-[215px] truncate"
                    title={preset.title}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                    <span className="truncate">{preset.title}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preferences Settings Form */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-500" />
            
            <h2 className="text-base font-bold text-white bg-slate-900 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl border border-slate-800 mb-6 shadow-sm">
              <Settings2 className="w-4 h-4 text-amber-400" />
              <span>{t.step2Title}</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
              
              {/* Broadcast output language selector - CRITICAL FOR BILINGUAL ASSIGNMENT */}
              <div className="md:col-span-2 bg-gradient-to-r from-cyan-50 to-amber-50 p-4 border border-cyan-150 rounded-xl relative overflow-hidden">
                <div className="absolute top-2 right-2 opacity-10">
                  <Languages className="w-16 h-16 text-cyan-900" />
                </div>
                <label className="text-xs font-bold text-cyan-950 uppercase tracking-widest block mb-2">
                  {t.labelLanguage}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPreferences({ ...preferences, language: "bilingual" })}
                    className={`py-3 px-3.5 text-xs font-bold rounded-lg border transition-all text-center flex flex-col justify-center items-center gap-1 cursor-pointer ${
                      preferences.language === "bilingual"
                        ? "bg-gradient-to-br from-amber-400 to-amber-500 text-slate-950 border-amber-500 shadow-md transform scale-[1.01]"
                        : "bg-white text-slate-755 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-sm">🗣️ EN ⇄ VI</span>
                    <span>{t.langBilingual}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferences({ ...preferences, language: "vi" })}
                    className={`py-3 px-3.5 text-xs font-bold rounded-lg border transition-all text-center flex flex-col justify-center items-center gap-1 cursor-pointer ${
                      preferences.language === "vi"
                        ? "bg-slate-900 text-white border-slate-900 shadow-md transform scale-[1.01]"
                        : "bg-white text-slate-755 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-sm">🇻🇳 VI</span>
                    <span>{t.langVi}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPreferences({ ...preferences, language: "en" })}
                    className={`py-3 px-3.5 text-xs font-bold rounded-lg border transition-all text-center flex flex-col justify-center items-center gap-1 cursor-pointer ${
                      preferences.language === "en"
                        ? "bg-slate-955 text-white border-slate-900 shadow-md transform scale-[1.01]"
                        : "bg-white text-slate-755 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <span className="text-sm">🇺🇸 EN</span>
                    <span>{t.langEn}</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-600 mt-2.5 font-medium leading-relaxed">
                  {preferences.language === "bilingual" && t.langDescBilingual}
                  {preferences.language === "vi" && t.langDescVi}
                  {preferences.language === "en" && t.langDescEn}
                </p>
              </div>

              {/* Target Duration slider */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  {t.labelDuration}
                </label>
                <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
                  {[
                    { key: "short", label: t.durShort },
                    { key: "medium", label: t.durMedium },
                    { key: "long", label: t.durLong }
                  ].map((dur) => (
                    <button
                      key={dur.key}
                      type="button"
                      onClick={() => setPreferences({ ...preferences, targetDuration: dur.key as any })}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        preferences.targetDuration === dur.key 
                          ? "bg-white text-slate-900 shadow-sm" 
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {dur.label}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {preferences.targetDuration === "short" && t.durDescShort}
                  {preferences.targetDuration === "medium" && t.durDescMedium}
                  {preferences.targetDuration === "long" && t.durDescLong}
                </span>
              </div>

              {/* Transit commute type */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  {t.labelCommute}
                </label>
                <select
                  value={preferences.commuteType}
                  onChange={(e) => setPreferences({ ...preferences, commuteType: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-2 focus:ring-cyan-500/20 outline-none"
                >
                  <option value="driving">{t.commuteDriving}</option>
                  <option value="transit">{t.commuteTransit}</option>
                  <option value="walking">{t.commuteWalking}</option>
                  <option value="cycling">{t.commuteCycling}</option>
                </select>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {t.commuteDesc}
                </span>
              </div>

              {/* Spoken Tone style */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  {t.labelTone}
                </label>
                <select
                  value={preferences.tone}
                  onChange={(e) => setPreferences({ ...preferences, tone: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-2 focus:ring-cyan-500/20 outline-none"
                >
                  <option value="conversational">{t.toneConversational}</option>
                  <option value="informative">{t.toneInformative}</option>
                  <option value="upbeat">{t.toneUpbeat}</option>
                  <option value="analytical">{t.toneAnalytical}</option>
                  <option value="witty">{t.toneWitty}</option>
                </select>
              </div>

              {/* TTS Vocoder voice */}
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  {t.labelVoice}
                </label>
                <select
                  value={preferences.voice}
                  onChange={(e) => setPreferences({ ...preferences, voice: e.target.value as any })}
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-2 focus:ring-cyan-500/20 outline-none font-medium cursor-pointer"
                >
                  <option value="vi-HN">🇻🇳 {uiLanguage === "vi" ? "Việt Nam (Giọng Hà Nội - Nữ)" : "Vietnam (Hanoi Accent - Female)"}</option>
                  <option value="vi-HCM">🇻🇳 {uiLanguage === "vi" ? "Việt Nam (Giọng TP. HCM - Nữ/Nam)" : "Vietnam (HCM Accent - Friendly)"}</option>
                  <option value="en-UK">🇬🇧 {uiLanguage === "vi" ? "UK (United Kingdom): Giọng Anh - Anh (chuẩn RP)" : "UK (United Kingdom): British Accent (RP Standard)"}</option>
                  <option value="en-US">🇺🇸 {uiLanguage === "vi" ? "US (United States): Giọng Anh - Mỹ (chuẩn GA)" : "US (United States): American Accent (GA Standard)"}</option>
                  <option value="Kore">Kore {uiLanguage === "vi" ? "(Giọng Nữ Anh chuẩn)" : "(Clear, Professional Female)"}</option>
                  <option value="Puck">Puck {uiLanguage === "vi" ? "(Giọng Nam Anh ấm áp)" : "(Aesthetic, Warm Narrative Male)"}</option>
                  <option value="Charon">Charon {uiLanguage === "vi" ? "(Giọng Nam trầm trang trọng)" : "(Declaimed deep baritone)"}</option>
                  <option value="Fenrir">Fenrir {uiLanguage === "vi" ? "(Giọng trung tính tiêu chuẩn)" : "(Steady Standard Neutral)"}</option>
                  <option value="Zephyr">Zephyr {uiLanguage === "vi" ? "(Giọng dẫn chương trình sôi động)" : "(Bright, Engaging Host)"}</option>
                </select>
                <span className="text-[10px] text-slate-400 block mt-1">
                  {t.voiceSub}
                </span>
              </div>

              {/* Special focus area */}
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  {t.labelFocus}
                </label>
                <input
                  type="text"
                  value={preferences.focus}
                  onChange={(e) => setPreferences({ ...preferences, focus: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-2 focus:ring-cyan-500/20 outline-none placeholder:text-slate-400"
                  placeholder={t.placeholderFocus}
                />
              </div>

              {/* Custom special directives */}
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1.5">
                  {t.labelSpecial}
                </label>
                <input
                  type="text"
                  value={preferences.customInstructions}
                  onChange={(e) => setPreferences({ ...preferences, customInstructions: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-2 focus:ring-cyan-500/20 outline-none placeholder:text-slate-400"
                  placeholder={t.placeholderSpecial}
                />
              </div>

            </div>

            {/* Main Action launch button */}
            <div className="mt-6 pt-5 border-t border-slate-150">
              <button
                onClick={handleGenerateBriefing}
                disabled={step === "summarizing" || step === "synthesizing"}
                className={`w-full py-4 rounded-xl font-bold text-xs tracking-wider uppercase shadow-md transition-all flex items-center justify-center gap-2 transform active:scale-[0.99] cursor-pointer ${
                  step === "summarizing" || step === "synthesizing"
                    ? "bg-slate-200 text-slate-500 cursor-not-allowed shadow-none"
                    : "bg-slate-900 text-white hover:bg-slate-800 hover:shadow-lg active:bg-slate-950"
                }`}
              >
                <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
                <span>{t.btnGenerate}</span>
              </button>
            </div>
          </div>

        </section>

        {/* Right Side: Active Player deck & historical playlists */}
        <section className="lg:col-span-5 flex flex-col gap-6" id="output-panel-desktop">
          
          {/* Active status loaders */}
          {step === "summarizing" && (
            <div className="bg-slate-900 text-white p-8 rounded-3xl border border-slate-800 text-center shadow-2xl flex flex-col items-center justify-center min-h-[310px]">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
                <Settings2 className="w-6 h-6 text-cyan-400 absolute top-5 left-5 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold">{t.draftingTitle}</h3>
              <p className="text-xs text-slate-400 mt-2.5 max-w-xs leading-relaxed">
                {generationProgress}
              </p>
            </div>
          )}

          {step === "synthesizing" && (
            <div className="bg-slate-900 text-white p-8 rounded-3xl border border-slate-800 text-center shadow-2xl flex flex-col items-center justify-center min-h-[310px]">
              <div className="relative mb-6">
                <div className="w-16 h-16 rounded-full border-4 border-amber-400 border-t-transparent animate-spin" />
                <Volume2 className="w-6 h-6 text-amber-350 absolute top-5 left-5 animate-bounce" />
              </div>
              <h3 className="text-lg font-bold">{t.synthesizingTitle}</h3>
              <p className="text-xs text-slate-400 mt-2.5 max-w-xs leading-relaxed">
                {generationProgress}
              </p>
            </div>
          )}

          {step === "error" && (
            <div className="bg-white p-6 rounded-2xl border border-rose-250 shadow-sm text-center">
              <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="text-base font-bold text-slate-800">{t.failedTitle}</h3>
              <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                {errorMessage}
              </p>
              <button
                onClick={() => setStep("idle")}
                className="mt-4 text-xs bg-slate-100 hover:bg-slate-200 text-slate-705 border border-slate-200 px-4 py-2 rounded-lg font-medium transition cursor-pointer"
              >
                {t.btnReset}
              </button>
            </div>
          )}

          {step === "idle" && (
            <div className="bg-slate-100 border-2 border-dashed border-slate-300 rounded-3xl p-8 text-center flex flex-col items-center justify-center min-h-[310px] relative overflow-hidden">
              <Compass className="w-10 h-10 text-slate-400 mb-3 animate-pulse" />
              <h3 className="text-sm font-bold text-slate-700">{t.idleTitle}</h3>
              <p className="text-xs text-slate-500 mt-2 max-w-xs leading-relaxed">
                {t.idleSub}
              </p>
            </div>
          )}

          {step === "ready" && activePayload && (
            <ManualPcmPlayer
              payload={activePayload}
              audioChunks={activeAudioChunks}
              title={activeTitle}
              preferencesInfo={`${
                preferences.voice === "vi-HN" 
                  ? (uiLanguage === "vi" ? "Giọng Hà Nội" : "Hanoi Accent") 
                  : preferences.voice === "vi-HCM" 
                  ? (uiLanguage === "vi" ? "Giọng TP. HCM" : "HCM Accent") 
                  : preferences.voice === "en-UK"
                  ? (uiLanguage === "vi" ? "Giọng Anh-Anh (RP)" : "UK Accent (RP)")
                  : preferences.voice === "en-US"
                  ? (uiLanguage === "vi" ? "Giọng Anh-Mỹ (GA)" : "US Accent (GA)")
                  : `${preferences.voice} Host`
              } • ${preferences.language === "bilingual" ? "Song Ngữ EN-VI" : preferences.language === "vi" ? "Tiếng Việt" : "English Mode"}`}
              uiLanguage={uiLanguage}
            />
          )}

          {/* Local commute playlist drive list */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-850 flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-cyan-600" />
              <span>{t.historyTitle}</span>
            </h3>

            {savedBriefings.length === 0 ? (
              <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 rounded-xl">
                <p className="text-xs">{t.historyEmpty}</p>
                <p className="text-[10px] text-slate-400 mt-1">{t.historyEmptySub}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                {savedBriefings.map((item) => {
                  const itemLanguage = item.preferences.language || "bilingual";
                  
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleApplyHistoryBriefing(item)}
                      className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-250 hover:border-slate-300 rounded-xl transition cursor-pointer flex justify-between items-start gap-4 group text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-150 text-cyan-750 uppercase">
                            {itemLanguage}
                          </span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 capitalize">
                            {item.preferences.targetDuration}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-800 truncate">
                          {item.payload.title}
                        </h4>
                        <p className="text-[10px] text-slate-550 mt-1 flex items-center gap-1.5 font-mono">
                          <span>🕒 {item.timestamp}</span>
                        </p>
                      </div>

                      <button
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition"
                        title="Delete Briefing"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Podcast Management and RSS Feed System */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-850 flex items-center gap-2">
                <span className="p-1 px-1.5 bg-cyan-100 text-cyan-750 text-[10px] rounded-lg font-mono uppercase tracking-wider">Podcast Feed</span>
                <span>{t.podcastTitle}</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-1.5 font-medium leading-relaxed text-left">
                {t.podcastDesc}
              </p>
            </div>

            {/* RSS Link and copy control badge */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 font-mono text-[11px] text-slate-600">
              <span className="truncate select-all bg-white px-2 py-1 rounded border border-slate-200 flex-1 text-left">
                {absoluteRssUrl}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (absoluteRssUrl) {
                      navigator.clipboard.writeText(absoluteRssUrl);
                      alert(t.podcastCopySuccess);
                    }
                  }}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-350 active:bg-slate-300 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1"
                  title="Copy RSS Feed Link"
                >
                  <span className="text-[10px]">Copy</span>
                </button>
                <a
                  href={absoluteRssUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 hover:bg-slate-200 text-slate-500 hover:text-slate-800 rounded-lg transition-all"
                  title="Open Feed XML"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            {/* Publish Action form */}
            <div className="border-t border-slate-150 pt-4 text-left">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <select
                  value={selectedBriefId}
                  onChange={(e) => setSelectedBriefId(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-50 border border-slate-220 text-xs px-3 py-2 rounded-xl focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none font-medium cursor-pointer text-slate-700"
                >
                  <option value="">{t.podcastSelectLabel}</option>
                  {savedBriefings.map((brief) => {
                    // Check if already published on podcast episodes list
                    const isPublished = podcastEpisodes.some(ep => ep.id === brief.id);
                    const pubBadge = isPublished ? " [Đã Xuất Bản / Live]" : "";
                    return (
                      <option key={brief.id} value={brief.id}>
                        {brief.payload?.title || brief.id} ({brief.timestamp}){pubBadge}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={handlePublishPodcast}
                  disabled={isPublishingPodcast || !selectedBriefId}
                  className={`px-4 py-2 text-xs font-bold rounded-xl whitespace-nowrap tracking-wide cursor-pointer transition-all flex items-center justify-center gap-1.5 ${
                    isPublishingPodcast
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : !selectedBriefId
                      ? "bg-slate-150 text-slate-400 cursor-not-allowed"
                      : "bg-cyan-600 hover:bg-cyan-700 text-white shadow-sm hover:shadow active:scale-[0.98]"
                  }`}
                >
                  <span>{isPublishingPodcast ? t.podcastBtnPublishing : t.podcastBtnPublish}</span>
                </button>
              </div>
              {podcastError && <p className="text-[10px] text-rose-500 font-semibold mt-1">{podcastError}</p>}
            </div>

            {/* Published Feed list catalog */}
            <div className="border-t border-slate-150 pt-4 flex flex-col gap-2 text-left">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span>{t.podcastListTitle}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 font-mono text-slate-500 font-bold">
                  {podcastEpisodes.length} {t.podcastEpisodeCount}
                </span>
              </div>

              {podcastEpisodes.length === 0 ? (
                <div className="text-center py-6 text-slate-400 border border-dashed border-slate-250 rounded-xl bg-slate-50/50">
                  <p className="text-[11px]">{t.podcastNoEpisodes}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {podcastEpisodes.map((ep) => {
                    return (
                      <div
                        key={ep.id}
                        className="py-2.5 px-3 bg-slate-50/70 border border-slate-200 hover:border-slate-250 rounded-xl transition flex justify-between items-center gap-3 text-left animate-fade-in"
                      >
                        <div className="min-w-0 flex-1">
                          <h4 className="text-[11px] font-bold text-slate-800 line-clamp-1">
                            {ep.title}
                          </h4>
                          <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-550 font-semibold">
                            <span className="truncate max-w-[120px] font-mono text-[8px] bg-slate-200 px-1 rounded">{ep.audioUrl.split("/").pop()}</span>
                            <span>•</span>
                            <span>🕒 {new Date(ep.pubDate).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>⌛ {ep.duration}s</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <a
                            href={ep.audioUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 px-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 hover:text-cyan-700 text-[10px] font-bold rounded-lg transition"
                          >
                            Play
                          </a>
                          <button
                            type="button"
                            onClick={(e) => handleDeletePodcastEpisode(ep.id, e)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg transition cursor-pointer"
                            title="Unpublish Episode"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </section>

      </main>

      {/* Decorative footer */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-12 text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-wrap justify-between items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <AudioLines className="w-3.5 h-3.5 text-cyan-550" />
            <span className="font-semibold text-slate-700">CommuteCast Radio News</span>
            <span>© 2026| Created by Nguyen Viet Dieu</span>
          </div>
          <div className="flex gap-4">
            <span>Gemini Dual-Speech Architecture (TTS 24kHz)</span>
            <span>•</span>
            <span>Made with Gemini 3.1 & 3.5</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
