(() => {
  const POST_SOURCE = "x-video-downloader-personal";
  const OVERLAY_BUTTON_CLASS = "xvd-overlay-button";
  const ARTICLE_MARK_ATTR = "data-xvd-ready";
  const MEDIA_MARK_ATTR = "data-xvd-overlay-ready";

  function mediaKeyFromUrl(url = "") {
    const match = String(url).match(
      /\/(?:ext_tw_video(?:_thumb)?|ext_tw_video|amplify_video(?:_thumb)?|amplify_video|tweet_video(?:_thumb)?|tweet_video)\/(\d+)/i
    );
    return match ? match[1] : null;
  }

  function parseTweet(article) {
    const links = [...article.querySelectorAll('a[href*="/status/"]')];

    for (const link of links) {
      try {
        const url = new URL(link.href, location.href);
        const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
        if (match) {
          return {
            username: match[1],
            tweetId: match[2]
          };
        }
      } catch (_) {}
    }

    const statusMatch = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    if (statusMatch) {
      return {
        username: statusMatch[1],
        tweetId: statusMatch[2]
      };
    }

    return {
      username: "x_user",
      tweetId: "video"
    };
  }

  function getVideoInfo(article) {
    const video = article.querySelector("video");
    if (!video) return null;

    const possibleUrls = [video.currentSrc, video.src, video.poster].filter(Boolean);

    for (const img of article.querySelectorAll("img")) {
      const src = img.currentSrc || img.src || "";
      if (
        src.includes("video_thumb") ||
        src.includes("ext_tw_video") ||
        src.includes("amplify_video")
      ) {
        possibleUrls.push(src);
      }
    }

    let mediaKey = null;
    for (const url of possibleUrls) {
      mediaKey = mediaKeyFromUrl(url);
      if (mediaKey) break;
    }

    const directUrl = [video.currentSrc, video.src].find(
      (url) => typeof url === "string" && url.startsWith("https://video.twimg.com/")
    );

    return {
      video,
      mediaKey,
      directUrl: directUrl || null
    };
  }

  function showToast(text, kind = "info") {
    const previous = document.querySelector(".xvd-toast");
    if (previous) previous.remove();

    const toast = document.createElement("div");
    toast.className = `xvd-toast xvd-toast-${kind}`;
    toast.textContent = text;
    document.documentElement.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("xvd-toast-show"));

    setTimeout(() => {
      toast.classList.remove("xvd-toast-show");
      setTimeout(() => toast.remove(), 220);
    }, 2600);
  }

  function setButtonState(button, state) {
    button.dataset.state = state;

    const label = button.querySelector(".xvd-button-label");
    if (!label) return;

    if (state === "loading") label.textContent = "Hazırlanıyor";
    else if (state === "done") label.textContent = "İndirildi";
    else label.textContent = "Videoyu indir";
  }

  function findMediaContainer(article) {
    const video = article.querySelector("video");
    if (!video) return null;

    let node = video.parentElement;
    while (node && node !== article) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);

      if (
        rect.width > 180 &&
        rect.height > 120 &&
        (style.overflow === "hidden" || style.borderRadius !== "0px")
      ) {
        return node;
      }

      node = node.parentElement;
    }

    return video.parentElement;
  }

  async function handleDownload(article, button) {
    const info = getVideoInfo(article);
    if (!info) {
      showToast("Bu gönderide indirilebilir video bulunamadı.", "error");
      return;
    }

    const tweet = parseTweet(article);
    setButtonState(button, "loading");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_VIDEO",
        username: tweet.username,
        tweetId: tweet.tweetId,
        mediaKey: info.mediaKey,
        directUrl: info.directUrl
      });

      if (response?.ok) {
        setButtonState(button, "done");
        showToast(`İndirme başladı${response.quality ? ` • ${response.quality}` : ""}`, "success");
        setTimeout(() => setButtonState(button, "idle"), 1800);
      } else {
        setButtonState(button, "idle");
        showToast(response?.message || "Video indirilemedi.", "error");
      }
    } catch (error) {
      setButtonState(button, "idle");
      showToast(error?.message || "Video indirilemedi.", "error");
    }
  }

  function makeOverlayButton(article) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = OVERLAY_BUTTON_CLASS;
    button.setAttribute("aria-label", "Videoyu indir");
    button.setAttribute("title", "Videoyu indir");
    button.innerHTML = `
      <span class="xvd-button-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M11 4a1 1 0 0 1 2 0v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.42l2.3 2.3V4ZM5 18a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"></path>
        </svg>
      </span>
      <span class="xvd-button-label">Videoyu indir</span>
    `;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.state === "loading") return;
      await handleDownload(article, button);
    });

    return button;
  }

  function ensureOverlay(article) {
    const mediaContainer = findMediaContainer(article);
    if (!mediaContainer) return;

    if (mediaContainer.getAttribute(MEDIA_MARK_ATTR) === "1") return;
    if (mediaContainer.querySelector(`.${OVERLAY_BUTTON_CLASS}`)) {
      mediaContainer.setAttribute(MEDIA_MARK_ATTR, "1");
      return;
    }

    const style = window.getComputedStyle(mediaContainer);
    if (style.position === "static") {
      mediaContainer.style.position = "relative";
    }

    const overlay = document.createElement("div");
    overlay.className = "xvd-overlay-anchor";
    overlay.appendChild(makeOverlayButton(article));
    mediaContainer.appendChild(overlay);

    mediaContainer.setAttribute(MEDIA_MARK_ATTR, "1");
  }

  function enhanceArticle(article) {
    if (!(article instanceof HTMLElement)) return;
    if (!article.querySelector("video")) return;

    ensureOverlay(article);
    article.setAttribute(ARTICLE_MARK_ATTR, "1");
  }

  function scan() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(enhanceArticle);
  }

  let scanQueued = false;
  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(() => {
      scanQueued = false;
      scan();
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== POST_SOURCE) return;
    if (event.data?.type !== "MEDIA_VARIANTS") return;
    if (!Array.isArray(event.data.variants) || !event.data.variants.length) return;

    chrome.runtime
      .sendMessage({
        type: "CACHE_VARIANTS",
        variants: event.data.variants
      })
      .catch(() => {});
  });

  const observer = new MutationObserver(queueScan);

  function start() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    queueScan();
  }

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
