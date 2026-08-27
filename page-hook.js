(() => {
  if (window.__PERSONAL_VIDEO_DOWNLOADER_HOOK__) return;
  window.__PERSONAL_VIDEO_DOWNLOADER_HOOK__ = true;

  const POST_SOURCE = "personal-social-video-downloader";

  function currentPlatform() {
    return location.hostname.includes("instagram.com") ? "instagram" : "x";
  }

  function currentInstagramCode() {
    const match = location.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/i);
    return match ? match[1] : null;
  }

  function twitterMediaKey(url = "") {
    const match = String(url).match(
      /\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i
    );
    return match ? match[1] : null;
  }

  function looksInstagramVideoUrl(url = "") {
    const text = String(url);
    return (
      (text.includes("cdninstagram.com") || text.includes("fbcdn.net")) &&
      (
        text.includes(".mp4") ||
        text.includes("/v/t16/") ||
        text.includes("/o1/v/")
      )
    );
  }

  function emit(variants) {
    const clean = variants
      .filter((v) => v && typeof v.url === "string")
      .filter((v) => {
        if (v.platform === "x") return v.url.startsWith("https://video.twimg.com/");
        if (v.platform === "instagram") return looksInstagramVideoUrl(v.url);
        return false;
      })
      .map((v) => ({
        url: v.url,
        platform: v.platform,
        bitrate: Number(v.bitrate || 0),
        contentType: v.contentType || v.content_type || "",
        width: Number(v.width || 0),
        height: Number(v.height || 0),
        tweetId: v.tweetId ? String(v.tweetId) : null,
        mediaKey: v.mediaKey || (v.platform === "x" ? twitterMediaKey(v.url) : null),
        postKey: v.postKey ? String(v.postKey) : null
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

  function scanXJson(root) {
    const found = [];
    const seen = new WeakSet();

    function walk(value, contextTweetId = null, depth = 0) {
      if (!value || depth > 60) return;

      if (typeof value === "string") {
        if (
          value.startsWith("https://video.twimg.com/") &&
          (
            value.includes(".mp4") ||
            value.includes(".webm") ||
            value.includes(".m3u8")
          )
        ) {
          found.push({
            url: value,
            platform: "x",
            tweetId: contextTweetId,
            mediaKey: twitterMediaKey(value)
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
        (value.core && value.legacy && value.rest_id);

      if (looksLikeTweet && value.rest_id) tweetId = String(value.rest_id);

      if (value.video_info && Array.isArray(value.video_info.variants)) {
        for (const variant of value.video_info.variants) {
          if (!variant?.url) continue;

          found.push({
            url: variant.url,
            platform: "x",
            bitrate: Number(variant.bitrate || 0),
            contentType: variant.content_type || "",
            tweetId,
            mediaKey: twitterMediaKey(variant.url)
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

  function scanInstagramJson(root) {
    const found = [];
    const seen = new WeakSet();

    function walk(value, contextPostKey = null, depth = 0) {
      if (!value || depth > 70) return;

      if (typeof value === "string") {
        if (looksInstagramVideoUrl(value)) {
          found.push({
            url: value,
            platform: "instagram",
            contentType: "video/mp4",
            postKey: contextPostKey
          });
        }
        return;
      }

      if (typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);

      let postKey = contextPostKey;

      if (typeof value.code === "string" && value.code.length >= 5) {
        postKey = value.code;
      } else if (typeof value.shortcode === "string" && value.shortcode.length >= 5) {
        postKey = value.shortcode;
      }

      if (Array.isArray(value.video_versions)) {
        for (const variant of value.video_versions) {
          if (!variant?.url) continue;

          found.push({
            url: variant.url,
            platform: "instagram",
            contentType: "video/mp4",
            width: Number(variant.width || 0),
            height: Number(variant.height || 0),
            postKey
          });
        }
      }

      if (typeof value.video_url === "string" && looksInstagramVideoUrl(value.video_url)) {
        found.push({
          url: value.video_url,
          platform: "instagram",
          contentType: "video/mp4",
          width: Number(value.dimensions?.width || value.original_width || 0),
          height: Number(value.dimensions?.height || value.original_height || 0),
          postKey
        });
      }

      for (const key of Object.keys(value)) {
        try {
          walk(value[key], postKey, depth + 1);
        } catch (_) {}
      }
    }

    try {
      walk(root, currentInstagramCode());
      emit(found);
    } catch (_) {}
  }

  function scanJson(root) {
    if (currentPlatform() === "instagram") scanInstagramJson(root);
    else scanXJson(root);
  }

  function shouldInspect(url) {
    const text = String(url || "");

    if (currentPlatform() === "instagram") {
      return (
        text.includes("/api/") ||
        text.includes("/graphql") ||
        text.includes("instagram.com")
      );
    }

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
                  const interesting = currentPlatform() === "instagram"
                    ? (
                      text.includes("video_versions") ||
                      text.includes("video_url") ||
                      text.includes("cdninstagram")
                    )
                    : text.includes("video.twimg.com");

                  if (!interesting) return;

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
        this.__personal_vd_url = String(url || "");
      } catch (_) {}

      return originalOpen.call(this, method, url, ...rest);
    };

    XHR.prototype.send = function (...args) {
      if (shouldInspect(this.__personal_vd_url)) {
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
                if (!text) return;

                const interesting = currentPlatform() === "instagram"
                  ? (
                    text.includes("video_versions") ||
                    text.includes("video_url") ||
                    text.includes("cdninstagram")
                  )
                  : text.includes("video.twimg.com");

                if (!interesting) return;

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

  function findJsonArrayEnd(text, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = startIndex; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "[") depth++;
      if (ch === "]") {
        depth--;
        if (depth === 0) return i;
      }
    }

    return -1;
  }

  function extractInstagramCurrentPageScript() {
    if (currentPlatform() !== "instagram") return;

    const code = currentInstagramCode();
    if (!code) return;

    for (const script of document.scripts) {
      const text = script.textContent || "";
      if (
        !text ||
        !text.includes(code) ||
        !text.includes("video_versions")
      ) continue;

      const codeMarkers = [
        `"code":"${code}"`,
        `\\"code\\":\\"${code}\\"`
      ];

      let codeIndex = -1;
      for (const marker of codeMarkers) {
        codeIndex = text.indexOf(marker);
        if (codeIndex >= 0) break;
      }
      if (codeIndex < 0) continue;

      let variantsIndex = text.indexOf('"video_versions":', codeIndex);
      if (variantsIndex < 0) {
        variantsIndex = text.indexOf('\\"video_versions\\":', codeIndex);
      }
      if (variantsIndex < 0) continue;

      // Normal JSON-ish payload.
      let start = text.indexOf("[", variantsIndex);
      if (start >= 0) {
        const end = findJsonArrayEnd(text, start);
        if (end > start) {
          const raw = text.slice(start, end + 1);
          try {
            const versions = JSON.parse(raw);
            emit(
              versions
                .filter((v) => v?.url)
                .map((v) => ({
                  url: v.url,
                  platform: "instagram",
                  contentType: "video/mp4",
                  width: Number(v.width || 0),
                  height: Number(v.height || 0),
                  postKey: code
                }))
            );
            return;
          } catch (_) {}
        }
      }
    }
  }

  function emitResourceUrl(url) {
    if (typeof url !== "string") return;

    if (
      url.startsWith("https://video.twimg.com/") &&
      (
        url.includes(".mp4") ||
        url.includes(".webm") ||
        url.includes(".m3u8")
      )
    ) {
      emit([{
        url,
        platform: "x",
        mediaKey: twitterMediaKey(url)
      }]);
      return;
    }

    if (looksInstagramVideoUrl(url)) {
      emit([{
        url,
        platform: "instagram",
        contentType: "video/mp4",
        postKey: currentInstagramCode()
      }]);
    }
  }

  try {
    for (const entry of performance.getEntriesByType("resource")) {
      emitResourceUrl(entry.name);
    }

    const performanceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        emitResourceUrl(entry.name);
      }
    });

    performanceObserver.observe({ type: "resource", buffered: true });
  } catch (_) {}

  if (currentPlatform() === "instagram") {
    const runScriptScan = () => {
      try {
        extractInstagramCurrentPageScript();
      } catch (_) {}
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runScriptScan, { once: true });
    } else {
      runScriptScan();
    }

    let scans = 0;
    const timer = setInterval(() => {
      runScriptScan();
      scans++;
      if (scans >= 8) clearInterval(timer);
    }, 1000);
  }
})();
