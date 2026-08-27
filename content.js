(() => {
  const browserApi =
    globalThis.browser ??
    globalThis.chrome;

  const SOURCE =
    "personal-social-video-downloader";

  const PORTAL =
    "pvd-overlay-portal";
  const BUTTON =
    "pvd-overlay-button";
  const MENU =
    "pvd-quality-menu";

  const entries = new Map();
  const localVariants = new Map();
  let frameQueued = false;

  function localVariantKey(item) {
    return `${item.mediaType || "video"}|${item.url || ""}`;
  }

  function cacheLocalVariants(variants = []) {
    const now = Date.now();

    for (const raw of variants) {
      if (!raw?.url) continue;
      localVariants.set(localVariantKey(raw), {
        ...raw,
        seenAt: raw.seenAt || now
      });
    }

    for (const [key, item] of localVariants) {
      if (now - (item.seenAt || 0) > 12 * 60 * 1000) {
        localVariants.delete(key);
      }
    }

    while (localVariants.size > 220) {
      localVariants.delete(localVariants.keys().next().value);
    }
  }

  function localResolution(item) {
    if (item.width && item.height) {
      return { width: Number(item.width), height: Number(item.height) };
    }

    const match = String(item.url || "").match(/\/(\d{2,5})x(\d{2,5})\//);
    return match
      ? { width: Number(match[1]), height: Number(match[2]) }
      : { width: 0, height: 0 };
  }

  function localLooksLikeVideo(item) {
    if (item.mediaType === "image") return false;

    const url = String(item.url || "").toLowerCase();
    const type = String(item.contentType || "").toLowerCase();

    if (url.includes(".m3u8")) return false;
    if (url.includes("dashinit") || url.includes("_video_dashinit.mp4")) return false;

    return (
      item.mediaType === "video" ||
      type.startsWith("video/") ||
      /\.(?:mp4|webm)(?:\?|$)/i.test(url)
    );
  }

  function localLooksLikeImage(item) {
    const url = String(item.url || "").toLowerCase();
    const type = String(item.contentType || "").toLowerCase();

    return (
      item.mediaType === "image" ||
      type.startsWith("image/") ||
      /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(url)
    );
  }

  function instantResponse(element) {
    const data = requestData(element);
    const wantedType = data.mediaType === "image" ? "image" : "video";
    const now = Date.now();

    let items = [...localVariants.values()].filter((item) => {
      if (now - (item.seenAt || 0) > 12 * 60 * 1000) return false;
      if (item.platform !== data.platform) return false;

      if (wantedType === "image" && !localLooksLikeImage(item)) return false;
      if (wantedType === "video" && !localLooksLikeVideo(item)) return false;

      if (data.platform === "x") {
        if (data.mediaKey && item.mediaKey) {
          return String(item.mediaKey) === String(data.mediaKey);
        }
        if (data.tweetId && item.tweetId) {
          return String(item.tweetId) === String(data.tweetId);
        }
      }

      if (data.platform === "instagram" && data.postKey && item.postKey) {
        return String(item.postKey) === String(data.postKey);
      }

      return now - (item.seenAt || 0) < 20000;
    });

    if (
      data.directUrl &&
      /^https?:/i.test(data.directUrl) &&
      !data.directUrl.startsWith("blob:")
    ) {
      items.unshift({
        url: data.directUrl,
        platform: data.platform,
        mediaType: wantedType,
        contentType: wantedType === "image" ? "image/jpeg" : "video/mp4",
        source: "dom",
        sourcePriority: 75,
        seenAt: now
      });
    }

    const deduped = new Map();
    for (const item of items) {
      if (!item?.url) continue;
      if (!deduped.has(item.url)) deduped.set(item.url, item);
    }

    const sorted = [...deduped.values()].sort((a, b) => {
      const ar = localResolution(a);
      const br = localResolution(b);
      const ap = ar.width * ar.height;
      const bp = br.width * br.height;
      return (
        (Number(b.sourcePriority || 0) - Number(a.sourcePriority || 0)) ||
        (bp - ap) ||
        (Number(b.bitrate || 0) - Number(a.bitrate || 0))
      );
    });

    const qualityMap = new Map();
    const unknown = [];

    for (const item of sorted) {
      const { width, height } = localResolution(item);
      if (width && height) {
        const q = `${Math.min(width, height)}:${width}x${height}`;
        if (!qualityMap.has(q)) qualityMap.set(q, item);
      } else {
        unknown.push(item);
      }
    }

    const selected = [
      ...qualityMap.values(),
      ...unknown.slice(0, qualityMap.size ? 0 : 1)
    ].slice(0, 8);

    if (!selected.length) return null;

    return {
      ok: true,
      mediaType: wantedType,
      variants: selected.map((item, index) => {
        const { width, height } = localResolution(item);
        return {
          url: item.url,
          label:
            width && height
              ? `${Math.min(width, height)}p`
              : wantedType === "image"
                ? "Orijinal Görsel"
                : "Orijinal",
          width,
          height,
          bitrate: Number(item.bitrate || 0),
          best: index === 0,
          cleanSource: true,
          mediaType: wantedType,
          source: item.source || "local",
          sourcePriority: Number(item.sourcePriority || 0)
        };
      })
    };
  }

  let backgroundPort = null;
  let requestSequence = 0;
  const portPending = new Map();

  function runtimeErrorText() {
    try {
      return browserApi?.runtime?.lastError?.message || "";
    } catch (_) {
      return "";
    }
  }

  function connectionError(error) {
    const text = String(error?.message || error || "");

    return /receiving end does not exist|could not establish connection|message port closed|disconnected port|no tab with id/i.test(
      text
    );
  }

  function staleContextError(error) {
    const text = String(error?.message || error || "");

    return /extension context invalidated|context invalidated/i.test(text);
  }

  function clearPort(reason = null) {
    const current = backgroundPort;
    backgroundPort = null;

    try {
      current?.disconnect();
    } catch (_) {}

    if (reason) {
      for (const [requestId, pending] of portPending) {
        clearTimeout(pending.timer);
        pending.reject(reason);
        portPending.delete(requestId);
      }
    }
  }

  function connectBackgroundPort() {
    if (backgroundPort) return backgroundPort;

    if (!browserApi?.runtime?.connect) {
      throw new Error("Eklenti arka plan bağlantısı kullanılamıyor.");
    }

    const port = browserApi.runtime.connect({
      name: "pvd-control-v151"
    });

    port.onMessage.addListener((packet) => {
      if (
        packet?.type !== "PVD_RESPONSE" ||
        !packet.requestId
      ) {
        return;
      }

      const pending = portPending.get(packet.requestId);
      if (!pending) return;

      clearTimeout(pending.timer);
      portPending.delete(packet.requestId);
      pending.resolve(packet.response);
    });

    port.onDisconnect.addListener(() => {
      const message =
        runtimeErrorText() ||
        "Eklenti arka plan bağlantısı kesildi.";

      if (backgroundPort === port) {
        backgroundPort = null;
      }

      const error = new Error(message);

      for (const [requestId, pending] of portPending) {
        clearTimeout(pending.timer);
        pending.reject(error);
        portPending.delete(requestId);
      }
    });

    backgroundPort = port;
    return port;
  }

  function requestTimeoutFor(message) {
    if (message?.type === "DOWNLOAD_SELECTED") {
      // A browser configured to ask where each file is saved may leave the
      // native save dialog open for a while. Do not treat that as a failure.
      return 5 * 60 * 1000;
    }

    if (message?.type === "EXTRACT_AUDIO") {
      return 5 * 60 * 1000;
    }

    return 8000;
  }

  function sendViaPort(message) {
    const port = connectBackgroundPort();
    const requestId =
      `pvd_${Date.now()}_${++requestSequence}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        portPending.delete(requestId);
        reject(new Error("Eklenti arka plan isteği zaman aşımına uğradı."));
      }, requestTimeoutFor(message));

      portPending.set(requestId, {
        resolve,
        reject,
        timer
      });

      try {
        port.postMessage({
          type: "PVD_REQUEST",
          requestId,
          payload: message
        });
      } catch (error) {
        clearTimeout(timer);
        portPending.delete(requestId);
        reject(error);
      }
    });
  }

  async function sendViaOneShot(message) {
    if (!browserApi?.runtime?.sendMessage) {
      throw new Error("Eklenti mesajlaşma API'si kullanılamıyor.");
    }

    return await browserApi.runtime.sendMessage(message);
  }

  function autoRecoverStaleContext(error) {
    if (!staleContextError(error)) return false;

    const key = "pvd_v150_context_recovery";
    const now = Date.now();
    const previous = Number(sessionStorage.getItem(key) || 0);

    if (now - previous > 15000) {
      sessionStorage.setItem(key, String(now));

      setTimeout(() => {
        location.reload();
      }, 350);

      return true;
    }

    return false;
  }

  async function send(message) {
    let lastError = null;

    // v1.5.1: the normal path is a one-shot runtime message. MV3 service
    // workers are event-driven and sendMessage wakes the background listener
    // directly. The Port remains only as a fallback.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await sendViaOneShot(message);
      } catch (error) {
        lastError = error;

        if (staleContextError(error)) {
          autoRecoverStaleContext(error);
          throw new Error("Eklenti güncellendi. Sayfa otomatik yenileniyor…");
        }

        if (!connectionError(error)) break;

        await new Promise((resolve) =>
          setTimeout(resolve, attempt === 0 ? 35 : 70)
        );
      }
    }

    // Fallback transport for unusual WebExtension/background environments.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await sendViaPort(message);
      } catch (error) {
        lastError = error;
        clearPort();

        if (staleContextError(error)) {
          autoRecoverStaleContext(error);
          throw new Error("Eklenti güncellendi. Sayfa otomatik yenileniyor…");
        }

        await new Promise((resolve) => setTimeout(resolve, 45));
      }
    }

    throw new Error(
      lastError?.message ||
      "Eklenti arka plan servisine bağlanılamadı."
    );
  }

  function platform() {
    return location.hostname.includes(
      "instagram.com"
    )
      ? "instagram"
      : "x";
  }

  function twitterMediaKey(url = "") {
    const match = String(url).match(
      /\/(?:ext_tw_video(?:_thumb)?|ext_tw_video|amplify_video(?:_thumb)?|amplify_video|tweet_video(?:_thumb)?|tweet_video)\/(\d+)/i
    );

    return match ? match[1] : null;
  }

  function isStoryPage() {
    return /^\/stories\//i.test(
      location.pathname
    );
  }

  function isMediaElement(element) {
    return (
      element instanceof
        HTMLVideoElement ||
      element instanceof
        HTMLImageElement
    );
  }

  function mediaType(element) {
    return element instanceof
      HTMLImageElement
      ? "image"
      : "video";
  }

  function visible(element) {
    if (
      !isMediaElement(element) ||
      !element.isConnected
    ) {
      return false;
    }

    const rect =
      element.getBoundingClientRect();

    const style =
      getComputedStyle(element);

    return (
      rect.width >= 150 &&
      rect.height >= 100 &&
      rect.bottom > 0 &&
      rect.top < innerHeight &&
      rect.right > 0 &&
      rect.left < innerWidth &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || 1) > 0
    );
  }

  function xData(video) {
    const scope =
      video.closest(
        'article[data-testid="tweet"]'
      ) ||
      video.closest("article") ||
      video.parentElement ||
      document.body;

    for (const link of
      scope.querySelectorAll(
        'a[href*="/status/"]'
      )) {
      try {
        const match =
          new URL(
            link.href,
            location.href
          ).pathname.match(
            /^\/([^/]+)\/status\/(\d+)/
          );

        if (match) {
          return {
            username: match[1],
            tweetId: match[2]
          };
        }
      } catch (_) {}
    }

    const match =
      location.pathname.match(
        /^\/([^/]+)\/status\/(\d+)/
      );

    return match
      ? {
          username: match[1],
          tweetId: match[2]
        }
      : {
          username: "x_user",
          tweetId: "video"
        };
  }

  function instagramData(element) {
    let match =
      location.pathname.match(
        /^\/stories\/([^/]+)\/(\d+)/i
      );

    if (match) {
      return {
        username: match[1],
        postKey: `story:${match[2]}`,
        contentKind: "story"
      };
    }

    match =
      location.pathname.match(
        /^\/(?:reel|reels|p)\/([^/]+)/i
      );

    let postKey =
      match ? match[1] : null;

    let contentKind =
      match
        ? location.pathname.includes(
            "reel"
          )
          ? "reel"
          : "post"
        : "feed";

    let username = "instagram";
    let node =
      element.parentElement;
    let depth = 0;

    while (
      node &&
      node !== document.body &&
      depth++ < 14
    ) {
      for (const link of
        node.querySelectorAll(
          "a[href]"
        )) {
        try {
          const url = new URL(
            link.href,
            location.href
          );

          const postMatch =
            url.pathname.match(
              /^\/(?:reel|reels|p)\/([^/]+)/i
            );

          const userMatch =
            url.pathname.match(
              /^\/([^/]+)\/$/
            );

          if (
            !postKey &&
            postMatch
          ) {
            postKey =
              postMatch[1];
          }

          if (
            userMatch &&
            ![
              "accounts",
              "direct",
              "explore",
              "reel",
              "reels",
              "p",
              "stories",
              "about",
              "legal",
              "web"
            ].includes(
              userMatch[1].toLowerCase()
            )
          ) {
            username =
              userMatch[1];
          }
        } catch (_) {}
      }

      node =
        node.parentElement;
    }

    return {
      username,
      postKey,
      contentKind
    };
  }

  function directMediaUrl(element) {
    if (
      element instanceof
      HTMLVideoElement
    ) {
      return (
        [
          element.currentSrc,
          element.src
        ].find(
          (url) =>
            typeof url ===
              "string" &&
            /^https?:/i.test(
              url
            ) &&
            !url.startsWith(
              "blob:"
            )
        ) || null
      );
    }

    if (
      element instanceof
      HTMLImageElement
    ) {
      const url =
        element.currentSrc ||
        element.src ||
        "";

      return /^https?:/i.test(url)
        ? url
        : null;
    }

    return null;
  }

  function requestData(element) {
    const directUrl =
      directMediaUrl(element);

    if (platform() === "x") {
      const data = xData(element);
      const urls = [
        element.currentSrc,
        element.src,
        element.poster
      ].filter(Boolean);

      let key = null;

      for (const url of urls) {
        key =
          twitterMediaKey(url);

        if (key) break;
      }

      return {
        platform: "x",
        mediaType: "video",
        ...data,
        mediaKey: key,
        directUrl
      };
    }

    return {
      platform: "instagram",
      mediaType:
        mediaType(element),
      ...instagramData(element),
      directUrl
    };
  }

  function toast(
    text,
    kind = "info"
  ) {
    document
      .querySelector(".pvd-toast")
      ?.remove();

    const element =
      document.createElement("div");

    element.className =
      `pvd-toast pvd-toast-${kind}`;

    element.innerHTML = `
      <span class="pvd-toast-dot"></span>
      <span>${escapeHtml(text)}</span>
    `;

    document.documentElement
      .appendChild(element);

    requestAnimationFrame(() =>
      element.classList.add(
        "pvd-toast-show"
      )
    );

    setTimeout(() => {
      element.classList.remove(
        "pvd-toast-show"
      );

      setTimeout(
        () => element.remove(),
        180
      );
    }, 2800);
  }

  function closeMenus(
    except = null
  ) {
    for (const menu of
      document.querySelectorAll(
        `.${MENU}`
      )) {
      if (menu !== except) {
        menu.remove();
      }
    }
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        })[character]
    );
  }

  function buttonIconSvg() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a1 1 0 0 1 1 1v8.17l2.59-2.58A1 1 0 1 1 17 11l-4.3 4.3a1 1 0 0 1-1.4 0L7 11a1 1 0 1 1 1.41-1.41L11 12.17V4a1 1 0 0 1 1-1Z"/>
        <path d="M5 18a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"/>
      </svg>
    `;
  }

  function menuShell(
    portal,
    element
  ) {
    closeMenus();

    const type =
      mediaType(element);

    const menu =
      document.createElement("div");

    menu.className = MENU;

    menu.innerHTML = `
      <div class="pvd-menu-head">
        <div class="pvd-menu-head-icon">
          ${buttonIconSvg()}
        </div>
        <div class="pvd-menu-head-copy">
          <strong>${type === "image" ? "Görseli indir" : "İndirme seçenekleri"}</strong>
          <span>${type === "image" ? "Orijinal kaynak" : "Kalite seç"}</span>
        </div>
        <span class="pvd-menu-platform">${platform() === "instagram" ? "IG" : "X"}</span>
      </div>
      <div class="pvd-menu-body">
        <div class="pvd-loading">
          <i></i>
          <div>
            <strong>Kaynak hazırlanıyor</strong>
            <span>Medya bağlantısı doğrulanıyor…</span>
          </div>
        </div>
      </div>
    `;

    portal.appendChild(menu);

    requestAnimationFrame(() =>
      menu.classList.add(
        "pvd-quality-menu-show"
      )
    );

    return menu;
  }

  function errorMenu(
    menu,
    message,
    element
  ) {
    const body =
      menu.querySelector(
        ".pvd-menu-body"
      );

    body.innerHTML = `
      <div class="pvd-menu-error">
        <span class="pvd-error-icon">!</span>
        <div>
          <strong>Kaynak hazırlanamadı</strong>
          <span>${escapeHtml(message)}</span>
        </div>
      </div>
      <button class="pvd-menu-retry" type="button">
        Tekrar Dene
      </button>
    `;

    const retry =
      body.querySelector(
        ".pvd-menu-retry"
      );

    retry.dataset.pvdRetry = "1";
    retry.__pvdMedia = element;
  }

  function optionIcon(
    kind = "video"
  ) {
    if (kind === "image") {
      return `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v12h16V6H4Zm3 2.5A1.5 1.5 0 1 1 7 11.5a1.5 1.5 0 0 1 0-3Zm-1 7 3.2-3.2a1 1 0 0 1 1.4 0l1.9 1.9 2.4-2.4a1 1 0 0 1 1.4 0L20 15.5V18H4v-.5l2-2Z"/>
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h10a3 3 0 0 1 3 3v1.1l2.45-1.63A1 1 0 0 1 22 7.3v9.4a1 1 0 0 1-1.55.83L18 15.9V17a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5Zm13 4.5v3l2 1.33V9.17L18 10.5Z"/>
      </svg>
    `;
  }

  function renderOptions(
    menu,
    element,
    button,
    response
  ) {
    const body =
      menu.querySelector(
        ".pvd-menu-body"
      );

    body.innerHTML = "";

    const type =
      response.mediaType ||
      mediaType(element);

    for (const variant of
      response.variants || []) {
      const option =
        document.createElement(
          "button"
        );

      option.type = "button";
      option.className =
        "pvd-quality-option";

      option.__pvdVariant =
        variant;
      option.__pvdMedia =
        element;
      option.__pvdButton =
        button;

      const detail =
        variant.width &&
        variant.height
          ? `${variant.width} × ${variant.height}`
          : type === "image"
            ? "Orijinal görsel"
            : "Orijinal medya";

      option.innerHTML = `
        <span class="pvd-option-left">
          <span class="pvd-option-icon">
            ${optionIcon(type)}
          </span>
          <span class="pvd-option-copy">
            <span class="pvd-option-title">
              <b>${escapeHtml(variant.label)}</b>
              ${variant.best ? '<em>EN İYİ</em>' : ""}
            </span>
            <small>${escapeHtml(detail)}</small>
          </span>
        </span>
        <span class="pvd-option-action">↓</span>
      `;

      body.appendChild(option);
    }

    if (type === "video") {
      const audio =
        document.createElement(
          "button"
        );

      audio.type = "button";
      audio.className =
        "pvd-audio-option";

      audio.__pvdMedia =
        element;
      audio.__pvdButton =
        button;

      audio.innerHTML = `
        <span class="pvd-option-left">
          <span class="pvd-option-icon pvd-option-icon-audio">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14 3a1 1 0 0 1 1 1v10.1A4 4 0 1 1 13 10.65V7.2l7-1.4V4.24L14 5.45V4a1 1 0 0 1 1-1Zm-3 13a2 2 0 1 0 2-2 2 2 0 0 0-2 2Zm4-6.76v2.03a4 4 0 0 1 5-3.62V7.84l-5 1.4Z"/>
            </svg>
          </span>
          <span class="pvd-option-copy">
            <span class="pvd-option-title">
              <b>Sadece Ses</b>
              <em class="pvd-mp3-badge">AUDIO</em>
            </span>
            <small>Ses dosyası olarak kaydet</small>
          </span>
        </span>
        <span class="pvd-option-action">♪</span>
      `;

      body.appendChild(audio);
    }

    const note =
      document.createElement(
        "div"
      );

    note.className =
      "pvd-clean-note";

    note.innerHTML = `
      <span class="pvd-clean-check">✓</span>
      <span>${type === "image" ? "Orijinal Story kaynağı" : "Doğrudan medya kaynağı"}</span>
    `;

    body.appendChild(note);
  }

  function renderInstantUnavailable(menu, element) {
    errorMenu(
      menu,
      mediaType(element) === "image"
        ? "Görsel kaynağı henüz sayfaya yüklenmedi."
        : "Video kaynağı henüz sayfaya yüklenmedi.",
      element
    );
  }

  async function refreshEntry(entry) {
    if (!entry?.element?.isConnected) return null;

    window.postMessage(
      {
        source: SOURCE,
        type: "RESCAN_REQUEST"
      },
      "*"
    );

    try {
      const response = await send({
        type: "GET_VARIANTS",
        ...requestData(entry.element)
      });

      if (response?.ok) {
        entry.preloaded = response;
      }

      return response;
    } catch (_) {
      return null;
    }
  }

  function prewarmEntry(entry) {
    if (!entry || entry.prewarmStarted) return;
    entry.prewarmStarted = true;

    // Give page-hook a chance to repost its in-page cache, but do not block UI.
    queueMicrotask(() => {
      refreshEntry(entry).finally(() => {
        entry.prewarmStarted = false;
      });
    });
  }

  async function openMenu(
    element,
    button,
    portal
  ) {
    const existing = portal.querySelector(`.${MENU}`);

    if (existing) {
      existing.remove();
      return;
    }

    // Menu shell is created immediately; there is no artificial 150/500 ms wait.
    const menu = menuShell(portal, element);
    const entry = entries.get(element);

    // Priority 1: already-prewarmed background response.
    // Priority 2: content-script cache populated directly by page-hook.
    const immediate =
      entry?.preloaded?.ok
        ? entry.preloaded
        : instantResponse(element);

    if (immediate?.ok) {
      renderOptions(menu, element, button, immediate);
    } else {
      // Never leave the user staring at "Kaynak hazırlanıyor".
      renderInstantUnavailable(menu, element);
    }

    // Refresh in background. If a source appears a moment later, update the
    // already-open menu automatically without blocking the first paint.
    const refreshed = await refreshEntry(entry || { element });

    if (!menu.isConnected || !refreshed?.ok) return;

    renderOptions(menu, element, button, refreshed);
  }

  const pendingDownloads = new Map();

  async function download(
    element,
    button,
    variant
  ) {
    closeMenus();

    if (button.dataset.state === "loading") {
      return;
    }

    button.dataset.state = "loading";

    const downloadToken =
      `ui_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    try {
      const response = await send({
        type: "DOWNLOAD_SELECTED",
        ...requestData(element),
        selectedUrl: variant.url,
        downloadToken,
        selectedVariant: {
          url: variant.url,
          width: Number(variant.width || 0),
          height: Number(variant.height || 0),
          bitrate: Number(variant.bitrate || 0),
          mediaType:
            variant.mediaType ||
            mediaType(element),
          source:
            variant.source ||
            "ui-selected",
          sourcePriority:
            Number(
              variant.sourcePriority ||
              (
                variant.source === "video_versions"
                  ? 120
                  : variant.source === "video_url"
                    ? 110
                    : 95
              )
            )
        }
      });

      if (!response?.ok) {
        button.dataset.state = "";

        toast(
          response?.message ||
            "İndirme başlatılamadı.",
          "error"
        );

        return;
      }

      const token =
        response.token ||
        downloadToken;

      pendingDownloads.set(token, {
        button,
        createdAt: Date.now()
      });

      // The background has already queued the native browser download call.
      // Do not keep the UI stuck in a spinner while the OS file picker is open.
      button.dataset.state = "";

      // Cleanup only. The actual success/error arrives through
      // PVD_DOWNLOAD_STATUS.
      setTimeout(() => {
        pendingDownloads.delete(token);
      }, 6 * 60 * 1000);
    } catch (error) {
      button.dataset.state = "";

      toast(
        error?.message ||
          "İndirme başlatılamadı.",
        "error"
      );
    }
  }

  async function audio(
    element,
    button
  ) {
    closeMenus();
    button.dataset.state =
      "loading";

    try {
      const response =
        await send({
          type: "EXTRACT_AUDIO",
          ...requestData(element)
        });

      button.dataset.state = "";

      if (response?.ok) {
        toast(
          response.message ||
            "Ses çıkarma başlatıldı.",
          "success"
        );
      } else {
        toast(
          response?.message ||
            "Ses çıkarılamadı.",
          "error"
        );
      }
    } catch (error) {
      button.dataset.state = "";

      toast(
        error?.message ||
          "Ses çıkarılamadı.",
        "error"
      );
    }
  }

  function makePortal(element) {
    if (entries.has(element)) {
      return;
    }

    const portal =
      document.createElement(
        "div"
      );

    portal.className = PORTAL;

    const button =
      document.createElement(
        "button"
      );

    button.type = "button";
    button.className = BUTTON;
    button.setAttribute(
      "aria-label",
      mediaType(element) ===
        "image"
        ? "Hikâye görselini indir"
        : "Videoyu indir"
    );

    button.innerHTML = `
      <span class="pvd-download-icon">
        ${buttonIconSvg()}
      </span>
      <span class="pvd-button-label">
        ${mediaType(element) === "image" ? "Görseli İndir" : "İndir"}
      </span>
      <span class="pvd-chevron">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5.7 7.5a1 1 0 0 1 1.4 0L10 10.4l2.9-2.9a1 1 0 1 1 1.4 1.4l-3.6 3.6a1 1 0 0 1-1.4 0L5.7 8.9a1 1 0 0 1 0-1.4Z"/>
        </svg>
      </span>
    `;

    portal.appendChild(button);
    document.documentElement
      .appendChild(portal);

    const entry = {
      element,
      portal,
      button,
      preloaded: null,
      prewarmStarted: false
    };

    entries.set(element, entry);
    prewarmEntry(entry);
  }

  function position() {
    frameQueued = false;

    for (const [
      element,
      entry
    ] of [...entries]) {
      if (!element.isConnected) {
        entry.portal.remove();
        entries.delete(element);
        continue;
      }

      if (!visible(element)) {
        entry.portal.classList.remove(
          "pvd-overlay-visible"
        );
        continue;
      }

      const rect =
        element.getBoundingClientRect();

      entry.portal.style.left =
        `${Math.round(
          rect.right -
            (rect.width < 360
              ? 8
              : 12)
        )}px`;

      entry.portal.style.top =
        `${Math.round(
          rect.top +
            (rect.height < 260
              ? 8
              : 12)
        )}px`;

      entry.portal.classList.add(
        "pvd-overlay-visible"
      );
    }
  }

  function queuePosition() {
    if (frameQueued) return;

    frameQueued = true;
    requestAnimationFrame(position);
  }

  function isLikelyStoryImage(
    image
  ) {
    if (
      !(image instanceof
        HTMLImageElement) ||
      !isStoryPage()
    ) {
      return false;
    }

    const rect =
      image.getBoundingClientRect();

    if (
      rect.width < 260 ||
      rect.height < 300
    ) {
      return false;
    }

    if (
      image.closest(
        'header, nav, [role="button"]'
      ) &&
      rect.width < 450
    ) {
      return false;
    }

    return true;
  }

  function scan() {
    for (const video of
      document.querySelectorAll(
        "video"
      )) {
      const rect =
        video.getBoundingClientRect();

      if (
        rect.width &&
        rect.height &&
        (
          rect.width < 150 ||
          rect.height < 100
        )
      ) {
        continue;
      }

      makePortal(video);
      prewarmEntry(entries.get(video));
    }

    if (
      platform() === "instagram" &&
      isStoryPage()
    ) {
      for (const image of
        document.querySelectorAll(
          "img"
        )) {
        if (
          isLikelyStoryImage(image)
        ) {
          makePortal(image);
          prewarmEntry(entries.get(image));
        }
      }
    }

    queuePosition();
  }

  function pathTarget(
    event,
    className
  ) {
    for (const node of
      event.composedPath?.() ||
      []) {
      if (
        node instanceof Element &&
        node.classList?.contains(
          className
        )
      ) {
        return node;
      }
    }

    return null;
  }

  window.addEventListener(
    "click",
    (event) => {
      const option =
        pathTarget(
          event,
          "pvd-quality-option"
        );

      if (option) {
        event.preventDefault();
        event.stopImmediatePropagation();

        download(
          option.__pvdMedia,
          option.__pvdButton,
          option.__pvdVariant
        );

        return;
      }

      const audioOption =
        pathTarget(
          event,
          "pvd-audio-option"
        );

      if (audioOption) {
        event.preventDefault();
        event.stopImmediatePropagation();

        audio(
          audioOption.__pvdMedia,
          audioOption.__pvdButton
        );

        return;
      }

      const retry =
        pathTarget(
          event,
          "pvd-menu-retry"
        );

      if (retry) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const entry =
          entries.get(
            retry.__pvdMedia
          );

        if (entry) {
          retry
            .closest(`.${MENU}`)
            ?.remove();

          openMenu(
            entry.element,
            entry.button,
            entry.portal
          );
        }

        return;
      }

      const button =
        pathTarget(
          event,
          BUTTON
        );

      if (button) {
        event.preventDefault();
        event.stopImmediatePropagation();

        const entry =
          [...entries.values()].find(
            (candidate) =>
              candidate.button ===
              button
          );

        if (entry) {
          openMenu(
            entry.element,
            entry.button,
            entry.portal
          );
        }

        return;
      }

      if (
        !pathTarget(
          event,
          PORTAL
        )
      ) {
        closeMenus();
      }
    },
    true
  );

  window.addEventListener(
    "message",
    (event) => {
      if (
        event.source !== window ||
        event.data?.source !==
          SOURCE ||
        event.data?.type !==
          "MEDIA_VARIANTS" ||
        !Array.isArray(
          event.data.variants
        )
      ) {
        return;
      }

      cacheLocalVariants(event.data.variants);

      Promise.resolve(
        send({
          type: "CACHE_VARIANTS",
          variants:
            event.data.variants
        })
      ).catch(() => {});

      for (const entry of entries.values()) {
        if (visible(entry.element)) {
          const instant = instantResponse(entry.element);
          if (instant?.ok) {
            entry.preloaded = instant;
          }
        }
      }
    }
  );

  document.addEventListener(
    "copy",
    () => {
      setTimeout(async () => {
        try {
          const text =
            await navigator.clipboard
              ?.readText?.();

          if (
            /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com|instagram\.com)\//i.test(
              text || ""
            )
          ) {
            await browserApi.storage.local.set(
              {
                pvd_last_clipboard_url:
                  text
              }
            );
          }
        } catch (_) {}
      }, 0);
    }
  );

  window.addEventListener(
    "scroll",
    queuePosition,
    { passive: true }
  );

  window.addEventListener(
    "resize",
    queuePosition,
    { passive: true }
  );

  const mutationObserver =
    new MutationObserver(scan);

  function start() {
    mutationObserver.observe(
      document.documentElement,
      {
        childList: true,
        subtree: true
      }
    );

    scan();

    setInterval(scan, 2400);
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  }

  browserApi.runtime.onMessage.addListener(
    (message, sender, respond) => {
      if (message?.type === "PVD_DOWNLOAD_STATUS") {
        const pending =
          pendingDownloads.get(message.token);

        if (pending?.button) {
          pending.button.dataset.state = "";
        }

        pendingDownloads.delete(message.token);

        if (message.status === "started") {
          toast(
            message.mediaType === "image"
              ? "Görsel indirme başlatıldı"
              : `İndirme başlatıldı${message.quality ? ` • ${message.quality}` : ""}`,
            "success"
          );
        } else if (message.status === "error") {
          toast(
            message.message ||
              "Tarayıcı indirmeyi başlatamadı.",
            "error"
          );
        }

        respond?.({ ok: true });
        return;
      }

      if (message?.type !== "OPEN_PRIMARY_MENU") {
        return;
      }

      const entry =
        [...entries.values()].find(
          (candidate) =>
            visible(
              candidate.element
            )
        );

      if (entry) {
        openMenu(
          entry.element,
          entry.button,
          entry.portal
        );

        respond({ ok: true });
      } else {
        respond({
          ok: false,
          message:
            "Görünür medya bulunamadı."
        });
      }
    }
  );
})();
