/**
 * Convert a base64 string directly into an ArrayBuffer of 16-bit PCM data.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Concatenate multiple Int16Array PCM buffers into a single buffer.
 */
export function concatenatePcmChunks(chunks: ArrayBuffer[]): ArrayBuffer {
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}

/**
 * Packs 16-bit Mono PCM buffer into a standard RIFF/WAVE container.
 * Sample rate is 24000 Hz, which is the standard output rate of gemini-3.1-flash-tts-preview.
 */
export function encodeWavHeader(pcmBuffer: ArrayBuffer, sampleRate: number = 24000): Blob {
  const headerBuffer = new ArrayBuffer(44);
  const view = new DataView(headerBuffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(0, 'RIFF');
  /* file length (36 + data size) */
  view.setUint32(4, 36 + pcmBuffer.byteLength, true);
  /* format header */
  writeString(8, 'WAVE');
  /* format chunk ID */
  writeString(12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* audio format: Uncompressed PCM = 1 */
  view.setUint16(20, 1, true);
  /* channel count: Mono = 1 */
  view.setUint16(22, 1, true);
  /* sampling frequency */
  view.setUint32(24, sampleRate, true);
  /* transfer rate in bps: sampleRate * channels * bytesPerSample */
  view.setUint32(28, sampleRate * 1 * 2, true);
  /* data block alignment size: channels * bytesPerSample */
  view.setUint16(32, 2, true);
  /* bits per sample rate */
  view.setUint16(34, 16, true);
  /* data subchunk identifier */
  writeString(36, 'data');
  /* content size */
  view.setUint32(40, pcmBuffer.byteLength, true);

  // Return unified audio blob
  return new Blob([headerBuffer, pcmBuffer], { type: 'audio/wav' });
}

/**
 * Read raw 16-bit PCM little-endian buffer and scale to Float32 [-1.0, 1.0] for Web Audio API.
 */
export function pcmToFloat32(pcmBuffer: ArrayBuffer): Float32Array {
  const numSamples = pcmBuffer.byteLength / 2;
  const dataView = new DataView(pcmBuffer);
  const floatArray = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    // 16-bit signed integer limits: -32768 to +32767
    const sample = dataView.getInt16(i * 2, true);
    floatArray[i] = sample < 0 ? sample / 32768.0 : sample / 32767.0;
  }
  return floatArray;
}

/**
 * Generate mock/dummy news text options to quickly populate workspace for testing
 */
export const SAMPLE_ARTICLES_PRESETS = [
  {
    title: "Global Tech Summit: Quantum Leap & Green Energy Solutions",
    content: `At the annual international Technology Summit, leaders from research institutes and tech giants announced breakthroughs in green-energy quantum computers. Dubbed 'NatureQ', the new chip architecture uses superconducting loops operating at slightly warmer temperatures than standard dilution refrigerators, reducing electricity demands by up to 40 percent. 

Furthermore, solar energy storage algorithms have been integrated directly into national smart grids, improving energy transition efficiency by 15 percent over the last fiscal quarter. Industry specialists believe this will speed up computational power while decreasing the ecological footprint of AI data farms. In addition to hardware announcements, the summit held panel debates on safe deployment practices and global technology inclusion programs.`
  },
  {
    title: "The Future of Smart Commuting: Multi-Modal Intelligent Micro-Vehicles",
    content: `As metropolitan areas continue to gridlock under heavy car configurations, city planners are turning to multi-modal micro-transit networks. Over the past twelve months, cities like Tokyo, Amsterdam, and Paris have deployed self-balancing smart e-bikes that synchronize with underground rail schedules. 

Using localized low-latency networks, these vehicles dynamically suggest alternative bicycle path routing when heavy subway congestion occurs. Studies indicate a reduction of up to 25 minutes for average suburban commutes. Public transit authorities are contemplating sliding subsidies to incentivize low-income housing blocks to adopt the micro-transit platform before winter.`
  },
  {
    title: "Astronomic Milestones: Deep Space Water Reserves Detected on Kepler-452 Variant",
    content: `Astrophysicists utilizing high-resolution spectroscope imagery have identified large concentrations of atmospheric water vapor on Kepler-variant exoplanets. The discovery, detailed in the Journal of Outer Space Inquiries, marks the first definitive sign of liquid cycle potential in a near-earth orbit envelope. 

The planet orbits a quiet solar-like star roughly 800 light-years away. Sensor data indicates atmospheric temperatures hover near 22 degrees Celsius, creating stable parameters. Exploration coordinates are scheduled to be adjusted to capture thermal core images in late 2028 when adjacent transit alignments peak.`
  }
];
