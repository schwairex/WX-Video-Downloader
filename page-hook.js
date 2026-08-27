(() => {
  if (window.__PVD_HOOK_V133__) return;
  window.__PVD_HOOK_V133__ = true;

  const SOURCE =
    "personal-social-video-downloader";

  const cache = new Map();

  function platform() {
    return location.hostname.includes(
      "instagram.com"
    )
      ? "instagram"
      : "x";
  }

  function instagramContext() {
    let match = location.pathname.match(
      /^\/stories\/([^/]+)\/(\d+)/i
    );

    if (match) {
      return {
        postKey: `story:${match[2]}`,
        username: match[1],
        contentKind: "story"
      };
    }

    match = location.pathname.match(
      /^\/(?:reel|reels|p)\/([^/]+)/i
    );

    if (match) {
      return {
        postKey: match[1],
        contentKind:
          location.pathname.includes("reel")
            ? "reel"
            : "post"
      };
    }

    return {
      postKey: null,
      contentKind: "feed"
    };
  }

  function twitterMediaKey(url = "") {
    const match = String(url).match(
      /\/(?:ext_tw_video(?:_thumb)?|amplify_video(?:_thumb)?|tweet_video(?:_thumb)?)\/(\d+)/i
    );

    return match ? match[1] : null;
  }

  function canonicalizeInstagramUrl(url = "") {
    try {
      const parsed = new URL(
        String(url).replaceAll("&amp;", "&")
      );

      for (const key of [
        "bytestart",
        "byteend",
        "start",
        "end",
        "range",
        "start_offset",
        "end_offset"
      ]) {
        parsed.searchParams.delete(key);
      }

      return parsed.toString();
    } catch (_) {
      return String(url).replaceAll(
        "&amp;",
        "&"
      );
    }
  }

  function isInstagramVideoUrl(url = "") {
    const value = String(url).toLowerCase();

    if (
      !(
        value.includes(
          "cdninstagram.com"
        ) ||
        value.includes("fbcdn.net")
      )
    ) {
      return false;
    }

    if (
      value.includes(
        "_video_dashinit.mp4"
      ) ||
      value.includes("dashinit") ||
      /\/t50\./i.test(value)
    ) {
      return false;
    }

    return (
      value.includes(".mp4") ||
      value.includes("/v/t16/") ||
      value.includes("/o1/v/")
    );
  }

  function isInstagramImageUrl(url = "") {
    const value = String(url).toLowerCase();

    return (
      (
        value.includes(
          "cdninstagram.com"
        ) ||
        value.includes("fbcdn.net")
      ) &&
      /\.(?:jpe?g|png|webp|avif)(?:\?|$)/i.test(
        value
      )
    );
  }

  function storeAndPost(list) {
    const now = Date.now();

    for (const raw of list || []) {
      if (!raw?.url) continue;

      const item = { ...raw };
      const itemPlatform =
        item.platform || platform();

      if (itemPlatform === "x") {
        if (
          !item.url.startsWith(
            "https://video.twimg.com/"
          )
        ) {
          continue;
        }
      }

      if (itemPlatform === "instagram") {
        item.url =
          canonicalizeInstagramUrl(
            item.url
          );

        if (
          item.mediaType === "image"
            ? !isInstagramImageUrl(
                item.url
              )
            : !isInstagramVideoUrl(
                item.url
              )
        ) {
          continue;
        }
      }

      cache.set(
        `${item.mediaType || "video"}|${item.url}`,
        {
          ...item,
          platform: itemPlatform,
          seenAt: now
        }
      );
    }

    while (cache.size > 240) {
      cache.delete(
        cache.keys().next().value
      );
    }

    const variants = [
      ...cache.values()
    ].filter(
      (item) =>
        now - (item.seenAt || 0) <
        12 * 60 * 1000
    );

    if (variants.length) {
      window.postMessage(
        {
          source: SOURCE,
          type: "MEDIA_VARIANTS",
          variants
        },
        "*"
      );
    }
  }

  function scanX(root) {
    const output = [];
    const seen = new WeakSet();

    function walk(
      value,
      tweetId = null,
      depth = 0
    ) {
      if (!value || depth > 55) return;

      if (typeof value === "string") {
        if (
          value.startsWith(
            "https://video.twimg.com/"
          ) &&
          /\.(?:mp4|webm|m3u8)/i.test(
            value
          )
        ) {
          output.push({
            url: value,
            platform: "x",
            mediaType: "video",
            tweetId,
            mediaKey:
              twitterMediaKey(value),
            source: "api",
            sourcePriority: 90
          });
        }

        return;
      }

      if (
        typeof value !== "object" ||
        seen.has(value)
      ) {
        return;
      }

      seen.add(value);

      let currentTweetId = tweetId;

      if (
        (
          value.__typename ===
            "Tweet" ||
          value.legacy?.full_text
        ) &&
        value.rest_id
      ) {
        currentTweetId =
          String(value.rest_id);
      }

      if (
        value.video_info?.variants
      ) {
        for (const variant of
          value.video_info.variants) {
          if (!variant?.url) continue;

          output.push({
            url: variant.url,
            platform: "x",
            mediaType: "video",
            tweetId: currentTweetId,
            mediaKey:
              twitterMediaKey(
                variant.url
              ),
            bitrate:
              variant.bitrate || 0,
            contentType:
              variant.content_type || "",
            source: "api",
            sourcePriority: 100
          });
        }
      }

      for (const key of Object.keys(value)) {
        try {
          walk(
            value[key],
            currentTweetId,
            depth + 1
          );
        } catch (_) {}
      }
    }

    walk(root);
    storeAndPost(output);
  }

  function scanInstagram(root) {
    const output = [];
    const seen = new WeakSet();
    const initial =
      instagramContext();

    function walk(
      value,
      context = initial,
      depth = 0
    ) {
      if (!value || depth > 65) return;

      if (typeof value === "string") {
        if (
          isInstagramVideoUrl(value)
        ) {
          output.push({
            url:
              canonicalizeInstagramUrl(
                value
              ),
            platform: "instagram",
            mediaType: "video",
            postKey: context.postKey,
            contentKind:
              context.contentKind,
            contentType: "video/mp4",
            source: "api-string",
            sourcePriority: 65
          });
        }

        if (
          context.contentKind ===
            "story" &&
          isInstagramImageUrl(value)
        ) {
          output.push({
            url:
              canonicalizeInstagramUrl(
                value
              ),
            platform: "instagram",
            mediaType: "image",
            postKey: context.postKey,
            contentKind: "story",
            source: "api-string",
            sourcePriority: 55
          });
        }

        return;
      }

      if (
        typeof value !== "object" ||
        seen.has(value)
      ) {
        return;
      }

      seen.add(value);

      let current = { ...context };

      if (
        typeof value.code === "string"
      ) {
        current.postKey = value.code;
      } else if (
        typeof value.shortcode ===
        "string"
      ) {
        current.postKey =
          value.shortcode;
      }

      if (
        Array.isArray(
          value.video_versions
        )
      ) {
        for (const variant of
          value.video_versions) {
          if (!variant?.url) continue;

          output.push({
            url:
              canonicalizeInstagramUrl(
                variant.url
              ),
            platform: "instagram",
            mediaType: "video",
            postKey: current.postKey,
            contentKind:
              current.contentKind,
            width:
              Number(
                variant.width || 0
              ),
            height:
              Number(
                variant.height || 0
              ),
            contentType:
              "video/mp4",
            source: "video_versions",
            sourcePriority: 120
          });
        }
      }

      if (
        typeof value.video_url ===
          "string" &&
        isInstagramVideoUrl(
          value.video_url
        )
      ) {
        output.push({
          url:
            canonicalizeInstagramUrl(
              value.video_url
            ),
          platform: "instagram",
          mediaType: "video",
          postKey: current.postKey,
          contentKind:
            current.contentKind,
          width:
            Number(
              value.dimensions?.width ||
                value.original_width ||
                0
            ),
          height:
            Number(
              value.dimensions?.height ||
                value.original_height ||
                0
            ),
          contentType:
            "video/mp4",
          source: "video_url",
          sourcePriority: 110
        });
      }

      // Instagram Stories and posts expose original images through
      // image_versions2.candidates. We only surface them as downloadable
      // image media for Story context.
      if (
        current.contentKind ===
          "story" &&
        Array.isArray(
          value.image_versions2
            ?.candidates
        )
      ) {
        for (const candidate of
          value.image_versions2
            .candidates) {
          if (!candidate?.url) continue;

          output.push({
            url:
              canonicalizeInstagramUrl(
                candidate.url
              ),
            platform: "instagram",
            mediaType: "image",
            postKey: current.postKey,
            contentKind: "story",
            width:
              Number(
                candidate.width || 0
              ),
            height:
              Number(
                candidate.height || 0
              ),
            contentType:
              "image/jpeg",
            source:
              "image_versions2",
            sourcePriority: 120
          });
        }
      }

      for (const key of Object.keys(value)) {
        try {
          walk(
            value[key],
            current,
            depth + 1
          );
        } catch (_) {}
      }
    }

    walk(root);
    storeAndPost(output);
  }

  function scanJson(value) {
    if (platform() === "instagram") {
      scanInstagram(value);
    } else {
      scanX(value);
    }
  }

  function shouldInspect(url) {
    const value = String(url || "");

    if (platform() === "instagram") {
      return (
        value.includes("/api/") ||
        value.includes("/graphql") ||
        value.includes(
          "instagram.com"
        )
      );
    }

    return (
      value.includes("/graphql/") ||
      value.includes(
        "/i/api/graphql/"
      ) ||
      value.includes("TweetDetail")
    );
  }

  const originalFetch = window.fetch;

  if (originalFetch) {
    window.fetch = function (...args) {
      const requestUrl =
        typeof args[0] === "string"
          ? args[0]
          : args[0]?.url || "";

      const promise =
        originalFetch.apply(this, args);

      if (shouldInspect(requestUrl)) {
        promise
          .then((response) => {
            try {
              const clone =
                response.clone();
              const contentType =
                clone.headers.get(
                  "content-type"
                ) || "";

              if (
                contentType.includes(
                  "json"
                )
              ) {
                clone
                  .json()
                  .then(scanJson)
                  .catch(() => {});
              }
            } catch (_) {}
          })
          .catch(() => {});
      }

      return promise;
    };
  }

  const XHR =
    window.XMLHttpRequest;

  if (XHR?.prototype) {
    const originalOpen =
      XHR.prototype.open;
    const originalSend =
      XHR.prototype.send;

    XHR.prototype.open = function (
      method,
      url,
      ...rest
    ) {
      this.__pvd_url =
        String(url || "");

      return originalOpen.call(
        this,
        method,
        url,
        ...rest
      );
    };

    XHR.prototype.send =
      function (...args) {
        if (
          shouldInspect(
            this.__pvd_url
          )
        ) {
          this.addEventListener(
            "load",
            () => {
              try {
                if (
                  this.responseType ===
                    "json" &&
                  this.response
                ) {
                  scanJson(
                    this.response
                  );
                } else if (
                  !this.responseType ||
                  this.responseType ===
                    "text"
                ) {
                  scanJson(
                    JSON.parse(
                      this.responseText
                    )
                  );
                }
              } catch (_) {}
            },
            { once: true }
          );
        }

        return originalSend.apply(
          this,
          args
        );
      };
  }

  function rescanResources() {
    const context =
      instagramContext();
    const output = [];

    for (const entry of
      performance.getEntriesByType(
        "resource"
      )) {
      const url = entry.name;

      if (
        url.startsWith(
          "https://video.twimg.com/"
        ) &&
        /\.(?:mp4|webm|m3u8)/i.test(
          url
        )
      ) {
        output.push({
          url,
          platform: "x",
          mediaType: "video",
          mediaKey:
            twitterMediaKey(url),
          source: "resource",
          sourcePriority: 30
        });
      } else if (
        isInstagramVideoUrl(url)
      ) {
        output.push({
          url:
            canonicalizeInstagramUrl(
              url
            ),
          platform: "instagram",
          mediaType: "video",
          postKey: context.postKey,
          contentKind:
            context.contentKind,
          contentType: "video/mp4",
          source: "resource",
          sourcePriority: 25
        });
      } else if (
        context.contentKind ===
          "story" &&
        isInstagramImageUrl(url)
      ) {
        output.push({
          url:
            canonicalizeInstagramUrl(
              url
            ),
          platform: "instagram",
          mediaType: "image",
          postKey: context.postKey,
          contentKind: "story",
          source: "resource",
          sourcePriority: 20
        });
      }
    }

    storeAndPost(output);
  }

  try {
    rescanResources();

    new PerformanceObserver(
      (list) => {
        const context =
          instagramContext();
        const output = [];

        for (const entry of
          list.getEntries()) {
          const url = entry.name;

          if (
            url.startsWith(
              "https://video.twimg.com/"
            ) &&
            /\.(?:mp4|webm|m3u8)/i.test(
              url
            )
          ) {
            output.push({
              url,
              platform: "x",
              mediaType: "video",
              mediaKey:
                twitterMediaKey(url),
              source: "resource",
              sourcePriority: 30
            });
          } else if (
            isInstagramVideoUrl(url)
          ) {
            output.push({
              url:
                canonicalizeInstagramUrl(
                  url
                ),
              platform: "instagram",
              mediaType: "video",
              postKey:
                context.postKey,
              contentKind:
                context.contentKind,
              contentType:
                "video/mp4",
              source: "resource",
              sourcePriority: 25
            });
          } else if (
            context.contentKind ===
              "story" &&
            isInstagramImageUrl(url)
          ) {
            output.push({
              url:
                canonicalizeInstagramUrl(
                  url
                ),
              platform: "instagram",
              mediaType: "image",
              postKey:
                context.postKey,
              contentKind: "story",
              source: "resource",
              sourcePriority: 20
            });
          }
        }

        storeAndPost(output);
      }
    ).observe({
      type: "resource",
      buffered: true
    });
  } catch (_) {}

  window.addEventListener(
    "message",
    (event) => {
      if (
        event.source === window &&
        event.data?.source ===
          SOURCE &&
        event.data?.type ===
          "RESCAN_REQUEST"
      ) {
        rescanResources();
        storeAndPost([]);
      }
    }
  );
})();
