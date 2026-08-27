(() => {
  const browserApi = globalThis.browser ?? globalThis.chrome;

  const POST_SOURCE = "personal-social-video-downloader";
  const BUTTON_CLASS = "pvd-overlay-button";
  const MENU_CLASS = "pvd-quality-menu";
  const PORTAL_CLASS = "pvd-overlay-portal";

  const overlayEntries = new Map();
  let updateQueued = false;

  async function sendExtensionMessage(message) {
    if (!browserApi?.runtime?.sendMessage) {
      throw new Error("Eklenti arka plan servisine erişilemiyor.");
    }

    return await browserApi.runtime.sendMessage(message);
  }

  function platform() {
    return location.hostname.includes("instagram.com") ? "instagram" : "x";
  }

  function twitterMediaKey(url = "") {
    const match = String(url).match(
      /\/(?:ext_tw_video(?:_thumb)?|ext_tw_video|amplify_video(?:_thumb)?|amplify_video|tweet_video(?:_thumb)?|tweet_video)\/(\d+)/i
    );
    return match ? match[1] : null;
  }

  function isVisibleVideo(video) {
    if (!(video instanceof HTMLVideoElement)) return false;
    if (!video.isConnected) return false;

    const rect = video.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 100) return false;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) return false;
    if (rect.right <= 0 || rect.left >= window.innerWidth) return false;

    const style = getComputedStyle(video);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (Number(style.opacity || 1) === 0) return false;

    return true;
  }

  function closestUsefulInstagramScope(video) {
    let node = video.parentElement;
    let fallback = video.parentElement;
    let depth = 0;

    while (node && node !== document.body && depth < 12) {
      fallback = node;

      const hasPostLink = node.querySelector(
        'a[href*="/reel/"], a[href*="/reels/"], a[href^="/p/"], a[href*="/p/"]'
      );

      if (hasPostLink) return node;
      if (node.tagName === "ARTICLE") return node;

      node = node.parentElement;
      depth++;
    }

    return fallback || document.body;
  }

  function getScopeForVideo(video) {
    if (platform() === "x") {
      return video.closest('article[data-testid="tweet"]') ||
        video.closest("article") ||
        video.parentElement ||
        document.body;
    }

    return closestUsefulInstagramScope(video);
  }

  function parseXPost(video) {
    const scope = getScopeForVideo(video);
    const links = [...scope.querySelectorAll('a[href*="/status/"]')];

    for (const link of links) {
      try {
        const url = new URL(link.href, location.href);
        const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
        if (match) {
          return { username: match[1], tweetId: match[2] };
        }
      } catch (_) {}
    }

    const match = location.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
    return match
      ? { username: match[1], tweetId: match[2] }
      : { username: "x_user", tweetId: "video" };
  }

  function findInstagramPostLink(video) {
    let node = video.parentElement;
    let depth = 0;

    while (node && node !== document.body && depth < 14) {
      const links = [...node.querySelectorAll('a[href]')];

      for (const link of links) {
        try {
          const url = new URL(link.href, location.href);
          const match = url.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/i);
          if (match) {
            return { code: match[1], url };
          }
        } catch (_) {}
      }

      node = node.parentElement;
      depth++;
    }

    const current = location.pathname.match(/^\/(?:reel|reels|p)\/([^/]+)/i);
    return current ? { code: current[1], url: new URL(location.href) } : null;
  }

  function findInstagramUsername(video) {
    const blocked = new Set([
      "accounts", "direct", "explore", "reel", "reels", "p",
      "stories", "about", "legal", "web", "challenge", "privacy"
    ]);

    let node = video.parentElement;
    let depth = 0;

    while (node && node !== document.body && depth < 14) {
      const links = [...node.querySelectorAll('a[href]')];

      for (const link of links) {
        try {
          const url = new URL(link.href, location.href);
          const match = url.pathname.match(/^\/([^/]+)\/$/);
          if (!match) continue;

          const candidate = match[1];
          if (!blocked.has(candidate.toLowerCase())) return candidate;
        } catch (_) {}
      }

      node = node.parentElement;
      depth++;
    }

    return "instagram";
  }

  function parseInstagramPost(video) {
    const post = findInstagramPostLink(video);

    return {
      postKey: post?.code || null,
      username: findInstagramUsername(video)
    };
  }

  function getVideoInfo(video) {
    if (!(video instanceof HTMLVideoElement)) return null;

    const directUrl = [video.currentSrc, video.src].find(
      (url) =>
        typeof url === "string" &&
        /^https?:/i.test(url) &&
        !url.startsWith("blob:")
    );

    if (platform() === "x") {
      const possibleUrls = [
        video.currentSrc,
        video.src,
        video.poster
      ].filter(Boolean);

      let scope = getScopeForVideo(video);

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

      return {
        video,
        directUrl: directUrl || null,
        mediaKey
      };
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

  function buildRequestData(video) {
    const info = getVideoInfo(video);
    if (!info) return null;

    if (platform() === "x") {
      const post = parseXPost(video);

      return {
        platform: "x",
        username: post.username,
        tweetId: post.tweetId,
        mediaKey: info.mediaKey,
        directUrl: info.directUrl
      };
    }

    const post = parseInstagramPost(video);

    return {
      platform: "instagram",
      username: post.username,
      postKey: post.postKey,
      directUrl: info.directUrl
    };
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function downloadVariant(video, button, variant) {
    const data = buildRequestData(video);
    if (!data) return;

    closeAllMenus();
    setButtonState(button, "loading");

    try {
      const response = await sendExtensionMessage({
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

  function renderQualityMenu(portal, video, button, variants) {
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
        event.stopImmediatePropagation();
        downloadVariant(video, button, variant);
      }, true);

      menu.appendChild(option);
    }

    portal.appendChild(menu);
    requestAnimationFrame(() => menu.classList.add("pvd-quality-menu-show"));
  }

  async function openQualityMenu(video, button, portal) {
    if (portal.querySelector(`.${MENU_CLASS}`)) {
      closeAllMenus();
      return;
    }

    const data = buildRequestData(video);
    if (!data) {
      showToast("Bu alanda indirilebilir video bulunamadı.", "error");
      return;
    }

    setButtonState(button, "loading");

    try {
      const response = await sendExtensionMessage({
        type: "GET_VARIANTS",
        ...data
      });

      setButtonState(button, "idle");

      if (!response?.ok) {
        showToast(response?.message || "Kalite seçenekleri bulunamadı.", "error");
        return;
      }

      renderQualityMenu(portal, video, button, response.variants || []);
    } catch (error) {
      setButtonState(button, "idle");
      showToast(error?.message || "Kalite seçenekleri alınamadı.", "error");
    }
  }

  function makeOverlayButton(video, portal) {
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

    // Prevent Instagram's post/profile click handlers from stealing the gesture.
    for (const eventName of ["pointerdown", "mousedown", "touchstart"]) {
      button.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
      }, true);
    }

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (button.dataset.state === "loading") return;
      await openQualityMenu(video, button, portal);
    }, true);

    return button;
  }

  function createPortal(video) {
    if (overlayEntries.has(video)) return overlayEntries.get(video);

    const portal = document.createElement("div");
    portal.className = PORTAL_CLASS;
    portal.dataset.platform = platform();

    const button = makeOverlayButton(video, portal);
    portal.appendChild(button);
    document.documentElement.appendChild(portal);

    const entry = { video, portal, button };
    overlayEntries.set(video, entry);
    return entry;
  }

  function positionPortal(entry) {
    const { video, portal } = entry;

    if (!video.isConnected) {
      portal.remove();
      overlayEntries.delete(video);
      return;
    }

    if (!isVisibleVideo(video)) {
      portal.classList.remove("pvd-overlay-visible");
      return;
    }

    const rect = video.getBoundingClientRect();

    // Keep the control inside the media without placing it inside Instagram's
    // clickable profile/reel DOM. The portal itself lives under <html>.
    const horizontalInset = rect.width < 360 ? 8 : 12;
    const verticalInset = rect.height < 260 ? 8 : 12;

    portal.style.left = `${Math.round(rect.right - horizontalInset)}px`;
    portal.style.top = `${Math.round(rect.top + verticalInset)}px`;
    portal.style.maxWidth = `${Math.max(120, Math.floor(rect.width - 20))}px`;

    portal.classList.add("pvd-overlay-visible");
  }

  function updatePortals() {
    updateQueued = false;

    for (const entry of [...overlayEntries.values()]) {
      positionPortal(entry);
    }
  }

  function queuePortalUpdate() {
    if (updateQueued) return;
    updateQueued = true;
    requestAnimationFrame(updatePortals);
  }

  function scanVideos() {
    const videos = [...document.querySelectorAll("video")];

    for (const video of videos) {
      if (!(video instanceof HTMLVideoElement)) continue;

      // Ignore tiny previews/avatars/background media.
      const rect = video.getBoundingClientRect();
      if (rect.width && rect.height && (rect.width < 150 || rect.height < 100)) {
        continue;
      }

      createPortal(video);
    }

    queuePortalUpdate();
  }

  // Capture clicks at document level as an extra guard against Instagram
  // overlays that install aggressive delegated click handlers.
  document.addEventListener("click", (event) => {
    if (event.target.closest?.(`.${PORTAL_CLASS}`)) {
      event.stopPropagation();
    } else {
      closeAllMenus();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAllMenus();
  });

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== POST_SOURCE) return;
    if (event.data?.type !== "MEDIA_VARIANTS") return;
    if (!Array.isArray(event.data.variants) || !event.data.variants.length) return;

    Promise.resolve(
      sendExtensionMessage({
        type: "CACHE_VARIANTS",
        variants: event.data.variants
      })
    ).catch(() => {});
  });

  window.addEventListener("scroll", queuePortalUpdate, { passive: true });
  window.addEventListener("resize", queuePortalUpdate, { passive: true });

  const observer = new MutationObserver(() => {
    scanVideos();
  });

  function start() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    scanVideos();

    // Instagram virtualizes the Reels/feed DOM. A low-cost periodic rescan
    // catches recycled <video> elements even when mutation timing is unusual.
    setInterval(() => {
      scanVideos();
    }, 1400);
  }

  if (document.documentElement) start();
  else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
