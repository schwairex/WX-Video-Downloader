(() => {
  const POST_SOURCE = "personal-social-video-downloader";
  const BUTTON_CLASS = "pvd-overlay-button";
  const MENU_CLASS = "pvd-quality-menu";
  const MEDIA_MARK_ATTR = "data-pvd-overlay-ready";

  function platform() {
    return location.hostname.includes("instagram.com") ? "instagram" : "x";
  }

  function twitterMediaKey(url = "") {
    const match = String(url).match(
      /\/(?:ext_tw_video(?:_thumb)?|ext_tw_video|amplify_video(?:_thumb)?|amplify_video|tweet_video(?:_thumb)?|tweet_video)\/(\d+)/i
    );
    return match ? match[1] : null;
  }

  function parseXPost(scope) {
    const links = [...scope.querySelectorAll('a[href*="/status/"]')];

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

    const match = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    return match
      ? { username: match[1], tweetId: match[2] }
      : { username: "x_user", tweetId: "video" };
  }

  function parseInstagramPost(scope) {
    const links = [...scope.querySelectorAll('a[href]')];

    for (const link of links) {
      try {
        const url = new URL(link.href, location.href);
        const post = url.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/i);
        if (post) {
          return {
            postKey: post[1],
            username: findInstagramUsername(scope)
          };
        }
      } catch (_) {}
    }

    const current = location.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/i);

    return {
      postKey: current ? current[1] : null,
      username: findInstagramUsername(scope)
    };
  }

  function findInstagramUsername(scope) {
    const blocked = new Set([
      "accounts", "direct", "explore", "reel", "reels", "p",
      "stories", "about", "legal", "web", "challenge"
    ]);

    const links = [...scope.querySelectorAll('a[href]')];

    for (const link of links) {
      try {
        const url = new URL(link.href, location.href);
        const match = url.pathname.match(/^\/([^/]+)\/$/);
        if (!match) continue;

        const candidate = match[1];
        if (!blocked.has(candidate.toLowerCase())) return candidate;
      } catch (_) {}
    }

    return "instagram";
  }

  function getVideoInfo(scope) {
    const video = scope.querySelector("video");
    if (!video) return null;

    const directUrl = [video.currentSrc, video.src].find(
      (url) =>
        typeof url === "string" &&
        url.startsWith("http") &&
        !url.startsWith("blob:")
    );

    if (platform() === "x") {
      const possibleUrls = [
        video.currentSrc,
        video.src,
        video.poster
      ].filter(Boolean);

      for (const img of scope.querySelectorAll("img")) {
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
        mediaKey = twitterMediaKey(url);
        if (mediaKey) break;
      }

      return { video, directUrl: directUrl || null, mediaKey };
    }

    return {
      video,
      directUrl: directUrl || null,
      mediaKey: null
    };
  }

  function showToast(text, kind = "info") {
    const previous = document.querySelector(".pvd-toast");
    if (previous) previous.remove();

    const toast = document.createElement("div");
    toast.className = `pvd-toast pvd-toast-${kind}`;
    toast.textContent = text;
    document.documentElement.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add("pvd-toast-show"));

    setTimeout(() => {
      toast.classList.remove("pvd-toast-show");
      setTimeout(() => toast.remove(), 220);
    }, 2800);
  }

  function closeAllMenus(except = null) {
    document.querySelectorAll(`.${MENU_CLASS}`).forEach((menu) => {
      if (menu !== except) menu.remove();
    });
  }

  function setButtonState(button, state) {
    button.dataset.state = state;
    const label = button.querySelector(".pvd-button-label");
    if (!label) return;

    if (state === "loading") label.textContent = "Hazırlanıyor";
    else if (state === "done") label.textContent = "İndirildi";
    else label.textContent = "İndir";
  }

  function findMediaContainer(video, scope) {
    const videoRect = video.getBoundingClientRect();
    let node = video.parentElement;
    let best = video.parentElement;
    let depth = 0;

    while (node && node !== scope.parentElement && depth < 8) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);

      const similarWidth =
        videoRect.width > 0 &&
        rect.width >= videoRect.width * 0.85 &&
        rect.width <= videoRect.width * 1.35;

      const similarHeight =
        videoRect.height > 0 &&
        rect.height >= videoRect.height * 0.75 &&
        rect.height <= videoRect.height * 1.35;

      if (
        rect.width > 180 &&
        rect.height > 120 &&
        similarWidth &&
        similarHeight
      ) {
        best = node;

        if (
          style.overflow === "hidden" ||
          parseFloat(style.borderRadius || "0") > 0
        ) {
          return node;
        }
      }

      node = node.parentElement;
      depth++;
    }

    return best || video.parentElement;
  }

  function buildRequestData(scope) {
    const info = getVideoInfo(scope);
    if (!info) return null;

    if (platform() === "x") {
      const post = parseXPost(scope);
      return {
        platform: "x",
        username: post.username,
        tweetId: post.tweetId,
        mediaKey: info.mediaKey,
        directUrl: info.directUrl
      };
    }

    const post = parseInstagramPost(scope);
    return {
      platform: "instagram",
      username: post.username,
      postKey: post.postKey,
      directUrl: info.directUrl
    };
  }

  async function downloadVariant(scope, button, variant) {
    const data = buildRequestData(scope);
    if (!data) return;

    closeAllMenus();
    setButtonState(button, "loading");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "DOWNLOAD_SELECTED",
        ...data,
        selectedUrl: variant.url
      });

      if (response?.ok) {
        setButtonState(button, "done");
        showToast(
          `İndirme başladı${response.quality ? ` • ${response.quality}` : ""}`,
          "success"
        );

        setTimeout(() => setButtonState(button, "idle"), 1700);
      } else {
        setButtonState(button, "idle");
        showToast(response?.message || "Video indirilemedi.", "error");
      }
    } catch (error) {
      setButtonState(button, "idle");
      showToast(error?.message || "Video indirilemedi.", "error");
    }
  }

  function renderQualityMenu(anchor, scope, button, variants) {
    closeAllMenus();

    const menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.setAttribute("role", "menu");

    const title = document.createElement("div");
    title.className = "pvd-quality-title";
    title.textContent = "Kalite seç";
    menu.appendChild(title);

    for (const variant of variants) {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "pvd-quality-option";
      option.setAttribute("role", "menuitem");

      const dimensions =
        variant.width && variant.height
          ? `${variant.width}×${variant.height}`
          : "";

      option.innerHTML = `
        <span class="pvd-quality-main">
          <span class="pvd-quality-label">${escapeHtml(variant.label)}</span>
          ${variant.best ? '<span class="pvd-best-badge">EN İYİ</span>' : ""}
        </span>
        ${dimensions ? `<span class="pvd-quality-dimensions">${escapeHtml(dimensions)}</span>` : ""}
      `;

      option.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        downloadVariant(scope, button, variant);
      });

      menu.appendChild(option);
    }

    anchor.appendChild(menu);

    requestAnimationFrame(() => {
      menu.classList.add("pvd-quality-menu-show");
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function openQualityMenu(scope, button, anchor) {
    if (anchor.querySelector(`.${MENU_CLASS}`)) {
      closeAllMenus();
      return;
    }

    const data = buildRequestData(scope);
    if (!data) {
      showToast("Bu alanda indirilebilir video bulunamadı.", "error");
      return;
    }

    setButtonState(button, "loading");

    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_VARIANTS",
        ...data
      });

      setButtonState(button, "idle");

      if (!response?.ok) {
        showToast(response?.message || "Kalite seçenekleri bulunamadı.", "error");
        return;
      }

      renderQualityMenu(anchor, scope, button, response.variants || []);
    } catch (error) {
      setButtonState(button, "idle");
      showToast(error?.message || "Kalite seçenekleri alınamadı.", "error");
    }
  }

  function makeOverlayButton(scope, anchor) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = BUTTON_CLASS;
    button.setAttribute("aria-label", "Video indirme seçeneklerini aç");
    button.setAttribute("title", "Videoyu indir");

    button.innerHTML = `
      <span class="pvd-button-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M11 4a1 1 0 0 1 2 0v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.42l2.3 2.3V4ZM5 18a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"></path>
        </svg>
      </span>
      <span class="pvd-button-label">İndir</span>
      <span class="pvd-chevron" aria-hidden="true">
        <svg viewBox="0 0 20 20" width="13" height="13">
          <path d="M5.6 7.6a1 1 0 0 1 1.4 0l3 3 3-3a1 1 0 1 1 1.4 1.4l-3.7 3.7a1 1 0 0 1-1.4 0L5.6 9a1 1 0 0 1 0-1.4Z"></path>
        </svg>
      </span>
    `;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.state === "loading") return;
      await openQualityMenu(scope, button, anchor);
    });

    return button;
  }

  function installOverlay(scope) {
    if (!(scope instanceof HTMLElement)) return;

    const video = scope.querySelector("video");
    if (!video) return;

    const container = findMediaContainer(video, scope);
    if (!container) return;
    if (container.getAttribute(MEDIA_MARK_ATTR) === "1") return;

    if (container.querySelector(`.${BUTTON_CLASS}`)) {
      container.setAttribute(MEDIA_MARK_ATTR, "1");
      return;
    }

    const style = window.getComputedStyle(container);
    if (style.position === "static") {
      container.style.position = "relative";
    }

    const anchor = document.createElement("div");
    anchor.className = "pvd-overlay-anchor";
    anchor.appendChild(makeOverlayButton(scope, anchor));
    container.appendChild(anchor);

    container.setAttribute(MEDIA_MARK_ATTR, "1");
  }

  function scanX() {
    document
      .querySelectorAll('article[data-testid="tweet"]')
      .forEach(installOverlay);
  }

  function scanInstagram() {
    const articles = [...document.querySelectorAll("article")].filter((article) =>
      article.querySelector("video")
    );

    for (const article of articles) {
      installOverlay(article);
    }

    // Individual post/reel pages or Reels viewer can render outside <article>.
    if (/^\/(?:reel|reels|p)\//i.test(location.pathname)) {
      const videos = [...document.querySelectorAll("main video, video")];

      for (const video of videos) {
        if (video.closest("article")) continue;

        let scope = video.parentElement;
        let steps = 0;

        while (
          scope?.parentElement &&
          steps < 6 &&
          scope.parentElement !== document.body
        ) {
          const rect = scope.getBoundingClientRect();
          if (rect.width > 280 && rect.height > 220) break;
          scope = scope.parentElement;
          steps++;
        }

        if (scope) installOverlay(scope);
      }
    }
  }

  function scan() {
    if (platform() === "instagram") scanInstagram();
    else scanX();
  }

  let queued = false;
  function queueScan() {
    if (queued) return;
    queued = true;

    requestAnimationFrame(() => {
      queued = false;
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

  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(`.${BUTTON_CLASS}`) &&
      !event.target.closest(`.${MENU_CLASS}`)
    ) {
      closeAllMenus();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllMenus();
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
