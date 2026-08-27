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
  const requestedMediaType =
    payload.mediaType === "image"
      ? "image"
      : "video";

  // v1.4.0: hot path is memory-first. MEDIA_VARIANTS messages populate
  // memory immediately; storage hydration is only used when memory has no
  // usable source. This removes the extension-storage round trip from the
  // normal quality-menu path.
  const memoryStore = cleanStore(memoryMedia.get(tabId) || []);
  let candidates = chooseCandidates(memoryStore, payload);
  let variants = menuVariants(candidates, requestedMediaType);

  if (!variants.length) {
    const hydratedStore = await hydrateTab(tabId);
    candidates = chooseCandidates(hydratedStore, payload);
    variants = menuVariants(candidates, requestedMediaType);
  }

  if (!variants.length) {
    return {
      ok: false,
      code:
        requestedMediaType === "image"
          ? "NO_IMAGE"
          : "NO_VIDEO",
      message:
        requestedMediaType === "image"
          ? "Hikâye görseli henüz yakalanmadı."
          : "Video kaynağı henüz yakalanmadı."
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



function sameMediaFamily(candidate, payload, selectedItem) {
  if (!candidate || candidate.platform !== payload.platform) return false;

  const requestedMediaType =
    payload.mediaType === "image" ? "image" : "video";

  if (candidate.mediaType && candidate.mediaType !== requestedMediaType) {
    return false;
  }

  if (payload.platform === "x") {
    if (payload.mediaKey && candidate.mediaKey) {
      return String(candidate.mediaKey) === String(payload.mediaKey);
    }

    if (payload.tweetId && candidate.tweetId) {
      return String(candidate.tweetId) === String(payload.tweetId);
    }

    return candidate.url === selectedItem.url;
  }

  if (payload.platform === "instagram") {
    if (payload.postKey && candidate.postKey) {
      return String(candidate.postKey) === String(payload.postKey);
    }

    return candidate.url === selectedItem.url;
  }

  return false;
}

function makeDownloadToken(payload) {
  return String(
    payload.downloadToken ||
    `pvd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  );
}

async function sendDownloadStatus(tabId, status) {
  if (!Number.isInteger(tabId) || !browserApi?.tabs?.sendMessage) return;

  try {
    await browserApi.tabs.sendMessage(tabId, {
      type: "PVD_DOWNLOAD_STATUS",
      ...status
    });
  } catch (_) {
    // The native browser download continues even if the page was navigated
    // away from or its old content script was replaced.
  }
}

function sourceConfidence(item) {
  const source = String(item?.source || "");

  if (source === "video_versions") return 500;
  if (source === "video_url") return 460;
  if (source === "api") return 440;
  if (source === "api-string") return 400;
  if (source === "dom") return 360;
  if (source === "resource") return 260;
  if (source === "network") return 220;

  return Number(item?.sourcePriority || 0);
}

function orderDownloadCandidates(candidates, payload, selectedItem) {
  const selectedResolution = resolution(selectedItem);
  const selectedPixels =
    selectedResolution.width * selectedResolution.height;

  return [...candidates].sort((a, b) => {
    if (payload.platform === "x") {
      // On X, the exact bitrate/quality URL selected by the user should win.
      if (a.url === selectedItem.url) return -1;
      if (b.url === selectedItem.url) return 1;
    }

    // On Instagram, progressive API/Relay URLs are more reliable than a
    // player-observed request. Prefer those first, while still trying to keep
    // the selected resolution.
    const confidenceDelta =
      sourceConfidence(b) - sourceConfidence(a);

    if (confidenceDelta) return confidenceDelta;

    const ar = resolution(a);
    const br = resolution(b);

    const aPixels = ar.width * ar.height;
    const bPixels = br.width * br.height;

    const aDistance =
      selectedPixels && aPixels
        ? Math.abs(aPixels - selectedPixels)
        : Number.MAX_SAFE_INTEGER;

    const bDistance =
      selectedPixels && bPixels
        ? Math.abs(bPixels - selectedPixels)
        : Number.MAX_SAFE_INTEGER;

    return (
      aDistance - bDistance ||
      candidateScore(b) - candidateScore(a)
    );
  });
}

function buildCandidateFilename(candidate, payload, requestedMediaType) {
  const finalUrl = normalizeUrl(candidate.url, payload.platform);
  const { width, height } = resolution(candidate);

  const quality =
    width && height
      ? `${width}x${height}`
      : qualityLabel(candidate);

  const fallbackExtension =
    requestedMediaType === "image"
      ? "jpg"
      : /\.webm(?:\?|$)/i.test(finalUrl)
        ? "webm"
        : "mp4";

  const fileExtension = extensionFromContentType(
    candidate.contentType || "",
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

  return {
    url: finalUrl,
    filename:
      `${folder}/${username}_${id}${dimensions}.${fileExtension}`,
    quality
  };
}

async function startNativeDownload(url, filename) {
  if (!browserApi?.downloads?.download) {
    throw new Error("Tarayıcının indirme API'si kullanılamıyor.");
  }

  // v1.5.1 revised build: start the browser download immediately and avoid
  // opening the Save As dialog on every click. This removes the long perceived
  // delay some Instagram URLs caused before the picker appeared.
  const options = {
    url,
    filename,
    saveAs: false
  };

  try {
    return await browserApi.downloads.download({
      ...options,
      conflictAction: "uniquify"
    });
  } catch (error) {
    // Portable fallback for WebExtension implementations with a smaller
    // DownloadOptions surface.
    try {
      return await browserApi.downloads.download(options);
    } catch (_) {
      throw error;
    }
  }
}

function prepareSelectedDownload(tabId, payload) {
  const selectedUrl = normalizeUrl(
    payload.selectedUrl || "",
    payload.platform
  );

  const requestedMediaType =
    payload.mediaType === "image" ? "image" : "video";

  if (!selectedUrl || !isAllowedMediaUrl(selectedUrl)) {
    return {
      ok: false,
      code: "INVALID_URL",
      message: "Geçersiz medya adresi."
    };
  }

  const selectedVariant =
    payload.selectedVariant &&
    normalizeUrl(payload.selectedVariant.url || "", payload.platform) === selectedUrl
      ? payload.selectedVariant
      : {};

  const memoryStore = cleanStore(memoryMedia.get(tabId) || []);

  const memoryItem = memoryStore.find(
    (candidate) =>
      normalizeUrl(candidate.url, candidate.platform) === selectedUrl
  );

  const selectedItem =
    memoryItem ||
    normalizeVariant({
      ...payload,
      ...selectedVariant,
      url: selectedUrl,
      mediaType: requestedMediaType,
      source:
        selectedVariant.source ||
        "ui-selected",
      sourcePriority:
        Number(selectedVariant.sourcePriority || 100)
    });

  if (!selectedItem) {
    return {
      ok: false,
      code: "NO_MEDIA",
      message: "Medya kaynağı bulunamadı."
    };
  }

  if (
    requestedMediaType === "video" &&
    !isVideoCandidate(selectedItem)
  ) {
    return {
      ok: false,
      code: "NOT_VIDEO",
      message: "Seçilen kaynak indirilebilir video değil."
    };
  }

  if (
    requestedMediaType === "image" &&
    !isImageCandidate(selectedItem)
  ) {
    return {
      ok: false,
      code: "NOT_IMAGE",
      message: "Seçilen kaynak indirilebilir görsel değil."
    };
  }

  const sameFamily = memoryStore
    .filter((candidate) =>
      sameMediaFamily(candidate, payload, selectedItem)
    )
    .filter((candidate) =>
      requestedMediaType === "image"
        ? isImageCandidate(candidate)
        : isVideoCandidate(candidate)
    );

  const candidateMap = new Map();

  for (const candidate of [selectedItem, ...sameFamily]) {
    if (!candidate?.url) continue;

    const normalizedUrl =
      normalizeUrl(candidate.url, payload.platform);

    const existing = candidateMap.get(normalizedUrl);

    if (
      !existing ||
      sourceConfidence(candidate) > sourceConfidence(existing)
    ) {
      candidateMap.set(normalizedUrl, {
        ...candidate,
        url: normalizedUrl
      });
    }
  }

  const candidates = orderDownloadCandidates(
    [...candidateMap.values()],
    payload,
    selectedItem
  ).slice(0, 5);

  if (!candidates.length) {
    return {
      ok: false,
      code: "NO_CANDIDATE",
      message: "İndirilebilir medya kaynağı bulunamadı."
    };
  }

  return {
    ok: true,
    requestedMediaType,
    candidates
  };
}

async function runPreparedDownload(tabId, payload, token, prepared) {
  let lastError = null;

  for (const candidate of prepared.candidates) {
    const target = buildCandidateFilename(
      candidate,
      payload,
      prepared.requestedMediaType
    );

    try {
      const downloadId = await startNativeDownload(
        target.url,
        target.filename
      );

      await sendDownloadStatus(tabId, {
        token,
        status: "started",
        downloadId,
        filename: target.filename,
        quality: target.quality,
        mediaType: prepared.requestedMediaType
      });

      return;
    } catch (error) {
      lastError = error;

      console.warn(
        "[PVD] download candidate rejected",
        candidate.source,
        error
      );
    }
  }

  const message =
    lastError?.message ||
    "Tarayıcı indirmeyi başlatamadı.";

  await sendDownloadStatus(tabId, {
    token,
    status: "error",
    message
  });

  await notify(
    "İndirme başlatılamadı",
    message
  );
}

function queueSelectedDownload(tabId, payload) {
  const prepared = prepareSelectedDownload(tabId, payload);

  if (!prepared.ok) {
    return prepared;
  }

  const token = makeDownloadToken(payload);

  // v1.5.1 revised build: no second prepare pass and no save dialog wait.
  // We queue the already-prepared candidates immediately.
  void runPreparedDownload(tabId, payload, token, prepared);

  return {
    ok: true,
    queued: true,
    token,
    message: "İndirme başlatıldı."
  };
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
        message: "Ses dosyası oluşturulamadı."
      };
    }

    if (!converted.blobUrl) {
      return {
        ok: false,
        message:
          "Ses çıktısı oluşturulamadı."
      };
    }

    const extension =
      converted.extension === "aac"
        ? "aac"
        : "wav";

    const downloadId =
      await browserApi.downloads.download({
        url: converted.blobUrl,
        filename: `${filenameBase}.${extension}`,
        saveAs: false,
        conflictAction: "uniquify"
      });

    return {
      ok: true,
      downloadId,
      audioFormat: converted.format || extension.toUpperCase(),
      message:
        `${converted.format || extension.toUpperCase()} ses dosyası oluşturuldu ve indirme başladı.`
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


async function dispatchRuntimeRequest(message, tabId) {
  if (message?.type === "PING") {
    return {
      ok: true,
      version: "1.5.1",
      now: Date.now()
    };
  }

  if (message?.type === "CACHE_VARIANTS") {
    if (
      Number.isInteger(tabId) &&
      Array.isArray(message.variants)
    ) {
      for (const variant of message.variants) {
        addMedia(tabId, variant);
      }
    }

    return { ok: true };
  }

  if (message?.type === "GET_VARIANTS") {
    if (!Number.isInteger(tabId)) {
      return {
        ok: false,
        message: "Aktif sekme bulunamadı."
      };
    }

    return await getVariants(tabId, message);
  }

  if (message?.type === "DOWNLOAD_SELECTED") {
    if (!Number.isInteger(tabId)) {
      return {
        ok: false,
        message: "Aktif sekme bulunamadı."
      };
    }

    return queueSelectedDownload(tabId, message);
  }

  if (message?.type === "EXTRACT_AUDIO") {
    if (!Number.isInteger(tabId)) {
      return {
        ok: false,
        message: "Aktif sekme bulunamadı."
      };
    }

    return await extractAudio(tabId, message);
  }

  if (message?.type === "OPEN_URL") {
    try {
      await browserApi.tabs.create({ url: message.url });
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        message: error?.message || "Sekme açılamadı."
      };
    }
  }

  if (message?.type === "GET_ACTIVE_TAB") {
    try {
      const tabs = await browserApi.tabs.query({
        active: true,
        currentWindow: true
      });

      return {
        ok: true,
        tab: tabs[0] || null
      };
    } catch (error) {
      return {
        ok: false,
        message: error?.message || "Aktif sekme alınamadı."
      };
    }
  }

  return {
    ok: false,
    code: "UNKNOWN_REQUEST",
    message: "Bilinmeyen eklenti isteği."
  };
}

browserApi.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    const tabId =
      sender.tab?.id ??
      message?.tabId;

    Promise.resolve(
      dispatchRuntimeRequest(message, tabId)
    )
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          code: "BACKGROUND_ERROR",
          message:
            error?.message ||
            "Eklenti arka planında beklenmeyen bir hata oluştu."
        })
      );

    return true;
  }
);

// v1.5.0: a reconnectable long-lived channel is the primary transport for
// in-page controls. Instagram is a SPA and can recycle large parts of its DOM;
// using a Port plus retry logic avoids transient "Receiving end does not exist"
// failures seen with one-shot messages.
browserApi.runtime.onConnect.addListener((port) => {
  if (port.name !== "pvd-control-v151") return;

  port.onMessage.addListener((packet) => {
    if (
      packet?.type !== "PVD_REQUEST" ||
      !packet.requestId
    ) {
      return;
    }

    const tabId =
      port.sender?.tab?.id ??
      packet.payload?.tabId;

    Promise.resolve(
      dispatchRuntimeRequest(packet.payload, tabId)
    )
      .then((response) => {
        try {
          port.postMessage({
            type: "PVD_RESPONSE",
            requestId: packet.requestId,
            response
          });
        } catch (_) {}
      })
      .catch((error) => {
        try {
          port.postMessage({
            type: "PVD_RESPONSE",
            requestId: packet.requestId,
            response: {
              ok: false,
              code: "BACKGROUND_ERROR",
              message:
                error?.message ||
                "Eklenti arka planında beklenmeyen bir hata oluştu."
            }
          });
        } catch (_) {}
      });
  });
});

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
