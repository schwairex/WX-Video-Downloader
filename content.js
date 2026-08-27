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
  let frameQueued = false;

  const sleep = (ms) =>
    new Promise((resolve) =>
      setTimeout(resolve, ms)
    );

  async function send(message) {
    if (
      !browserApi?.runtime
        ?.sendMessage
    ) {
      throw new Error(
        "Eklenti arka plan servisine erişilemiyor."
      );
    }

    return await browserApi.runtime
      .sendMessage(message);
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
          <strong>${type === "image" ? "Hikâye Görseli" : "Medya İndir"}</strong>
          <span>${type === "image" ? "Orijinal kalite • yerel indirme" : "Kaynak kalite • doğrulanmış medya"}</span>
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
              <em class="pvd-mp3-badge">MP3</em>
            </span>
            <small>Yerel dönüştürme • 192 kbps</small>
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
      <span>${type === "image" ? "Görsel, tarayıcıya sunulan orijinal Story kaynağından indirilir." : "İndirmeden önce medya türü doğrulanır; geçersiz HTML/oturum yanıtı .mp4 olarak kaydedilmez."}</span>
    `;

    body.appendChild(note);
  }

  async function openMenu(
    element,
    button,
    portal
  ) {
    const existing =
      portal.querySelector(
        `.${MENU}`
      );

    if (existing) {
      existing.remove();
      return;
    }

    const menu =
      menuShell(
        portal,
        element
      );

    window.postMessage(
      {
        source: SOURCE,
        type: "RESCAN_REQUEST"
      },
      "*"
    );

    await sleep(150);

    let response;

    try {
      response = await send({
        type: "GET_VARIANTS",
        ...requestData(element)
      });

      if (!response?.ok) {
        await sleep(500);

        window.postMessage(
          {
            source: SOURCE,
            type: "RESCAN_REQUEST"
          },
          "*"
        );

        response = await send({
          type: "GET_VARIANTS",
          ...requestData(element)
        });
      }

      if (!menu.isConnected) return;

      if (!response?.ok) {
        errorMenu(
          menu,
          response?.message ||
            "Medya kaynağı bulunamadı.",
          element
        );
      } else {
        renderOptions(
          menu,
          element,
          button,
          response
        );
      }
    } catch (error) {
      if (menu.isConnected) {
        errorMenu(
          menu,
          error?.message ||
            "Medya seçenekleri alınamadı.",
          element
        );
      }
    }
  }

  async function download(
    element,
    button,
    variant
  ) {
    closeMenus();
    button.dataset.state =
      "loading";

    try {
      const response =
        await send({
          type:
            "DOWNLOAD_SELECTED",
          ...requestData(element),
          selectedUrl:
            variant.url
        });

      if (response?.ok) {
        button.dataset.state =
          "done";

        toast(
          response.mediaType ===
            "image"
            ? "Hikâye görseli indiriliyor"
            : `İndirme başladı${response.quality ? ` • ${response.quality}` : ""}`,
          "success"
        );

        setTimeout(
          () =>
            (button.dataset.state =
              ""),
          1500
        );
      } else {
        button.dataset.state = "";

        toast(
          response?.message ||
            "Medya indirilemedi.",
          "error"
        );
      }
    } catch (error) {
      button.dataset.state = "";

      toast(
        error?.message ||
          "Medya indirilemedi.",
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

    entries.set(element, {
      element,
      portal,
      button
    });
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

      Promise.resolve(
        send({
          type: "CACHE_VARIANTS",
          variants:
            event.data.variants
        })
      ).catch(() => {});
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
      if (
        message?.type !==
        "OPEN_PRIMARY_MENU"
      ) {
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
