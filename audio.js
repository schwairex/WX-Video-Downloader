const api = globalThis.browser ?? globalThis.chrome;

function clampSample(value) {
  return Math.max(-1, Math.min(1, value));
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}

function audioBufferToWav(audioBuffer) {
  const channels = Math.min(2, audioBuffer.numberOfChannels || 1);
  const sampleRate = audioBuffer.sampleRate;
  const frames = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = [];
  for (let channel = 0; channel < channels; channel++) {
    channelData.push(audioBuffer.getChannelData(channel));
  }

  let offset = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = clampSample(channelData[channel][frame] || 0);
      const pcm = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function makePlanarChunk(audioBuffer, start, frameCount, channels) {
  const data = new Float32Array(frameCount * channels);

  for (let channel = 0; channel < channels; channel++) {
    const source = audioBuffer.getChannelData(channel);
    data.set(source.subarray(start, start + frameCount), channel * frameCount);
  }

  return data;
}

async function encodeAacAdts(audioBuffer) {
  if (
    typeof AudioEncoder === "undefined" ||
    typeof AudioData === "undefined"
  ) {
    return null;
  }

  const channels = Math.min(2, audioBuffer.numberOfChannels || 1);
  const sampleRate = audioBuffer.sampleRate;
  const config = {
    codec: "mp4a.40.2",
    sampleRate,
    numberOfChannels: channels,
    bitrate: 192000,
    bitrateMode: "constant",
    aac: { format: "adts" }
  };

  let support;
  try {
    support = await AudioEncoder.isConfigSupported(config);
  } catch (_) {
    return null;
  }

  if (!support?.supported) return null;

  const chunks = [];
  let encoderError = null;

  const encoder = new AudioEncoder({
    output(chunk) {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      chunks.push(bytes);
    },
    error(error) {
      encoderError = error;
    }
  });

  encoder.configure(config);

  // AAC frames naturally use 1024 PCM samples. Batching multiple AAC frames
  // reduces JS overhead while keeping memory pressure modest.
  const BATCH_FRAMES = 8192;
  const channelsToUse = channels;

  for (let start = 0; start < audioBuffer.length; start += BATCH_FRAMES) {
    const frameCount = Math.min(BATCH_FRAMES, audioBuffer.length - start);
    const data = makePlanarChunk(
      audioBuffer,
      start,
      frameCount,
      channelsToUse
    );

    const audioData = new AudioData({
      format: "f32-planar",
      sampleRate,
      numberOfFrames: frameCount,
      numberOfChannels: channelsToUse,
      timestamp: Math.round((start / sampleRate) * 1_000_000),
      data
    });

    encoder.encode(audioData);
    audioData.close();

    // Keep the queue from growing indefinitely on long videos.
    if (encoder.encodeQueueSize > 8) {
      await encoder.flush();
      if (encoderError) throw encoderError;
    }
  }

  await encoder.flush();
  encoder.close();

  if (encoderError) throw encoderError;
  if (!chunks.length) return null;

  return new Blob(chunks, { type: "audio/aac" });
}

async function decodeMedia(url) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    redirect: "follow"
  });

  if (!response.ok) {
    throw new Error(`Medya alınamadı (${response.status})`);
  }

  const bytes = await response.arrayBuffer();
  const AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext;

  if (!AudioCtx) {
    throw new Error("Tarayıcı ses çözme motorunu desteklemiyor.");
  }

  const context = new AudioCtx();

  try {
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    await context.close().catch(() => {});
  }
}

async function processAudio(url) {
  const decoded = await decodeMedia(url);

  // Preferred zero-setup path: native AAC/ADTS through WebCodecs.
  try {
    const aac = await encodeAacAdts(decoded);

    if (aac?.size) {
      const blobUrl = URL.createObjectURL(aac);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 180000);

      return {
        ok: true,
        blobUrl,
        extension: "aac",
        format: "AAC",
        mimeType: "audio/aac",
        size: aac.size
      };
    }
  } catch (error) {
    console.warn("[PVD] Native AAC export unavailable; using WAV.", error);
  }

  // Universal built-in fallback: lossless PCM WAV.
  const wav = audioBufferToWav(decoded);
  const blobUrl = URL.createObjectURL(wav);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 180000);

  return {
    ok: true,
    blobUrl,
    extension: "wav",
    format: "WAV",
    mimeType: "audio/wav",
    size: wav.size
  };
}

api.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "AUDIO_PROCESS") return;

  processAudio(message.url)
    .then(respond)
    .catch((error) =>
      respond({
        ok: false,
        message: error?.message || "Ses dosyası oluşturulamadı."
      })
    );

  return true;
});
