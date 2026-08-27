const tabMedia = new Map();

const MAX_AGE_MS = 20 * 60 * 1000;
const MAX_ITEMS_PER_TAB = 500;

function getTabStore(tabId) {
  if (!tabMedia.has(tabId)) tabMedia.set(tabId, []);
  return tabMedia.get(tabId);
}

function mediaKeyFromUrl(url = "") {
  const match = String(url).match(
    /\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i
  );
  return match ? match[1] : null;
}

function normalizeVariant(item = {}) {
  if (!item.url || typeof item.url !== "string") return null;
  if (!item.url.startsWith("https://video.twimg.com/")) return null;

  return {
    url: item.url,
    bitrate: Number(item.bitrate || 0),
    contentType: item.contentType || item.content_type || "",
    tweetId: item.tweetId ? String(item.tweetId) : null,
    mediaKey: item.mediaKey || mediaKeyFromUrl(item.url),
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
    existing.tweetId = existing.tweetId || normalized.tweetId;
    existing.mediaKey = existing.mediaKey || normalized.mediaKey;
    existing.contentType = existing.contentType || normalized.contentType;
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

function parseResolution(url = "") {
  const match = String(url).match(/\/(\d{2,5})x(\d{2,5})\//);
  if (!match) return { width: 0, height: 0, pixels: 0 };
  const width = Number(match[1]);
  const height = Number(match[2]);
  return { width, height, pixels: width * height };
}

function isProgressiveVideo(item) {
  const url = item?.url || "";
  const contentType = (item?.contentType || "").toLowerCase();
  return (
    /\.mp4(?:\?|$)/i.test(url) ||
    /\.webm(?:\?|$)/i.test(url) ||
    contentType.includes("video/mp4") ||
    contentType.includes("video/webm")
  );
}

function score(item) {
  const { pixels } = parseResolution(item.url);
  const bitrate = Number(item.bitrate || 0);
  const avcBonus = /\/avc1\//i.test(item.url) ? 10_000 : 0;
  return pixels * 1_000_000 + bitrate + avcBonus;
}

function sanitizePart(value, fallback) {
  const cleaned = String(value || "")
    .replace(/^@/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function chooseCandidates(store, { mediaKey, tweetId, directUrl }) {
  const candidates = [];

  if (directUrl && directUrl.startsWith("https://video.twimg.com/")) {
    candidates.push(
      normalizeVariant({
        url: directUrl,
        mediaKey: mediaKey || mediaKeyFromUrl(directUrl),
        tweetId
      })
    );
  }

  if (mediaKey) {
    candidates.push(...store.filter((x) => x.mediaKey === String(mediaKey)));
  }

  if (tweetId) {
    candidates.push(...store.filter((x) => x.tweetId === String(tweetId)));
  }

  // Fallback only when the tab has a single recently detected media family.
  if (!candidates.length) {
    const recent = store.filter((x) => Date.now() - x.seenAt < 45_000);
    const families = new Set(recent.map((x) => x.mediaKey).filter(Boolean));
    if (families.size === 1) candidates.push(...recent);
  }

  const deduped = new Map();
  for (const item of candidates.filter(Boolean)) deduped.set(item.url, item);
  return [...deduped.values()];
}

async function startDownload(tabId, payload) {
  const store = getTabStore(tabId);
  const candidates = chooseCandidates(store, payload);
  const progressive = candidates.filter(isProgressiveVideo).sort((a, b) => score(b) - score(a));

  if (!progressive.length) {
    const hlsFound = candidates.some((x) => /\.m3u8(?:\?|$)/i.test(x.url));
    return {
      ok: false,
      code: hlsFound ? "HLS_ONLY" : "NO_VIDEO",
      message: hlsFound
        ? "Bu videoda şu anda yalnızca HLS akışı yakalandı. Videoyu birkaç saniye oynatıp tekrar deneyin."
        : "Video kaynağı henüz yakalanmadı. Videoyu bir kez oynatıp tekrar deneyin."
    };
  }

  const best = progressive[0];
  const { width, height } = parseResolution(best.url);

  const username = sanitizePart(payload.username, "x_user");
  const tweetId = sanitizePart(payload.tweetId, "video");
  const quality = width && height ? `_${width}x${height}` : "";
  const ext = /\.webm(?:\?|$)/i.test(best.url) ? "webm" : "mp4";
  const filename = `X-Videos/${username}_${tweetId}${quality}.${ext}`;

  try {
    const downloadId = await chrome.downloads.download({
      url: best.url,
      filename,
      saveAs: false,
      conflictAction: "uniquify"
    });

    return {
      ok: true,
      downloadId,
      filename,
      quality: width && height ? `${width}x${height}` : "best"
    };
  } catch (error) {
    return {
      ok: false,
      code: "DOWNLOAD_FAILED",
      message: error?.message || "İndirme başlatılamadı."
    };
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const url = details.url || "";
    if (!url.startsWith("https://video.twimg.com/")) return;

    if (
      /\.mp4(?:\?|$)/i.test(url) ||
      /\.webm(?:\?|$)/i.test(url) ||
      /\.m3u8(?:\?|$)/i.test(url)
    ) {
      addMedia(details.tabId, { url });
    }
  },
  { urls: ["https://video.twimg.com/*"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message?.type === "CACHE_VARIANTS") {
    if (typeof tabId === "number" && Array.isArray(message.variants)) {
      for (const variant of message.variants) addMedia(tabId, variant);
    }
    sendResponse({ ok: true });
    return;
  }

  if (message?.type === "DOWNLOAD_VIDEO") {
    if (typeof tabId !== "number") {
      sendResponse({ ok: false, message: "Aktif X sekmesi bulunamadı." });
      return;
    }

    startDownload(tabId, message)
      .then(sendResponse)
      .catch((error) =>
        sendResponse({
          ok: false,
          code: "UNKNOWN",
          message: error?.message || "Beklenmeyen bir hata oluştu."
        })
      );

    return true;
  }
});

chrome.tabs?.onRemoved?.addListener((tabId) => {
  tabMedia.delete(tabId);
});
