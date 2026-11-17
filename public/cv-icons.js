(function () {
  "use strict";

  const PATHS = window.CV_ICON_PATHS || {};

  const DISPLAY_STYLE = "domain"; // "domain" | "handle"

  const HANDLE_NOISE = /^(?:in|pub|u|user|users|users?\/[^/]+|profile|profiles|@|c|channel|company|school|r)\//i;

  const SPECIAL_HOSTS = [
    [/^scholar\.google\./i, "googlescholar"],
    [/^(?:mastodon\.|mstdn\.|.*\.social$)/i, "mastodon"],
  ];

  const HOST_INDEX = [];
  for (const [key, icon] of Object.entries(PATHS)) {
    for (const host of icon.hosts || []) HOST_INDEX.push({ host: host.toLowerCase(), key });
  }
  HOST_INDEX.sort((a, b) => b.host.length - a.host.length);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const BRACKETED_RE = /^\[[^\]]+\]$/;

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function isPlaceholder(value) {
    return BRACKETED_RE.test(clean(value));
  }

  function looksLikePhone(value) {
    const v = clean(value);
    if (/^tel:/i.test(v)) return true;
    if (!/^[+()\d][\d\s().+-]{5,}$/.test(v)) return false;
    return v.replace(/\D/g, "").length >= 6;
  }

  function looksLikeEmail(value) {
    const v = clean(value).replace(/^mailto:/i, "");
    return EMAIL_RE.test(v);
  }

  function stripScheme(value) {
    return clean(value)
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
  }

  const HOSTNAME_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

  function hostnameOf(value) {
    const withoutScheme = clean(value).replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
    const host = withoutScheme.split(/[/?#]/)[0].replace(/^www\./i, "").split(":")[0];
    return HOSTNAME_RE.test(host) ? host.toLowerCase() : "";
  }

  function absoluteUrl(value) {
    const v = clean(value);
    if (!v || isPlaceholder(v)) return "";
    if (looksLikeEmail(v)) return "mailto:" + v.replace(/^mailto:/i, "");
    if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return "";
    if (!hostnameOf(v)) return "";
    return "https://" + v.replace(/^\/+/, "").replace(/\/+$/, "");
  }

  function detect(value, hint) {
    const v = clean(value);
    if (!v || isPlaceholder(v)) return "";

    // 1. What the value says about itself.
    if (looksLikeEmail(v)) return "email";
    if (looksLikePhone(v)) return "phone";

    const host = hostnameOf(v);
    // Not a web address at all - a bare "@handle", a job title, a city.
    if (host) {
      for (const [pattern, key] of SPECIAL_HOSTS) {
        if (pattern.test(host) && PATHS[key]) return key;
      }
      for (const { host: candidate, key } of HOST_INDEX) {
        if (host === candidate || host.endsWith("." + candidate)) return key;
      }
      return "website";
    }

    // 2. Only now, the slot it came from.
    return hint === "location" ? "location" : "";
  }

  function detectCertain(value) {
    const key = detect(value);
    return key === "location" ? "" : key;
  }

  /** The text shown on the page for a contact value. */
  function pretty(value) {
    const v = clean(value);
    if (!v || isPlaceholder(v)) return v;
    if (looksLikeEmail(v)) return v.replace(/^mailto:/i, "");
    if (looksLikePhone(v)) return v.replace(/^tel:/i, "");
    if (!hostnameOf(v)) return v;

    const bare = stripScheme(v);
    if (DISPLAY_STYLE !== "handle") return bare;
    const slash = bare.indexOf("/");
    if (slash === -1) return bare;
    const trail = bare.slice(slash + 1).replace(HANDLE_NOISE, "");
    return trail || bare;
  }

  function isBareUrlText(text, href) {
    const t = clean(text);
    if (!t) return true;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return true;
    if (!href) return false;
    const target = stripScheme(href).toLowerCase();
    const shown = stripScheme(t).toLowerCase();
    return !!target && (shown === target || target.startsWith(shown) || shown.startsWith(target));
  }

  /** Inline <svg> for an icon key, or "" if there's no such icon. */
  function markup(key) {
    const icon = PATHS[key];
    if (!icon) return "";
    const rule = icon.rule === "evenodd" ? ' fill-rule="evenodd"' : "";
    return (
      `<svg class="cv-icon" data-icon="${escapeHtml(key)}" contenteditable="false" ` +
      `viewBox="0 0 ${icon.box} ${icon.box}" aria-hidden="true" focusable="false">` +
      `<title>${escapeHtml(icon.label)}</title><path${rule} d="${escapeHtml(icon.d)}"/></svg>`
    );
  }

  function element(key) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = markup(key);
    return wrapper.firstElementChild;
  }

  /** Glyph + a non-collapsing gap, for the PDF export's icon font. */
  function glyph(key) {
    const icon = PATHS[key];
    return icon ? icon.glyph + "\ue900" : "";
  }

  function captureCaret(root) {
    const selection = document.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) return null;
    const probe = range.cloneRange();
    probe.selectNodeContents(root);
    probe.setEnd(range.startContainer, range.startOffset);
    return probe.toString().length;
  }

  function restoreCaret(root, offset) {
    if (offset == null) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let seen = 0;
    let node = walker.nextNode();
    while (node) {
      const length = node.textContent.length;
      if (seen + length >= offset) {
        const range = document.createRange();
        range.setStart(node, Math.max(0, Math.min(length, offset - seen)));
        range.collapse(true);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      seen += length;
      node = walker.nextNode();
    }
  }

  function itemValue(item) {
    const anchor = item.querySelector("a[href]");
    if (anchor) {
      const href = anchor.getAttribute("href") || "";
      if (/^(mailto|tel):/i.test(href)) return href;
      const shown = clean(anchor.textContent);
      return hostnameOf(shown) ? shown : href;
    }
    return clean(item.textContent);
  }

  function syncItem(item) {
    const hint = item.dataset.contactField || "";
    const value = itemValue(item);
    const wanted = detect(value, hint);
    const existing = item.querySelector(":scope > svg.cv-icon");
    let changed = false;

    if (existing) {
      if (!wanted) { existing.remove(); changed = true; }
      else if (existing.dataset.icon !== wanted && !existing.dataset.iconPinned) {
        existing.replaceWith(element(wanted));
        changed = true;
      } else if (existing !== item.firstChild) {
        item.insertBefore(existing, item.firstChild);
        changed = true;
      }
    }

    const anchor = item.querySelector("a[href]");
    const textual = wanted && wanted !== "phone" && wanted !== "location";

    if (anchor && textual) {
      const href = anchor.getAttribute("href") || "";
      const shown = clean(anchor.textContent);
      const typedIsUrl = looksLikeEmail(shown) || Boolean(hostnameOf(shown));
      const target = absoluteUrl(typedIsUrl ? shown : href);
      if (target && target !== href) {
        anchor.setAttribute("href", target);
        anchor.title = target;
        changed = true;
      }
      if (isBareUrlText(shown, target || href)) {
        const tidy = pretty(target || href, hint);
        if (tidy && tidy !== shown) { anchor.textContent = tidy; changed = true; }
      }
    } else if (!anchor && textual) {
      const raw = clean(item.textContent);
      const target = absoluteUrl(raw);
      if (target) {
        for (const node of Array.from(item.childNodes)) {
          if (node !== existing && !(node.nodeType === 1 && node.classList.contains("cv-icon"))) node.remove();
        }
        const link = document.createElement("a");
        link.className = "cv-link";
        link.setAttribute("href", target);
        if (!/^mailto:/i.test(target)) {
          link.setAttribute("target", "_blank");
          link.setAttribute("rel", "noopener");
        }
        link.title = target;
        link.textContent = pretty(target, hint);
        item.appendChild(link);
        changed = true;
      }
    }
    return changed;
  }

  function sync(root) {
    if (!root) return false;
    const items = root.matches && root.matches(".cv-contact-item")
      ? [root]
      : Array.from(root.querySelectorAll(".cv-contact-item"));
    if (!items.length) return false;
    const caret = captureCaret(root);
    let changed = false;
    for (const item of items) changed = syncItem(item) || changed;
    if (changed && caret != null) restoreCaret(root, caret);
    return changed;
  }

  function suggestFor(item) {
    if (!item || item.querySelector(":scope > svg.cv-icon")) return "";
    if (item.dataset.iconDeclined) return "";
    return detectCertain(itemValue(item));
  }

  function addTo(item, key) {
    if (!item || !PATHS[key]) return false;
    const existing = item.querySelector(":scope > svg.cv-icon");
    if (existing) existing.remove();
    item.insertBefore(element(key), item.firstChild);
    delete item.dataset.iconDeclined;
    return true;
  }

  function removeFrom(item) {
    const existing = item && item.querySelector(":scope > svg.cv-icon");
    if (!existing) return false;
    existing.remove();
    item.dataset.iconDeclined = "1";
    return true;
  }

  function decline(item) {
    if (item) item.dataset.iconDeclined = "1";
  }

  /** The contact item an element sits in, if any. */
  function itemOf(node) {
    const el = node && node.nodeType === Node.ELEMENT_NODE ? node : node && node.parentElement;
    return el && el.closest ? el.closest(".cv-contact-item") : null;
  }

  window.CvIcons = {
    detect, detectCertain, pretty, markup, element, glyph, sync, isPlaceholder, stripScheme, absoluteUrl,
    suggestFor, addTo, removeFrom, decline, itemOf, paths: PATHS,
  };
})();
