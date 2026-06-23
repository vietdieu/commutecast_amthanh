import React, { useEffect, useRef, useState } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  Download, 
  Volume2, 
  Layers, 
  FileCheck,
  ChevronRight,
  Sparkles,
  Headphones,
  Share2,
  Copy,
  Check,
  Radio,
  Sliders,
  MessageSquare,
  Facebook
} from "lucide-react";
import { NewsChapter, SummaryPayload } from "../types";
import { base64ToArrayBuffer, pcmToFloat32, encodeWavHeader } from "../utils";

interface ManualPcmPlayerProps {
  payload: SummaryPayload;
  audioChunks: string[]; // Base64 audio per segment: [Intro, ...Chapters, Conclusion]
  title?: string;
  preferencesInfo?: string;
  uiLanguage?: "vi" | "en";
}

const playerTranslations = {
  vi: {
    systemTitle: "Hệ Thống Phát Thanh Tin Tức",
    poweredBy: "Vận hành bởi Gemini 3.1 TTS",
    speed: "Tốc độ",
    exportBtn: "Xuất file âm thanh (.wav)",
    scriptTitle: "Nội Dung Kịch Bản Bản Tin",
    scriptSub: "Nhấp phân đoạn bên dưới để nghe vị trí mong muốn",
    labelIntro: "📻 Chào Đầu Bản Tin",
    labelOutro: "🚗 Chào Kết & Giao Thông",
    labelTopic: "📚 Phân Đoạn Tin Tức Summary",
    studioCenter: "🎛️ Trung Tâm Studio & Chia Sẻ",
    studioDesc: "Hậu trường phát thanh: Tải file, sao chép kịch bản hoặc truyền thông trực tiếp.",
    onAirLabel: "PHÒNG THU LIVE",
    onAirBroadcasting: "ĐÀI ĐANG PHÁT SÓNG TRỰC TIẾP",
    onAirStandby: "MÁY CHỦ SẴN SÀNG - ĐANG CHỜ PHÁT",
    copyTranscript: "Sao chép tin tức",
    copySuccess: "Đã sao chép kịch bản!",
    shareZalo: "Chia sẻ lên Zalo",
    shareFacebook: "Chia sẻ lên Facebook",
    downloadTiktok: "Tải xuống Audio (Dùng cho TikTok/Reels)",
    studioEfx: "Giám Sát Tần Số Sóng & Âm Lượng Mixer",
    volumeLabel: "Âm lượng phòng thu",
  },
  en: {
    systemTitle: "Commute Audio System",
    poweredBy: "Powered by Gemini 3.1 TTS",
    speed: "Speed",
    exportBtn: "Export Audio",
    scriptTitle: "Interactive Commute Broadcast Script",
    scriptSub: "Click segments to jump audio",
    labelIntro: "📻 Welcome Greeting",
    labelOutro: "🚗 Traffic Outro",
    labelTopic: "📚 Broadcast Topic",
    studioCenter: "🎛️ Studio Suite & Sharing Center",
    studioDesc: "Backstage tools: download audio feed, export transcripts or stream direct.",
    onAirLabel: "LIVE STUDIO",
    onAirBroadcasting: "ON AIR - LIVE BROADCASTING",
    onAirStandby: "STANDBY - READY TO PLAY",
    copyTranscript: "Copy Transcript",
    copySuccess: "Transcript Copied!",
    shareZalo: "Share to Zalo",
    shareFacebook: "Share to Facebook",
    downloadTiktok: "Download Audio (for TikTok/Reels)",
    studioEfx: "Studio Frequency & Visual Level Mixer Monitor",
    volumeLabel: "Studio Monitor Volume",
  }
};

export default function ManualPcmPlayer({ payload, audioChunks, title, preferencesInfo, uiLanguage = "vi" }: ManualPcmPlayerProps) {
  const pt = playerTranslations[uiLanguage];
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

  // Web Audio Variables
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mainBufferRef = useRef<AudioBuffer | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Studio and custom state structures
  const [volume, setVolume] = useState<number>(0.9);
  const [frequencyData, setFrequencyData] = useState<number[]>(new Array(32).fill(12));
  const [copied, setCopied] = useState(false);
  
  // Timing references
  const startTimeCtxRef = useRef<number>(0);
  const elapsedOffsetRef = useRef<number>(0); // how many seconds have we played since start
  const animFrameIdRef = useRef<number | null>(null);
  
  // Segment durations and cumulative offsets for "Read-along highlighting"
  const [segmentOffsets, setSegmentOffsets] = useState<{ start: number; end: number }[]>([]);

  // Prepare segments & text for quick highlighting match
  const allSegments = [
    { type: "intro", title: "Introduction", text: payload.introduction, bullets: [] as string[] },
    ...payload.chapters.map((ch, i) => ({ 
      type: "chapter", 
      title: `${i + 1}. ${ch.topic}`, 
      text: ch.scriptText, 
      bullets: ch.summaryBullets 
    })),
    { type: "outro", title: "Signing Off", text: payload.conclusion, bullets: [] as string[] }
  ];

  // 1. Initialize audio buffer when chunks change
  useEffect(() => {
    // Reset player states
    stopAudio();
    setIsPlaying(false);
    setCurrentTime(0);
    elapsedOffsetRef.current = 0;

    const sampleRate = 24000; // gemini-3.1-flash-tts-preview standard output sample rate

    try {
      // Decode each base64 segment check
      const arrayBuffers = audioChunks.map(chunk => base64ToArrayBuffer(chunk));
      const floatArrays = arrayBuffers.map(ab => pcmToFloat32(ab));

      // Calculate sizes and offsets
      let totalSamples = 0;
      const offsets: { start: number; end: number }[] = [];

      floatArrays.forEach((fArray) => {
        const duration = fArray.length / sampleRate;
        const startSec = totalSamples / sampleRate;
        totalSamples += fArray.length;
        const endSec = totalSamples / sampleRate;
        offsets.push({ start: startSec, end: endSec });
      });

      setSegmentOffsets(offsets);
      setTotalDuration(totalSamples / sampleRate);

      // Create a single concatenated AudioBuffer
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
      audioCtxRef.current = audioCtx;

      const unifiedBuffer = audioCtx.createBuffer(1, totalSamples, sampleRate);
      const outputChannel = unifiedBuffer.getChannelData(0);

      let writeOffset = 0;
      floatArrays.forEach((fArray) => {
        outputChannel.set(fArray, writeOffset);
        writeOffset += fArray.length;
      });

      mainBufferRef.current = unifiedBuffer;

    } catch (err) {
      console.error("Failed to construct audio buffer:", err);
    }

    return () => {
      stopAudio();
    };
  }, [audioChunks]);

  // Adjust playback rate live
  useEffect(() => {
    if (sourceNodeRef.current && isPlaying) {
      sourceNodeRef.current.playbackRate.value = playbackRate;
      // adjust startTimeCtx so elapsed offset computes accurately
      const elapsedSoFar = currentTime;
      startTimeCtxRef.current = audioCtxRef.current!.currentTime;
      elapsedOffsetRef.current = elapsedSoFar;
    }
  }, [playbackRate]);

  // Constantly update progress tracker
  const startTrackingProgress = () => {
    if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);

    const updateProgress = () => {
      if (!audioCtxRef.current || !isPlaying) return;

      const now = audioCtxRef.current.currentTime;
      const elapsedSeconds = elapsedOffsetRef.current + (now - startTimeCtxRef.current) * playbackRate;

      if (elapsedSeconds >= totalDuration) {
        // finished playback
        setCurrentTime(totalDuration);
        setIsPlaying(false);
        stopAudio();
        elapsedOffsetRef.current = 0;
        setActiveSegmentIndex(0);
        return;
      }

      setCurrentTime(elapsedSeconds);

      // Identify active segment highlight
      const activeIdx = segmentOffsets.findIndex(
        (offset) => elapsedSeconds >= offset.start && elapsedSeconds <= offset.end
      );
      if (activeIdx !== -1) {
        setActiveSegmentIndex(activeIdx);
      }

      // Read Web Audio frequency spectrum livedata
      if (analyserRef.current) {
        const dataArr = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArr);
        const values: number[] = [];
        for (let i = 0; i < 32; i++) {
          // Normalize standard speech frequency weights nicely for display
          const weight = i < 8 ? 1.0 : i < 16 ? 1.3 : 1.6;
          values.push(Math.min(255, (dataArr[i] || 0) * weight));
        }
        setFrequencyData(values);
      }

      animFrameIdRef.current = requestAnimationFrame(updateProgress);
    };

    animFrameIdRef.current = requestAnimationFrame(updateProgress);
  };

  const stopTrackingProgress = () => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
  };

  const stopAudio = () => {
    stopTrackingProgress();
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch (err) {
        // already stopped
      }
      sourceNodeRef.current = null;
    }
  };

  const playAudio = (offset: number) => {
    if (!mainBufferRef.current || !audioCtxRef.current) return;

    stopAudio();

    // Resume AudioContext if suspended (browser constraints)
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }

    const source = audioCtxRef.current.createBufferSource();
    source.buffer = mainBufferRef.current;
    source.playbackRate.value = playbackRate;

    // Create and attach Analyser and Gain Node chain
    const analyser = audioCtxRef.current.createAnalyser();
    analyser.fftSize = 64; // 32 spectrum bins
    analyser.smoothingTimeConstant = 0.75;
    analyserRef.current = analyser;

    const gainNode = audioCtxRef.current.createGain();
    gainNode.gain.value = volume;
    gainNodeRef.current = gainNode;

    source.connect(analyser);
    analyser.connect(gainNode);
    gainNode.connect(audioCtxRef.current.destination);

    // Apply offset bounds
    const safeOffset = Math.max(0, Math.min(offset, totalDuration));
    
    // Start playback
    source.start(0, safeOffset);
    sourceNodeRef.current = source;

    startTimeCtxRef.current = audioCtxRef.current.currentTime;
    elapsedOffsetRef.current = safeOffset;
    setIsPlaying(true);
  };

  useEffect(() => {
    if (isPlaying) {
      startTrackingProgress();
    } else {
      stopTrackingProgress();
    }
  }, [isPlaying]);

  // Adjust volume active node live
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Slowly animate virtual room acoustics/wave when idle
  useEffect(() => {
    let interval: any;
    if (!isPlaying) {
      interval = setInterval(() => {
        setFrequencyData((prev) =>
          prev.map((_, i) => {
            const angle = (Date.now() * 0.002) + (i * 0.4);
            return Math.sin(angle) * 8 + 12;
          })
        );
      }, 80);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayPause = () => {
    if (isPlaying) {
      // Pause
      setIsPlaying(false);
      stopAudio();
    } else {
      // Play
      playAudio(currentTime >= totalDuration ? 0 : currentTime);
    }
  };

  const handleSkip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(currentTime + seconds, totalDuration));
    setCurrentTime(newTime);
    if (isPlaying) {
      playAudio(newTime);
    } else {
      elapsedOffsetRef.current = newTime;
      // find static segment index highlight manually
      const activeIdx = segmentOffsets.findIndex(
        (offset) => newTime >= offset.start && newTime <= offset.end
      );
      if (activeIdx !== -1) {
        setActiveSegmentIndex(activeIdx);
      }
    }
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (isPlaying) {
      playAudio(newTime);
    } else {
      elapsedOffsetRef.current = newTime;
      const activeIdx = segmentOffsets.findIndex(
        (offset) => newTime >= offset.start && newTime <= offset.end
      );
      if (activeIdx !== -1) {
        setActiveSegmentIndex(activeIdx);
      }
    }
  };

  const handleChapterClick = (index: number) => {
    if (segmentOffsets[index]) {
      const targetTime = segmentOffsets[index].start;
      setCurrentTime(targetTime);
      playAudio(targetTime);
      setActiveSegmentIndex(index);
    }
  };

  // WAV File Downloader
  const handleDownloadWav = () => {
    try {
      const arrayBuffers = audioChunks.map(chunk => base64ToArrayBuffer(chunk));
      
      // Calculate total byte size
      const totalByteLength = arrayBuffers.reduce((acc, ab) => acc + ab.byteLength, 0);
      const concatenatedPCM = new Uint8Array(totalByteLength);
      
      let writePos = 0;
      arrayBuffers.forEach((ab) => {
        concatenatedPCM.set(new Uint8Array(ab), writePos);
        writePos += ab.byteLength;
      });

      const wavBlob = encodeWavHeader(concatenatedPCM.buffer, 24000);
      const url = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title || "CommuteSummary"}_Audio_24khz.wav`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to package WAV file for download.");
    }
  };

  const handleCopyTranscript = () => {
    try {
      const fullTranscript = [
        `🎙️ BẢN TIN PHÁT THANH: ${title || "CommuteCast"}`,
        `==================================`,
        `[${pt.labelIntro}]`,
        payload.introduction,
        ...payload.chapters.map((ch, idx) => `\n[${idx + 1}. ${ch.topic}]\n${ch.scriptText}`),
        `\n[${pt.labelOutro}]`,
        payload.conclusion,
        `==================================`,
        `© 2026 CommuteCast Radio News | Vận hành bởi Gemini 3.5 & TTS`
      ].join("\n");
      
      // Chiến lược sao chép thông minh chống lỗi Iframe Sandbox / HTTP không bảo mật
      let successful = false;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(fullTranscript);
        successful = true;
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = fullTranscript;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        textArea.style.top = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          successful = document.execCommand("copy");
        } catch (err) {
          console.error("Fallback copy failed", err);
        }
        document.body.removeChild(textArea);
      }

      if (successful) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2400);
      } else {
        alert(uiLanguage === "vi" 
          ? "Thiết bị không hỗ trợ sao chép tự động. Bạn vui lòng tự bôi đen văn bản để sao chép." 
          : "Auto-copy not supported. Please select text manually to copy."
        );
      }
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const handleShareZalo = () => {
    const postTitle = title ? `Bản tin phát thanh CommuteCast: ${title}` : "Nghe Bản tin phát thanh cá nhân hóa của tôi!";
    const shareUrl = window.location.href;
    const encodedTitle = encodeURIComponent(postTitle);
    const encodedUrl = encodeURIComponent(shareUrl);

    // Phát hiện thiết bị di động (Mobile/Tablet)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // Trên Mobile: Ưu tiên Deep Link mở trực tiếp ứng dụng Zalo đã cài trên máy để chia sẻ lập tức
      const mobileShareLink = `zalo://app?action=share&url=${encodedUrl}&title=${encodedTitle}`;
      // Giao diện Web App hoặc đăng nhập Zalo sạch sẽ cho mobile nếu không có app hoặc chưa log in
      const backupWebLink = `https://zalo.me/share?url=${encodedUrl}&title=${encodedTitle}`;
      
      // Chuyển hướng đến ứng dụng Zalo
      window.location.href = mobileShareLink;

      // Đặt cơ chế tự động dự phòng: Nếu không mở được app Zalo (ví dụ máy chưa cài),
      // thì sau 1.5 giây sẽ tự định tuyến sang trang web của Zalo - nơi có giao diện đăng nhập chia sẻ cực tiện lợi
      setTimeout(() => {
        if (!document.hidden) {
          window.location.href = backupWebLink;
        }
      }, 1500);
    } else {
      // Trên Desktop: Sử dụng liên kết Zalo Share Web mở ra Popup đăng nhập bằng QR Code / Số điện thoại để chia sẻ
      const webShareLink = `https://sp.zalo.me/share_to_zalo?url=${encodedUrl}&title=${encodedTitle}`;
      window.open(webShareLink, "_blank", "width=600,height=500,scrollbars=yes,resizable=yes");
    }
  };

  const handleShareFacebook = () => {
    const shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}`;
    window.open(shareUrl, "_blank", "width=600,height=550,scrollbars=yes,resizable=yes");
  };

  // Helper formatting for seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="flex flex-col gap-6" id="pcm-commute-player">
      {/* Visual Audio Deck Widget */}
      <div className="bg-radial from-[#1e293b] to-[#0f172a] text-slate-100 rounded-3xl p-6 shadow-2xl relative overflow-hidden border border-slate-700/50">
        
        {/* Futuristic Grid Overlay Background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none opacity-20" />
        
        {/* Glow Circles */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header Metadata */}
        <div className="flex justify-between items-center relative z-10 mb-4">
          <div className="flex items-center gap-2 bg-slate-800/80 backdrop-blur-sm px-3 py-1.5 rounded-full border border-slate-700/50">
            <div className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isPlaying ? "bg-red-500" : "bg-emerald-500"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                isPlaying ? "bg-red-500" : "bg-emerald-500"
              }`}></span>
            </div>
            <span className="text-[10px] font-mono tracking-widest text-slate-300 uppercase font-bold">
              {isPlaying 
                ? (uiLanguage === "vi" ? "ĐANG PHÁT (LIVE CAST)" : "LIVE BROADCAST") 
                : (uiLanguage === "vi" ? "CHẾ ĐỘ CHỜ (STANDBY)" : "STUDIO STANDBY")}
            </span>
          </div>
          {preferencesInfo && (
            <span className="text-xs text-slate-400 font-mono italic bg-slate-800/40 px-2.5 py-1 rounded-md border border-slate-700/30">
              {preferencesInfo}
            </span>
          )}
        </div>

        {/* Snappy Title display */}
        <div className="relative z-10 mb-6">
          <h3 className="text-xl font-bold text-white tracking-tight leading-snug line-clamp-2">
            {title || (uiLanguage === "vi" ? "Bản tin hành trình của bạn" : "Custom Commute Podcast")}
          </h3>
          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
            <span>{pt.poweredBy}</span>
            <span className="inline-block w-1 h-1 rounded-full bg-slate-500" />
            <span>Mono 24kHz</span>
          </p>
        </div>

        {/* Dynamic Waveform Visualizer - Connected directly to the real frequency analyzer */}
        <div className="relative z-10 h-14 flex items-end justify-between gap-[3px] px-2.5 mb-4 bg-slate-950/60 rounded-2xl py-3 border border-slate-850">
          {frequencyData.map((val, barIdx) => {
            // Scale val (0-255) to height (typically 4px - 44px)
            const heightPx = Math.max(4, Math.min(44, (val / 255) * 40));
            // Highlight bar index according to temporal progress
            const currentHighlight = (barIdx / 32) <= (currentTime / (totalDuration || 1));
            
            return (
              <div
                key={barIdx}
                className={`w-full rounded-t-sm transition-all duration-75 ${
                  isPlaying 
                    ? currentHighlight
                      ? "bg-gradient-to-t from-cyan-400 via-emerald-400 to-amber-300 shadow-[0_0_8px_rgba(34,211,238,0.4)]" 
                      : "bg-cyan-600/40"
                    : "bg-slate-700/65"
                }`}
                style={{ 
                  height: `${heightPx}px` 
                }}
              />
            );
          })}
        </div>

        {/* Interactive Progress Bar Slider */}
        <div className="relative z-10 mb-4">
          <input
            type="range"
            min={0}
            max={totalDuration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleScrubberChange}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-400"
          />
          <div className="flex justify-between items-center mt-2 text-xs text-slate-400 font-mono">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Controls Layout */}
        <div className="relative z-10 flex flex-wrap justify-between items-center gap-4 pt-1 border-t border-slate-800/80">
          
          {/* Rate speed selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500 font-mono uppercase mr-1">{pt.speed}</span>
            <div className="bg-slate-800/80 p-0.5 rounded-lg flex border border-slate-700/40">
              {[0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setPlaybackRate(rate)}
                  className={`px-1.5 py-1 text-[10px] font-mono rounded font-bold transition-all ${
                    playbackRate === rate 
                      ? "bg-gradient-to-r from-cyan-500 to-cyan-600 text-slate-900" 
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Playback controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleSkip(-10)}
              title={uiLanguage === "vi" ? "Tua lại 10 giây" : "Rewind 10 seconds"}
              className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700/20"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={handlePlayPause}
              disabled={audioChunks.length === 0}
              className={`p-4 rounded-full transition-all duration-300 flex items-center justify-center transform active:scale-95 ${
                audioChunks.length === 0 
                  ? "bg-slate-800 text-slate-600 cursor-not-allowed" 
                  : isPlaying 
                  ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 shadow-lg shadow-amber-550/30 ring-4 ring-amber-500/20" 
                  : "bg-gradient-to-r from-cyan-400 to-cyan-500 text-slate-900 shadow-lg shadow-cyan-450/30 ring-4 ring-cyan-500/20"
              }`}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={() => handleSkip(10)}
              title={uiLanguage === "vi" ? "Tới 10 giây" : "Forward 10 seconds"}
              className="p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/60 hover:bg-slate-800 transition border border-slate-700/20"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {/* Master export trigger */}
          <button
            onClick={handleDownloadWav}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-full border border-slate-700 hover:border-slate-600 text-xs text-white font-medium transition cursor-pointer"
            title={uiLanguage === "vi" ? "Tải xuống toàn bộ bản tin thành file WAV" : "Download full summary in high fidelity WAV format"}
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>{pt.exportBtn}</span>
          </button>
        </div>

      </div>

      {/* Share Control & Studio Effects Panel */}
      <div className="bg-slate-50 border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col gap-5 sm:mt-1" id="studio-share-suite">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/60 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-600 animate-pulse" />
              <span>{pt.studioCenter}</span>
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">{pt.studioDesc}</p>
          </div>
          
          {/* Studio Stream Indicator */}
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 self-start shadow-2xs">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isPlaying ? "animate-ping bg-red-500" : "bg-slate-300"
              }`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                isPlaying ? "bg-red-500" : "bg-slate-400"
              }`}></span>
            </span>
            <span className="text-[10px] font-mono font-bold text-slate-600 tracking-wider">
              {isPlaying ? "ON AIR / STREAM SYSTEM" : "STUDIO STANDBY / READY"}
            </span>
          </div>
        </div>

        {/* Studio Mixer: Volume adjust */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white border border-slate-150 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 font-mono">
              <Radio className="w-3.5 h-3.5 text-cyan-500" />
              {pt.studioEfx}
            </span>
            <span className="text-xs text-slate-500 leading-normal">
              {uiLanguage === "vi" 
                ? "Dải sóng âm học được phát chuẩn tần số Mono 24kHz. Phù hợp làm nhạc nền video đăng tải TikTok, mạng xã hội." 
                : "Optimized acoustic soundboard matched with customized multi-speaker voice bands."}
            </span>
          </div>

          <div className="flex flex-col gap-2 justify-center">
            <div className="flex justify-between items-center">
              <label htmlFor="volume-slider" className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 select-none">
                <Volume2 className="w-4 h-4 text-slate-400" />
                <span>{pt.volumeLabel}</span>
              </label>
              <span className="text-xs font-mono font-bold text-cyan-700 bg-cyan-50 border border-cyan-100 rounded-md px-2 py-0.5">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <input
              id="volume-slider"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-cyan-500 hover:accent-cyan-600 transition"
            />
          </div>
        </div>

        {/* Sharing Utility Group */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          
          {/* Copy Transcript Button */}
          <button
            onClick={handleCopyTranscript}
            className={`flex flex-col items-center justify-center p-4 rounded-2xl border text-center transition-all cursor-pointer group hover:shadow-xs active:scale-97 ${
              copied 
                ? "bg-emerald-55/70 border-emerald-300 text-emerald-800 shadow-inner" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300"
            }`}
          >
            {copied ? (
              <Check className="w-5 h-5 text-emerald-600 animate-bounce mb-1" />
            ) : (
              <Copy className="w-5 h-5 text-slate-400 group-hover:text-slate-700 transition mb-1" />
            )}
            <span className="text-xs font-bold">{copied ? pt.copySuccess : pt.copyTranscript}</span>
            <span className="text-[9px] text-slate-400 mt-0.5">
              {uiLanguage === "vi" ? "Lưu toàn bộ kịch bản" : "Send whole script"}
            </span>
          </button>

          {/* Zalo Share Button */}
          <button
            onClick={handleShareZalo}
            className="bg-white border border-slate-200 text-slate-700 hover:bg-[#ebf4ff] hover:border-sky-300 flex flex-col items-center justify-center p-4 rounded-2xl text-center transition-all cursor-pointer group hover:shadow-xs active:scale-97"
            title={uiLanguage === "vi" ? "Chia sẻ nhanh lên Zalo" : "Quick share to Zalo"}
          >
            <MessageSquare className="w-5 h-5 text-sky-500 group-hover:text-sky-600 transition mb-1" />
            <span className="text-xs font-bold text-slate-800">{pt.shareZalo}</span>
            <span className="text-[9px] text-slate-400 mt-0.5">via zalo.me</span>
          </button>

          {/* Facebook Share Button */}
          <button
            onClick={handleShareFacebook}
            className="bg-white border border-slate-200 text-slate-700 hover:bg-[#ecf1ff] hover:border-blue-300 flex flex-col items-center justify-center p-4 rounded-2xl text-center transition-all cursor-pointer group hover:shadow-xs active:scale-97"
            title={uiLanguage === "vi" ? "Chia sẻ nhanh lên Facebook" : "Quick share to Facebook"}
          >
            <Facebook className="w-5 h-5 text-blue-600 group-hover:text-blue-700 transition mb-1" />
            <span className="text-xs font-bold text-slate-800">{pt.shareFacebook}</span>
            <span className="text-[9px] text-slate-400 mt-0.5">via facebook.com</span>
          </button>

          {/* Download Audio trigger configured for TikTok with hover tooltip */}
          <div className="relative group/tooltip flex flex-col">
            <button
              onClick={handleDownloadWav}
              disabled={audioChunks.length === 0}
              className="w-full bg-gradient-to-br from-amber-400 to-amber-500 border border-transparent text-slate-950 hover:from-amber-500 hover:to-amber-600 flex flex-col items-center justify-center p-4 rounded-2xl text-center shadow-xs transition-all cursor-pointer group/btn relative overflow-hidden active:scale-97 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="absolute top-1 right-1 px-1 py-0.5 text-[8px] font-bold font-mono bg-black/10 group-hover/btn:bg-black/15 transition rounded text-amber-900 tracking-wider">
                TikTok
              </span>
              <Download className="w-5 h-5 text-slate-900 transition mb-1" />
              <span className="text-xs font-bold leading-tight">{pt.downloadTiktok}</span>
              <span className="text-[9px] text-amber-950 mt-0.5">
                {uiLanguage === "vi" ? "Tải xuống file âm thanh" : "HQ sound WAV"}
              </span>
            </button>
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-56 p-2.5 bg-slate-950 text-white text-[10px] rounded-lg opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity duration-200 shadow-lg text-center z-20 leading-relaxed border border-slate-700/60">
              {uiLanguage === "vi" 
                ? "Tải file âm thanh chất lượng cao, sau đó đăng lên TikTok cùng video của bạn."
                : "Download high-quality audio file, then post to TikTok along with your video."}
              <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-slate-950"></div>
            </div>
          </div>
        </div>

        {/* Guided Share & Posting helper card */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-slate-500 text-[11px] leading-relaxed relative flex items-start gap-2">
          <span className="text-amber-550 pt-0.5 text-xs animate-bounce">💡</span>
          <div>
            <p className="font-bold text-slate-700 mb-0.5">
              {uiLanguage === "vi" ? "Hướng dẫn chia sẻ & Đăng tải mạng xã hội:" : "Social Media Sharing & Posting Guide:"}
            </p>
            <p className="text-slate-600">
              {uiLanguage === "vi" 
                ? "Bấm Chia sẻ để gửi nhanh bản tin này lên Zalo hoặc Facebook. Đối với TikTok/Reels, hãy tải file âm thanh chất lượng cao (.wav) về máy, sau đó ghép âm thanh này làm nhạc nền vào video sáng tạo của bạn!"
                : "Click Share to quickly post to Zalo or Facebook. For TikTok/Reels, download the high-quality .wav audio file first, then import/mix this background track into your video creation!"}
            </p>
          </div>
        </div>
      </div>

      {/* Read-Along Script Display */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-600" />
            <span>{pt.scriptTitle}</span>
          </h4>
          <span className="text-xs text-slate-550 font-medium">{pt.scriptSub}</span>
        </div>

        <div className="flex flex-col gap-4 max-h-[360px] overflow-y-auto pr-2 custom-scrollbar">
          {allSegments.map((seg, sIdx) => {
            const isActive = activeSegmentIndex === sIdx;
            
            return (
              <div
                key={sIdx}
                onClick={() => handleChapterClick(sIdx)}
                className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer group ${
                  isActive 
                    ? "bg-slate-50 border-cyan-500 shadow-sm" 
                    : "bg-white border-slate-150 hover:bg-slate-50/50 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[10px] font-mono tracking-wider uppercase font-semibold ${
                    isActive ? "text-cyan-700" : "text-slate-400"
                  }`}>
                    {seg.type === "intro" ? pt.labelIntro : seg.type === "outro" ? pt.labelOutro : pt.labelTopic}
                  </span>
                  
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    isActive ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                  }`}>
                    {seg.title}
                  </span>
                </div>

                <p className={`text-sm leading-relaxed transition-colors mt-2 ${
                  isActive ? "text-slate-900 font-medium" : "text-slate-650"
                }`}>
                  {seg.text}
                </p>

                {/* Bullets takeaways (if chapters have them) */}
                {seg.bullets && seg.bullets.length > 0 && (
                  <div className="mt-3 pl-2.5 border-l-2 border-slate-200 flex flex-col gap-1.5">
                    {seg.bullets.map((b, bIdx) => (
                      <div key={bIdx} className="flex gap-2 items-start text-xs text-slate-600">
                        <FileCheck className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
