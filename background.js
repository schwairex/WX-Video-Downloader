const ext = globalThis.browser ?? globalThis.chrome;

const tabMedia = new Map();

const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_ITEMS_PER_TAB = 900;

function platformFromUrl(url = "") {
  const text = String(url);
  if (
    text.includes("video.twimg.com") ||
    text.includes("x.com") ||
    text.includes("twitter.com")
  ) return "x";

  if (
    text.includes("instagram.com") ||
    text.includes("cdninstagram.com") ||
    text.includes("fbcdn.net")
  ) return "instagram";

  return null;
}

function isAllowedMediaUrl(url = "") {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === "video.twimg.com") return true;
    if (host === "instagram.com" || host.endsWith(".instagram.com")) return true;
    if (host === "cdninstagram.com" || host.endsWith(".cdninstagram.com")) return true;
    if (host === "fbcdn.net" || host.endsWith(".fbcdn.net")) return true;

    return false;
  } catch (_) {
    return false;
  }
}

function twitterMediaKey(url = "") {
  const match = String(url).match(
    /\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i
  );
  return match ? match[1] : null;
}

function getTabStore(tabId) {
  if (!tabMedia.has(tabId)) tabMedia.set(tabId, []);
  return tabMedia.get(tabId);
}

function normalizeVariant(item = {}) {
  if (!item.url || typeof item.url !== "string") return null;
  if (!isAllowedMediaUrl(item.url)) return null;

  const platform = item.platform || platformFromUrl(item.url);
  if (!platform) return null;

  return {
    url: item.url,
    platform,
    bitrate: Number(item.bitrate || 0),
    contentType: item.contentType || item.content_type || "",
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    tweetId: item.tweetId ? String(item.tweetId) : null,
    mediaKey: item.mediaKey || (platform === "x" ? twitterMediaKey(item.url) : null),
    postKey: item.postKey ? String(item.postKey) : null,
    seenAt: Date.now()
  };
}

function addMedia(tabId, item) {
  if (typeof tabId !== "number" || tabId < 0) return;

  const normalized = normalizeVariant(item);
  if (!normalized) return;

  const store = getTabStore(tabId);
  const existing = store.find((x) => x.url === normalized.url);

  if (existing) {
    existing.seenAt = Date.now();
    existing.bitrate = Math.max(existing.bitrate || 0, normalized.bitrate || 0);
    existing.width = Math.max(existing.width || 0, normalized.width || 0);
    existing.height = Math.max(existing.height || 0, normalized.height || 0);
    existing.tweetId = existing.tweetId || normalized.tweetId;
    existing.mediaKey = existing.mediaKey || normalized.mediaKey;
    existing.postKey = existing.postKey || normalized.postKey;
    existing.contentType = existing.contentType || normalized.contentType;
    existing.platform = existing.platform || normalized.platform;
  } else {
    store.push(normalized);
  }

  const cutoff = Date.now() - MAX_AGE_MS;
  const fresh = store.filter((x) => x.seenAt >= cutoff);
  if (fresh.length > MAX_ITEMS_PER_TAB) {
    fresh.splice(0, fresh.length - MAX_ITEMS_PER_TAB);
  }
  tabMedia.set(tabId, fresh);
}

function parseResolutionFromUrl(url = "") {
  const xMatch = String(url).match(/\/(\d{2,5})x(\d{2,5})\//);
  if (xMatch) {
    const width = Number(xMatch[1]);
    const height = Number(xMatch[2]);
    return { width, height };
  }

  const queryMatch = String(url).match(/[?&](?:width|w)=(\d{2,5}).*?[?&](?:height|h)=(\d{2,5})/i);
  if (queryMatch) {
    return { width: Number(queryMatch[1]), height: Number(queryMatch[2]) };
  }

  return { width: 0, height: 0 };
}

function getResolution(item) {
  if (item.width && item.height) {
    return { width: item.width, height: item.height };
  }
  return parseResolutionFromUrl(item.url);
}

function isProgressiveVideo(item) {
  const url = item?.url || "";
  const contentType = (item?.contentType || "").toLowerCase();

  if (/\.m3u8(?:\?|$)/i.test(url)) return false;
  if (contentType.includes("mpegurl")) return false;

  return (
    /\.mp4(?:\?|$)/i.test(url) ||
    /\.webm(?:\?|$)/i.test(url) ||
    contentType.includes("video/mp4") ||
    contentType.includes("video/webm") ||
    (item.platform === "instagram" && isAllowedMediaUrl(url))
  );
}

function variantScore(item) {
  const { width, height } = getResolution(item);
  const pixels = width * height;
  const bitrate = Number(item.bitrate || 0);
  const progressiveBonus = isProgressiveVideo(item) ? 10 ** 15 : 0;
  return progressiveBonus + pixels * 1_000_000 + bitrate;
}

function sanitizePart(value, fallback) {
  const cleaned = String(value || "")
    .replace(/^@/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 90);

  return cleaned || fallback;
}

function addDirectCandidate(candidates, payload) {
  const directUrl = payload?.directUrl;
  if (!directUrl || typeof directUrl !== "string") return;
  if (directUrl.startsWith("blob:")) return;
  if (!isAllowedMediaUrl(directUrl)) return;

  const direct = normalizeVariant({
    url: directUrl,
    platform: payload.platform,
    tweetId: payload.tweetId,
    mediaKey: payload.mediaKey,
    postKey: payload.postKey,
    width: payload.width,
    height: payload.height
  });

  if (direct) candidates.push(direct);
}

function chooseCandidates(store, payload) {
  const platform = payload.platform;
  const candidates = [];

  addDirectCandidate(candidates, payload);

  if (platform === "x") {
    if (payload.mediaKey) {
      candidates.push(
        ...store.filter(
          (x) => x.platform === "x" && x.mediaKey === String(payload.mediaKey)
        )
      );
    }

    if (payload.tweetId) {
      candidates.push(
        ...store.filter(
          (x) => x.platform === "x" && x.tweetId === String(payload.tweetId)
        )
      );
    }
  }

  if (platform === "instagram" && payload.postKey) {
    candidates.push(
      ...store.filter(
        (x) =>
          x.platform === "instagram" &&
          x.postKey === String(payload.postKey)
      )
    );
  }

  if (!candidates.length) {
    const recent = store.filter(
      (x) =>
        x.platform === platform &&
        Date.now() - x.seenAt < 60_000
    );

    if (platform === "x") {
      const families = new Set(recent.map((x) => x.mediaKey).filter(Boolean));
      if (families.size === 1) candidates.push(...recent);
    } else if (platform === "instagram") {
      const posts = new Set(recent.map((x) => x.postKey).filter(Boolean));

      // Individual Reel/Post page fallback.
      if (payload.postKey && posts.size <= 1) {
        candidates.push(...recent);
      } else if (!payload.postKey && posts.size === 1) {
        candidates.push(...recent);
      }
    }
  }

  const deduped = new Map();
  for (const item of candidates.filter(Boolean)) {
    if (!item.url) continue;
    const previous = deduped.get(item.url);
    if (!previous || variantScore(item) > variantScore(previous)) {
      deduped.set(item.url, item);
    }
  }

  return [...deduped.values()];
}

function qualityNumber(item) {
  const { width, height } = getResolution(item);
  if (!width || !height) return 0;
  return Math.min(width, height);
}

function qualityLabel(item) {
  const { width, height } = getResolution(item);
  if (width && height) {
    return `${Math.min(width, height)}p`;
  }

  if (item.bitrate) {
    return `${Math.round(item.bitrate / 1000)} kbps`;
  }

  return "Orijinal";
}

function prepareMenuVariants(candidates) {
  const progressive = candidates
    .filter(isProgressiveVideo)
    .sort((a, b) => variantScore(b) - variantScore(a));

  // Same resolution can appear more than once. Keep the strongest variant.
  const byQuality = new Map();
  const unknown = [];

  for (const item of progressive) {
    const q = qualityNumber(item);
    if (!q) {
      unknown.push(item);
      continue;
    }

    const previous = byQuality.get(q);
    if (!previous || variantScore(item) > variantScore(previous)) {
      byQuality.set(q, item);
    }
  }

  const selected = [
    ...[...byQuality.values()].sort((a, b) => variantScore(b) - variantScore(a)),
    ...unknown.sort((a, b) => variantScore(b) - variantScore(a)).slice(0, byQuality.size ? 1 : 4)
  ];

  return selected.slice(0, 8).map((item, index) => {
    const { width, height } = getResolution(item);
    return {
      url: item.url,
      label: qualityLabel(item),
      width,
      height,
      bitrate: item.bitrate || 0,
      best: index === 0
    };
  });
}

async function getVariants(tabId, payload) {
  const store = getTabStore(tabId);
  const candidates = chooseCandidates(store, payload);
  const variants = prepareMenuVariants(candidates);

  if (!variants.length) {
    const hlsFound = candidates.some((x) => /\.m3u8(?:\?|$)/i.test(x.url));
    return {
      ok: false,
      code: hlsFound ? "STREAM_ONLY" : "NO_VIDEO",
      message: payload.platform === "instagram"
        ? "Instagram video kaynağı henüz yakalanmadı. Videoyu kısa süre oynatıp tekrar deneyin."
        : hlsFound
          ? "Şu anda yalnızca akış kaynağı yakalandı. Videoyu birkaç saniye oynatıp tekrar deneyin."
          : "Video kaynağı henüz yakalanmadı. Videoyu bir kez oynatıp tekrar deneyin."
    };
  }

  return { ok: true, variants };
}

async function downloadSelected(tabId, payload) {
  const url = payload.selectedUrl;
  if (!url || !isAllowedMediaUrl(url)) {
    return { ok: false, message: "Geçersiz video adresi." };
  }

  const store = getTabStore(tabId);
  const known = store.find((item) => item.url === url);
  const item = known || normalizeVariant({
    url,
    platform: payload.platform,
    tweetId: payload.tweetId,
    postKey: payload.postKey,
    mediaKey: payload.mediaKey
  });

  if (!item || !isProgressiveVideo(item)) {
    return { ok: false, message: "Bu kaynak doğrudan indirilebilir video değil." };
  }

  const { width, height } = getResolution(item);
  const quality = width && height ? `${width}x${height}` : qualityLabel(item);
  const ext = /\.webm(?:\?|$)/i.test(url) ? "webm" : "mp4";

  const username = sanitizePart(payload.username, payload.platform === "instagram" ? "instagram" : "x_user");
  const id = sanitizePart(
    payload.platform === "instagram" ? payload.postKey : payload.tweetId,
    "video"
  );

  const qualityPart = width && height
    ? `_${width}x${height}`
    : "";

  const folder = payload.platform === "instagram"
    ? "Instagram-Videos"
    : "X-Videos";

  const filename = `${folder}/${username}_${id}${qualityPart}.${ext}`;

  try {
    const options = {
      url,
      filename,
      saveAs: false
    };

    // Chromium/Firefox support conflictAction. Keep a fallback for browsers
    // that implement a smaller subset of the downloads API.
    let downloadId;
    try {
      downloadId = await ext.downloads.download({
        ...options,
        conflictAction: "uniquify"
      });
    } catch (firstError) {
      downloadId = await ext.downloads.download(options);
    }

    return {
      ok: true,
      downloadId,
      filename,
      quality
    };
  } catch (error) {
    return {
      ok: false,
      code: "DOWNLOAD_FAILED",
      message: error?.message || "İndirme başlatılamadı."
    };
  }
}

ext.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;

    const url = details.url || "";
    const platform = platformFromUrl(url);
    if (!platform) return;

    if (platform === "x") {
      if (
        url.startsWith("https://video.twimg.com/") &&
        (
          /\.mp4(?:\?|$)/i.test(url) ||
          /\.webm(?:\?|$)/i.test(url) ||
          /\.m3u8(?:\?|$)/i.test(url)
        )
      ) {
        addMedia(details.tabId, { url, platform: "x" });
      }
      return;
    }

    if (platform === "instagram") {
      if (
        (
          url.includes("cdninstagram.com") ||
          url.includes("fbcdn.net")
        ) &&
        (
          /\.mp4(?:\?|$)/i.test(url) ||
          url.includes("/v/t16/") ||
          url.includes("/o1/v/")
        )
      ) {
        addMedia(details.tabId, {
          url,
          platform: "instagram",
          contentType: "video/mp4"
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

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message?.type === "CACHE_VARIANTS") {
    if (typeof tabId === "number" && Array.isArray(message.variants)) {
      for (const variant of message.variants) addMedia(tabId, variant);
    }
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "GET_VARIANTS") {
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, message: "Aktif sekme bulunamadı." });
      return;
    }

    getVariants(tabId, message)
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        message: error?.message || "Kalite seçenekleri alınamadı."
      }));

    return true;
  }

  if (message?.type === "DOWNLOAD_SELECTED") {
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, message: "Aktif sekme bulunamadı." });
      return;
    }

    downloadSelected(tabId, message)
      .then(sendResponse)
      .catch((error) => sendResponse({
        ok: false,
        message: error?.message || "Video indirilemedi."
      }));

    return true;
  }
});

ext.tabs?.onRemoved?.addListener((tabId) => {
  tabMedia.delete(tabId);
});
