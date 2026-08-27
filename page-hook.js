(() => {
  if (window.__XVD_HOOK_INSTALLED__) return;
  window.__XVD_HOOK_INSTALLED__ = true;

  const POST_SOURCE = "x-video-downloader-personal";

  function mediaKeyFromUrl(url = "") {
    const match = String(url).match(
      /\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i
    );
    return match ? match[1] : null;
  }

  function emit(variants) {
    const clean = variants
      .filter((v) => v && typeof v.url === "string" && v.url.startsWith("https://video.twimg.com/"))
      .map((v) => ({
        url: v.url,
        bitrate: Number(v.bitrate || 0),
        contentType: v.contentType || v.content_type || "",
        tweetId: v.tweetId ? String(v.tweetId) : null,
        mediaKey: v.mediaKey || mediaKeyFromUrl(v.url)
      }));

    if (!clean.length) return;

    window.postMessage(
      {
        source: POST_SOURCE,
        type: "MEDIA_VARIANTS",
        variants: clean
      },
      "*"
    );
  }

  function scanJson(root) {
    const found = [];
    const seen = new WeakSet();

    function walk(value, contextTweetId = null, depth = 0) {
      if (!value || depth > 60) return;

      if (typeof value === "string") {
        if (
          value.startsWith("https://video.twimg.com/") &&
          (value.includes(".mp4") || value.includes(".webm") || value.includes(".m3u8"))
        ) {
          found.push({
            url: value,
            tweetId: contextTweetId,
            mediaKey: mediaKeyFromUrl(value)
          });
        }
        return;
      }

      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);

      let tweetId = contextTweetId;

      const looksLikeTweet =
        value.__typename === "Tweet" ||
        (value.legacy && typeof value.legacy.full_text === "string") ||
        (value.core && value.legacy && value.rest_id && value.views);

      if (looksLikeTweet && value.rest_id) tweetId = String(value.rest_id);

      if (value.video_info && Array.isArray(value.video_info.variants)) {
        for (const variant of value.video_info.variants) {
          if (!variant?.url) continue;
          found.push({
            url: variant.url,
            bitrate: Number(variant.bitrate || 0),
            contentType: variant.content_type || "",
            tweetId,
            mediaKey: mediaKeyFromUrl(variant.url)
          });
        }
      }

      for (const key of Object.keys(value)) {
        try {
          walk(value[key], tweetId, depth + 1);
        } catch (_) {}
      }
    }

    try {
      walk(root);
      emit(found);
    } catch (_) {}
  }

  function shouldInspect(url) {
    const text = String(url || "");
    return (
      text.includes("/i/api/graphql/") ||
      text.includes("/graphql/") ||
      text.includes("/TweetDetail") ||
      text.includes("/TweetResultByRestId")
    );
  }

  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = function (...args) {
      const requestUrl =
        typeof args[0] === "string"
          ? args[0]
          : args[0] && typeof args[0].url === "string"
            ? args[0].url
            : "";

      const result = originalFetch.apply(this, args);

      if (shouldInspect(requestUrl)) {
        result
          .then((response) => {
            try {
              const clone = response.clone();
              const contentType = clone.headers.get("content-type") || "";
              if (contentType.includes("json")) {
                clone.json().then(scanJson).catch(() => {});
              } else {
                clone.text().then((text) => {
                  if (!text.includes("video.twimg.com")) return;
                  try {
                    scanJson(JSON.parse(text));
                  } catch (_) {}
                }).catch(() => {});
              }
            } catch (_) {}
          })
          .catch(() => {});
      }

      return result;
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR?.prototype) {
    const originalOpen = XHR.prototype.open;
    const originalSend = XHR.prototype.send;

    XHR.prototype.open = function (method, url, ...rest) {
      try {
        this.__xvd_url = String(url || "");
      } catch (_) {}
      return originalOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (...args) {
      if (shouldInspect(this.__xvd_url)) {
        this.addEventListener(
          "load",
          () => {
            try {
              if (this.responseType === "json" && this.response) {
                scanJson(this.response);
                return;
              }

              if (this.responseType === "" || this.responseType === "text") {
                const text = this.responseText || "";
                if (!text.includes("video.twimg.com")) return;
                scanJson(JSON.parse(text));
              }
            } catch (_) {}
          },
          { once: true }
        );
      }

      return originalSend.apply(this, args);
    };
  }

  function emitResourceUrl(url) {
    if (
      typeof url === "string" &&
      url.startsWith("https://video.twimg.com/") &&
      (url.includes(".mp4") || url.includes(".webm") || url.includes(".m3u8"))
    ) {
      emit([{ url }]);
    }
  }

  try {
    for (const entry of performance.getEntriesByType("resource")) {
      emitResourceUrl(entry.name);
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) emitResourceUrl(entry.name);
    });
    observer.observe({ type: "resource", buffered: true });
  } catch (_) {}
})();
