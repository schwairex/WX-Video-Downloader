const browserApi = globalThis.browser ?? globalThis.chrome;

const CACHE_TTL_MS = 12 * 60 * 1000;
const MAX_MEDIA_PER_TAB = 160;
const memoryMedia = new Map();
const pendingPersist = new Map();

function cacheKey(tabId) {
  return `pvd_media_${tabId}`;
}

function platformFromUrl(url = "") {
  const value = String(url);

  if (
    value.includes("video.twimg.com") ||
    value.includes("x.com") ||
    value.includes("twitter.com")
  ) {
    return "x";
  }

  if (
    value.includes("instagram.com") ||
    value.includes("cdninstagram.com") ||
    value.includes("fbcdn.net")
  ) {
    return "instagram";
  }

  return null;
}

function isAllowedMediaUrl(url = "") {
  try {
    const parsed = new URL(String(url).replaceAll("&amp;", "&"));
    const host = parsed.hostname.toLowerCase();

    return (
      host === "video.twimg.com" ||
      host === "instagram.com" ||
      host.endsWith(".instagram.com") ||
      host === "cdninstagram.com" ||
      host.endsWith(".cdninstagram.com") ||
      host === "fbcdn.net" ||
      host.endsWith(".fbcdn.net")
    );
  } catch (_) {
    return false;
  }
}

function canonicalizeInstagramUrl(url = "") {
  try {
    const parsed = new URL(String(url).replaceAll("&amp;", "&"));

    // Instagram's player may request only a byte slice of the original MP4.
    // Saving a bytestart/byteend URL as .mp4 creates a truncated/corrupt file.
    for (const key of [
      "bytestart",
      "byteend",
      "start",
      "end",
      "range",
      "start_offset",
      "end_offset"
    ]) {
      parsed.searchParams.delete(key);
    }

    return parsed.toString();
  } catch (_) {
    return String(url).replaceAll("&amp;", "&");
  }
}

function normalizeUrl(url = "", platform = null) {
  const clean = String(url).replaceAll("&amp;", "&");
  return platform === "instagram" || platformFromUrl(clean) === "instagram"
    ? canonicalizeInstagramUrl(clean)
    : clean;
}

function twitterMediaKey(url = "") {
  const match = String(url).match(
    /\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i
  );
  return match ? match[1] : null;
}

function inferInstagramKind(url = "", contentType = "") {
  const lowerType = String(contentType).toLowerCase();
  const lowerUrl = String(url).toLowerCase();

  if (lowerType.startsWith("image/")) return "image";
  if (lowerType.startsWith("video/")) return "video";

  if (/\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(lowerUrl)) return "image";
  if (/\.(?:mp4|webm)(?:\?|$)/i.test(lowerUrl)) return "video";

  return null;
}

function cleanStore(items) {
  const cutoff = Date.now() - CACHE_TTL_MS;
  const deduped = new Map();

  for (const raw of Array.isArray(items) ? items : []) {
    if (!raw?.url) continue;

    const platform = raw.platform || platformFromUrl(raw.url);
    const url = normalizeUrl(raw.url, platform);
    if (!isAllowedMediaUrl(url)) continue;
    if ((raw.seenAt || 0) < cutoff) continue;

    const item = { ...raw, url, platform };
    const key = `${item.mediaType || ""}|${url}`;
    const old = deduped.get(key);

    if (
      !old ||
      (item.sourcePriority || 0) > (old.sourcePriority || 0) ||
      (item.seenAt || 0) >= (old.seenAt || 0)
    ) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => (a.seenAt || 0) - (b.seenAt || 0))
    .slice(-MAX_MEDIA_PER_TAB);
}

function normalizeVariant(item = {}) {
  if (!item.url || typeof item.url !== "string") return null;

  const platform = item.platform || platformFromUrl(item.url);
  if (!platform) return null;

  const url = normalizeUrl(item.url, platform);
  if (!isAllowedMediaUrl(url)) return null;

  const contentType = item.contentType || item.content_type || "";
  let mediaType = item.mediaType || null;

  if (!mediaType && platform === "instagram") {
    mediaType = inferInstagramKind(url, contentType);
  }

  if (!mediaType && platform === "x") {
    mediaType = "video";
  }

  return {
    url,
    platform,
    mediaType,
    bitrate: Number(item.bitrate || 0),
    contentType,
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    tweetId: item.tweetId ? String(item.tweetId) : null,
    mediaKey:
      item.mediaKey ||
      (platform === "x" ? twitterMediaKey(url) : null),
    postKey: item.postKey ? String(item.postKey) : null,
    contentKind: item.contentKind || null,
    source: item.source || "unknown",
    sourcePriority: Number(item.sourcePriority || 0),
    seenAt: Date.now()
  };
}

async function storageArea() {
  return browserApi?.storage?.session ??
    browserApi?.storage?.local ??
    null;
}

async function hydrateTab(tabId) {
  const memory = cleanStore(memoryMedia.get(tabId) || []);
  const area = await storageArea();

  if (!area?.get) {
    memoryMedia.set(tabId, memory);
    return memory;
  }

  try {
    const data = await area.get(cacheKey(tabId));
    const merged = cleanStore([
      ...memory,
      ...(data?.[cacheKey(tabId)] || [])
    ]);
    memoryMedia.set(tabId, merged);
    return merged;
  } catch (_) {
    return memory;
  }
}

function schedulePersist(tabId) {
  if (pendingPersist.has(tabId)) {
    clearTimeout(pendingPersist.get(tabId));
  }

  pendingPersist.set(
    tabId,
    setTimeout(async () => {
      pendingPersist.delete(tabId);
      const area = await storageArea();
      if (!area?.set) return;

      try {
        await area.set({
          [cacheKey(tabId)]: cleanStore(memoryMedia.get(tabId) || [])
        });
      } catch (_) {}
    }, 180)
  );
}

function addMedia(tabId, item) {
  if (!Number.isInteger(tabId) || tabId < 0) return;

  const normalized = normalizeVariant(item);
  if (!normalized) return;

  const store = cleanStore(memoryMedia.get(tabId) || []);
  const existing = store.find(
    (candidate) =>
      candidate.url === normalized.url &&
      candidate.mediaType === normalized.mediaType
  );

  if (existing) {
    Object.assign(existing, {
      seenAt: Date.now(),
      bitrate: Math.max(
        existing.bitrate || 0,
        normalized.bitrate || 0
      ),
      width: Math.max(
        existing.width || 0,
        normalized.width || 0
      ),
      height: Math.max(
        existing.height || 0,
        normalized.height || 0
      ),
      tweetId: existing.tweetId || normalized.tweetId,
      mediaKey: existing.mediaKey || normalized.mediaKey,
      postKey: existing.postKey || normalized.postKey,
      contentKind: existing.contentKind || normalized.contentKind,
      contentType: existing.contentType || normalized.contentType,
      source:
        (normalized.sourcePriority || 0) >=
        (existing.sourcePriority || 0)
          ? normalized.source
          : existing.source,
      sourcePriority: Math.max(
        existing.sourcePriority || 0,
        normalized.sourcePriority || 0
      )
    });
  } else {
    store.push(normalized);
  }

  memoryMedia.set(tabId, cleanStore(store));
  schedulePersist(tabId);
}

function parseResolution(url = "") {
  const match = String(url).match(/\/(\d{2,5})x(\d{2,5})\//);
  return match
    ? {
        width: Number(match[1]),
        height: Number(match[2])
      }
    : { width: 0, height: 0 };
}

function resolution(item) {
  return item.width && item.height
    ? {
        width: item.width,
        height: item.height
      }
    : parseResolution(item.url);
}

function looksDashOnlyInstagramUrl(url = "") {
  const lower = String(url).toLowerCase();

  return (
    lower.includes("_video_dashinit.mp4") ||
    lower.includes("dashinit") ||
    lower.includes("video_dash_manifest") ||
    /\/t50\./i.test(lower)
  );
}

function isVideoCandidate(item) {
  if (!item || item.mediaType === "image") return false;

  const url = item.url || "";
  const contentType = String(item.contentType || "").toLowerCase();

  if (/\.m3u8(?:\?|$)/i.test(url)) return false;
  if (contentType.includes("mpegurl")) return false;

  if (
    item.platform === "instagram" &&
    looksDashOnlyInstagramUrl(url)
  ) {
    return false;
  }

  return (
    /\.(?:mp4|webm)(?:\?|$)/i.test(url) ||
    contentType.startsWith("video/") ||
    item.mediaType === "video"
  );
}

function isImageCandidate(item) {
  if (!item || item.platform !== "instagram") return false;

  const contentType = String(item.contentType || "").toLowerCase();

  return (
    item.mediaType === "image" ||
    contentType.startsWith("image/") ||
    /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(item.url || "")
  );
}

function candidateScore(item) {
  const { width, height } = resolution(item);
  const pixels = width * height;
  const sourceBonus = Number(item.sourcePriority || 0) * 10 ** 16;
  const typeBonus =
    isVideoCandidate(item) || isImageCandidate(item)
      ? 10 ** 15
      : 0;

  return (
    sourceBonus +
    typeBonus +
    pixels * 1_000_000 +
    Number(item.bitrate || 0)
  );
}

function sanitize(value, fallback) {
  const cleaned = String(value || "")
    .replace(/^@/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);

  return cleaned || fallback;
}

function chooseCandidates(store, payload) {
  const output = [];

  if (
    payload.directUrl &&
    !String(payload.directUrl).startsWith("blob:") &&
    isAllowedMediaUrl(payload.directUrl)
  ) {
    output.push(
      normalizeVariant({
        ...payload,
        url: payload.directUrl,
        source: "dom",
        sourcePriority: 75
      })
    );
  }

  if (payload.platform === "x") {
    if (payload.mediaKey) {
      output.push(
        ...store.filter(
          (item) =>
            item.platform === "x" &&
            item.mediaKey === String(payload.mediaKey)
        )
      );
    }

    if (payload.tweetId) {
      output.push(
        ...store.filter(
          (item) =>
            item.platform === "x" &&
            item.tweetId === String(payload.tweetId)
        )
      );
    }
  }

  if (payload.platform === "instagram") {
    if (payload.postKey) {
      output.push(
        ...store.filter(
          (item) =>
            item.platform === "instagram" &&
            item.postKey === String(payload.postKey)
        )
      );
    }
  }

  if (!output.filter(Boolean).length) {
    const recent = store.filter(
      (item) =>
        item.platform === payload.platform &&
        Date.now() - (item.seenAt || 0) < 20_000
    );

    output.push(...recent.slice(-24));
  }

  const deduped = new Map();

  for (const item of output.filter(Boolean)) {
    const normalized = normalizeVariant(item);
    if (!normalized) continue;

    const key = `${normalized.mediaType || ""}|${normalized.url}`;
    const old = deduped.get(key);

    if (!old || candidateScore(normalized) > candidateScore(old)) {
      deduped.set(key, normalized);
    }
  }

  return [...deduped.values()];
}

function qualityLabel(item) {
  const { width, height } = resolution(item);

  if (width && height) {
    return `${Math.min(width, height)}p`;
  }

  if (item.bitrate) {
    return `${Math.round(item.bitrate / 1000)} kbps`;
  }

  return item.mediaType === "image"
    ? "Orijinal Görsel"
    : "Orijinal";
}

function menuVariants(candidates, requestedMediaType = "video") {
  const filtered =
    requestedMediaType === "image"
      ? candidates.filter(isImageCandidate)
      : candidates.filter(isVideoCandidate);

  const sorted = filtered.sort(
    (a, b) => candidateScore(b) - candidateScore(a)
  );

  const byQuality = new Map();
  const unknown = [];

  for (const item of sorted) {
    const { width, height } = resolution(item);
    const quality =
      width && height
        ? `${Math.min(width, height)}:${width}x${height}`
        : null;

    if (!quality) {
      unknown.push(item);
      continue;
    }

    if (!byQuality.has(quality)) {
      byQuality.set(quality, item);
    }
  }

  // For Instagram, an API/Relay progressive URL is much safer than a raw
  // observed player request. Keep only one unknown original unless there
  // are real resolution variants.
  const selected = [
    ...byQuality.values(),
    ...unknown.slice(0, byQuality.size ? 0 : 1)
  ].slice(0, 8);

  return selected.map((item, index) => {
    const dimensions = resolution(item);

    return {
      url: item.url,
      label: qualityLabel(item),
      width: dimensions.width,
      height: dimensions.height,
      bitrate: item.bitrate || 0,
      best: index === 0,
      cleanSource: true,
      mediaType: requestedMediaType,
      source: item.source || "unknown"
    };
  });
}

async function getVariants(tabId, payload) {
  const store = await hydrateTab(tabId);
  const candidates = chooseCandidates(store, payload);

  const requestedMediaType =
    payload.mediaType === "image"
      ? "image"
      : "video";

  const variants = menuVariants(
    candidates,
    requestedMediaType
  );

  if (!variants.length) {
    return {
      ok: false,
      code:
        requestedMediaType === "image"
          ? "NO_IMAGE"
          : "NO_VIDEO",
      message:
        requestedMediaType === "image"
          ? "Hikâye görseli henüz yakalanmadı. Hikâyeyi açık tutup Tekrar Dene seçeneğine bas."
          : "Video kaynağı henüz yakalanmadı. Videoyu kısa süre oynatıp Tekrar Dene seçeneğine bas."
    };
  }

  return {
    ok: true,
    mediaType: requestedMediaType,
    variants
  };
}

function hasMp4Signature(bytes) {
  if (!bytes || bytes.length < 12) return false;

  const ascii = (start, length) =>
    String.fromCharCode(...bytes.slice(start, start + length));

  // Standard MP4: size (4 bytes) + "ftyp".
  if (ascii(4, 4) === "ftyp") return true;

  // Some ISO BMFF files can begin with compatible boxes.
  for (const marker of ["ftyp", "styp", "moov", "moof"]) {
    const text = ascii(0, Math.min(bytes.length, 64));
    if (text.includes(marker)) return true;
  }

  return false;
}

function hasWebmSignature(bytes) {
  return (
    bytes?.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

function hasJpegSignature(bytes) {
  return (
    bytes?.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function hasPngSignature(bytes) {
  return (
    bytes?.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function hasWebpSignature(bytes) {
  if (!bytes || bytes.length < 12) return false;

  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));

  return riff === "RIFF" && webp === "WEBP";
}

async function validateRemoteMedia(url, mediaType) {
  const canonicalUrl = normalizeUrl(url, platformFromUrl(url));

  try {
    const response = await fetch(canonicalUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      headers: {
        Range: "bytes=0-4095"
      }
    });

    if (!response.ok && response.status !== 206) {
      return {
        ok: false,
        code: "MEDIA_HTTP_ERROR",
        message: `Medya sunucusu ${response.status} yanıtı verdi.`
      };
    }

    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer.slice(0, 4096));

    if (mediaType === "image") {
      const validImage =
        contentType.startsWith("image/") ||
        hasJpegSignature(bytes) ||
        hasPngSignature(bytes) ||
        hasWebpSignature(bytes);

      if (!validImage) {
        return {
          ok: false,
          code: "INVALID_IMAGE_SOURCE",
          message:
            "Instagram gerçek görsel dosyası yerine geçersiz bir yanıt döndürdü."
        };
      }

      return {
        ok: true,
        url: canonicalUrl,
        contentType,
        detectedType: "image"
      };
    }

    const validVideo =
      contentType.startsWith("video/") ||
      hasMp4Signature(bytes) ||
      hasWebmSignature(bytes);

    if (!validVideo) {
      return {
        ok: false,
        code: "INVALID_VIDEO_SOURCE",
        message:
          "Instagram gerçek video yerine oturum/HTML yanıtı döndürdü. Hikâyeyi veya videoyu açık tutup tekrar dene."
      };
    }

    return {
      ok: true,
      url: canonicalUrl,
      contentType,
      detectedType:
        hasWebmSignature(bytes)
          ? "webm"
          : "mp4"
    };
  } catch (error) {
    return {
      ok: false,
      code: "MEDIA_VALIDATION_FAILED",
      message:
        error?.message ||
        "Medya kaynağı doğrulanamadı."
    };
  }
}

function extensionFromContentType(
  contentType = "",
  fallback = "bin"
) {
  const type = String(contentType).toLowerCase();

  if (type.includes("video/webm")) return "webm";
  if (type.includes("video/mp4")) return "mp4";
  if (type.includes("image/jpeg")) return "jpg";
  if (type.includes("image/png")) return "png";
  if (type.includes("image/webp")) return "webp";
  if (type.includes("image/avif")) return "avif";

  return fallback;
}

async function notificationsEnabled() {
  try {
    const data = await browserApi.storage.local.get(
      "pvd_settings"
    );

    return data?.pvd_settings?.notifications !== false;
  } catch (_) {
    return true;
  }
}

async function notify(title, message) {
  if (
    !browserApi?.notifications?.create ||
    !(await notificationsEnabled())
  ) {
    return;
  }

  try {
    await browserApi.notifications.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title,
      message
    });
  } catch (_) {}
}

async function downloadSelected(tabId, payload) {
  const selectedUrl = payload.selectedUrl;
  const requestedMediaType =
    payload.mediaType === "image"
      ? "image"
      : "video";

  if (
    !selectedUrl ||
    !isAllowedMediaUrl(selectedUrl)
  ) {
    return {
      ok: false,
      message: "Geçersiz medya adresi."
    };
  }

  const store = await hydrateTab(tabId);
  const item =
    store.find(
      (candidate) =>
        candidate.url ===
        normalizeUrl(selectedUrl, payload.platform)
    ) ||
    normalizeVariant({
      ...payload,
      url: selectedUrl,
      mediaType: requestedMediaType
    });

  if (!item) {
    return {
      ok: false,
      message: "Medya kaynağı bulunamadı."
    };
  }

  if (
    requestedMediaType === "video" &&
    !isVideoCandidate(item)
  ) {
    return {
      ok: false,
      message:
        "Doğrudan indirilebilir video kaynağı bulunamadı."
    };
  }

  if (
    requestedMediaType === "image" &&
    !isImageCandidate(item)
  ) {
    return {
      ok: false,
      message:
        "Doğrudan indirilebilir görsel kaynağı bulunamadı."
    };
  }

  let finalUrl = normalizeUrl(
    item.url,
    payload.platform
  );

  let validation = {
    ok: true,
    url: finalUrl,
    contentType: item.contentType || ""
  };

  // Instagram URLs are signed and may originate from partial player
  // requests. Validate bytes before creating a file with .mp4/.jpg.
  if (payload.platform === "instagram") {
    validation = await validateRemoteMedia(
      finalUrl,
      requestedMediaType
    );

    if (!validation.ok) {
      await notify(
        "Instagram medyası doğrulanamadı",
        validation.message
      );

      return validation;
    }

    finalUrl = validation.url;
  }

  const { width, height } = resolution(item);
  const quality =
    width && height
      ? `${width}x${height}`
      : qualityLabel(item);

  let fallbackExtension =
    requestedMediaType === "image"
      ? "jpg"
      : /\.webm(?:\?|$)/i.test(finalUrl)
        ? "webm"
        : "mp4";

  const fileExtension =
    extensionFromContentType(
      validation.contentType,
      fallbackExtension
    );

  const username = sanitize(
    payload.username,
    payload.platform === "instagram"
      ? "instagram"
      : "x_user"
  );

  const fallbackId =
    payload.contentKind === "story"
      ? `story_${Date.now()}`
      : `media_${Date.now()}`;

  const id = sanitize(
    payload.platform === "instagram"
      ? payload.postKey
      : payload.tweetId,
    fallbackId
  );

  const dimensions =
    width && height
      ? `_${width}x${height}`
      : "";

  let folder =
    payload.platform === "instagram"
      ? "Instagram-Videos"
      : "X-Videos";

  if (
    payload.platform === "instagram" &&
    payload.contentKind === "story"
  ) {
    folder =
      requestedMediaType === "image"
        ? "Instagram-Stories/Images"
        : "Instagram-Stories/Videos";
  }

  const filename =
    `${folder}/${username}_${id}${dimensions}.${fileExtension}`;

  try {
    if (!browserApi?.downloads?.download) {
      return {
        ok: false,
        message:
          "Tarayıcının indirme API'si kullanılamıyor."
      };
    }

    const downloadId =
      await browserApi.downloads.download({
        url: finalUrl,
        filename,
        saveAs: false,
        conflictAction: "uniquify"
      });

    return {
      ok: true,
      downloadId,
      filename,
      quality,
      mediaType: requestedMediaType
    };
  } catch (error) {
    console.error(
      "[PVD] download failed",
      error
    );

    await notify(
      "İndirme başlatılamadı",
      error?.message ||
        "Ağ veya tarayıcı kaynaklı bir hata oluştu."
    );

    return {
      ok: false,
      message:
        error?.message ||
        "İndirme başlatılamadı."
    };
  }
}

async function ensureOffscreen() {
  if (!browserApi?.offscreen?.createDocument) {
    return false;
  }

  try {
    if (
      browserApi.offscreen.hasDocument &&
      (await browserApi.offscreen.hasDocument())
    ) {
      return true;
    }

    await browserApi.offscreen.createDocument({
      url: "audio.html",
      reasons: ["AUDIO_PLAYBACK"],
      justification:
        "Convert a user-selected accessible video audio track locally."
    });

    return true;
  } catch (error) {
    if (
      String(error).includes("single offscreen")
    ) {
      return true;
    }

    return false;
  }
}

async function extractAudio(tabId, payload) {
  const store = await hydrateTab(tabId);
  const candidates = chooseCandidates(
    store,
    payload
  )
    .filter(isVideoCandidate)
    .sort(
      (a, b) =>
        candidateScore(b) -
        candidateScore(a)
    );

  const source = candidates[0];

  if (!source) {
    return {
      ok: false,
      message:
        "Ses çıkarılacak video kaynağı bulunamadı."
    };
  }

  let sourceUrl = source.url;

  if (payload.platform === "instagram") {
    const validation =
      await validateRemoteMedia(
        sourceUrl,
        "video"
      );

    if (!validation.ok) {
      return validation;
    }

    sourceUrl = validation.url;
  }

  const filenameBase =
    `Audio/${sanitize(
      payload.username,
      "media"
    )}_${sanitize(
      payload.platform === "instagram"
        ? payload.postKey
        : payload.tweetId,
      "audio"
    )}`;

  const offscreen = await ensureOffscreen();

  if (!offscreen) {
    return {
      ok: false,
      code: "AUDIO_ENGINE_UNAVAILABLE",
      message:
        "Bu tarayıcıda yerel ses dönüştürme motoru kullanılamıyor."
    };
  }

  try {
    const converted =
      await browserApi.runtime.sendMessage({
        type: "AUDIO_PROCESS",
        url: sourceUrl,
        filenameBase
      });

    if (!converted?.ok) {
      return converted || {
        ok: false,
        message: "MP3 oluşturulamadı."
      };
    }

    if (!converted.blobUrl) {
      return {
        ok: false,
        message:
          "MP3 çıktısı oluşturulamadı."
      };
    }

    const downloadId =
      await browserApi.downloads.download({
        url: converted.blobUrl,
        filename: `${filenameBase}.mp3`,
        saveAs: false,
        conflictAction: "uniquify"
      });

    return {
      ok: true,
      downloadId,
      message:
        "MP3 oluşturuldu ve indirme başladı."
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error?.message ||
        "Ses çıkarma işlemi başlatılamadı."
    };
  }
}

// Capture only useful media requests. Raw Instagram byte-range URLs are
// canonicalized before entering the cache.
browserApi.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const rawUrl = details.url || "";
    const platform = platformFromUrl(rawUrl);

    if (!platform) return;

    if (
      platform === "x" &&
      rawUrl.startsWith(
        "https://video.twimg.com/"
      ) &&
      (
        /\.(?:mp4|webm)(?:\?|$)/i.test(
          rawUrl
        ) ||
        /\.m3u8(?:\?|$)/i.test(rawUrl)
      )
    ) {
      addMedia(details.tabId, {
        url: rawUrl,
        platform: "x",
        mediaType: "video",
        source: "network",
        sourcePriority: 30
      });

      return;
    }

    if (
      platform === "instagram" &&
      (
        rawUrl.includes("cdninstagram.com") ||
        rawUrl.includes("fbcdn.net")
      )
    ) {
      const url =
        canonicalizeInstagramUrl(rawUrl);

      const lower = url.toLowerCase();

      if (
        (
          /\.mp4(?:\?|$)/i.test(lower) ||
          lower.includes("/v/t16/") ||
          lower.includes("/o1/v/")
        ) &&
        !looksDashOnlyInstagramUrl(lower)
      ) {
        addMedia(details.tabId, {
          url,
          platform: "instagram",
          mediaType: "video",
          contentType: "video/mp4",
          source: "network",
          sourcePriority: 25
        });
      }

      if (
        /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(
          lower
        )
      ) {
        addMedia(details.tabId, {
          url,
          platform: "instagram",
          mediaType: "image",
          source: "network",
          sourcePriority: 15
        });
      }
    }
  },
  {
    urls: [
      "https://video.twimg.com/*",
      "https://*.cdninstagram.com/*",
      "https://*.fbcdn.net/*"
    ]
  }
);

browserApi.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    const tabId =
      sender.tab?.id ??
      message?.tabId;

    if (message?.type === "CACHE_VARIANTS") {
      if (
        Number.isInteger(tabId) &&
        Array.isArray(message.variants)
      ) {
        for (const variant of message.variants) {
          addMedia(tabId, variant);
        }
      }

      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "GET_VARIANTS") {
      if (!Number.isInteger(tabId)) {
        sendResponse({
          ok: false,
          message: "Aktif sekme bulunamadı."
        });
        return;
      }

      getVariants(tabId, message)
        .then(sendResponse);
      return true;
    }

    if (
      message?.type === "DOWNLOAD_SELECTED"
    ) {
      if (!Number.isInteger(tabId)) {
        sendResponse({
          ok: false,
          message: "Aktif sekme bulunamadı."
        });
        return;
      }

      downloadSelected(tabId, message)
        .then(sendResponse);
      return true;
    }

    if (message?.type === "EXTRACT_AUDIO") {
      if (!Number.isInteger(tabId)) {
        sendResponse({
          ok: false,
          message: "Aktif sekme bulunamadı."
        });
        return;
      }

      extractAudio(tabId, message)
        .then(sendResponse);
      return true;
    }

    if (message?.type === "OPEN_URL") {
      browserApi.tabs
        .create({ url: message.url })
        .then(() =>
          sendResponse({ ok: true })
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            message: error.message
          })
        );

      return true;
    }

    if (
      message?.type === "GET_ACTIVE_TAB"
    ) {
      browserApi.tabs
        .query({
          active: true,
          currentWindow: true
        })
        .then((tabs) =>
          sendResponse({
            ok: true,
            tab: tabs[0] || null
          })
        )
        .catch((error) =>
          sendResponse({
            ok: false,
            message: error.message
          })
        );

      return true;
    }
  }
);

browserApi.tabs?.onRemoved?.addListener(
  async (tabId) => {
    memoryMedia.delete(tabId);

    const area = await storageArea();

    try {
      await area?.remove?.(
        cacheKey(tabId)
      );
    } catch (_) {}
  }
);

browserApi.downloads?.onChanged?.addListener(
  async (delta) => {
    if (!delta?.state?.current) return;

    if (
      delta.state.current === "complete"
    ) {
      try {
        const items =
          await browserApi.downloads.search({
            id: delta.id
          });

        const name =
          (
            items?.[0]?.filename || ""
          )
            .split(/[\\/]/)
            .pop() || "Dosya";

        await notify(
          "İndirme tamamlandı",
          name
        );
      } catch (_) {
        await notify(
          "İndirme tamamlandı",
          "Dosya başarıyla kaydedildi."
        );
      }
    } else if (
      delta.state.current === "interrupted"
    ) {
      await notify(
        "İndirme kesildi",
        "Ağ veya tarayıcı kaynaklı bir hata nedeniyle indirme tamamlanamadı."
      );
    }
  }
);
