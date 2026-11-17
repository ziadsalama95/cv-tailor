export function changedTextEnd(previous, next) {
  if (previous === next) return null;
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
  let oldEnd = previous.length, newEnd = next.length;
  while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) { oldEnd--; newEnd--; }
  // Keep the cursor outside a surrogate pair when a Unicode character changes.
  if (newEnd < next.length && /[\uDC00-\uDFFF]/.test(next[newEnd])) newEnd++;
  return newEnd;
}

export function createLiveResume(renderResume) {
  const scan = document.getElementById("sourceScan");
  const source = document.getElementById("sourceScanPage");
  const label = document.getElementById("sourceScanLabel");
  const draft = document.getElementById("liveDocument");
  const canvas = document.getElementById("liveDocumentCanvas");
  const paper = document.getElementById("liveResumePaper");
  let carousel = null;
  let frame = null;
  let active = false;
  let writing = false;
  let previousHtml = "";
  let motionFrame = null;
  let pan = 0;
  let targetPan = 0;
  let lastMotionTime = 0;
  let caretOffset = 0;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

  function animateCamera(time) {
    motionFrame = null;
    if (!active || !writing) return;
    const elapsed = Math.min(64, time - (lastMotionTime || time - 16));
    lastMotionTime = time;
    pan = reducedMotion.matches ? targetPan : pan + (targetPan - pan) * (1 - Math.exp(-elapsed / 180));
    if (Math.abs(targetPan - pan) < .2) pan = targetPan;
    paper.style.setProperty("--preview-pan", `${-pan}px`);
    if (pan !== targetPan) motionFrame = requestAnimationFrame(animateCamera);
    else lastMotionTime = 0;
  }

  function fitAndFollow() {
    if (!active || !writing) return;
    const scale = Math.min(1, canvas.clientWidth / paper.offsetWidth);
    paper.style.setProperty("--preview-scale", scale);
    const maxPan = Math.max(0, paper.scrollHeight * scale - canvas.clientHeight);
    targetPan = Math.min(targetPan, maxPan);
    const caret = paper.querySelector(".live-writing-caret");
    if (caret) {
      const writingY = caret.getBoundingClientRect().bottom - paper.getBoundingClientRect().top;
      const relativeY = writingY - targetPan;
      if (relativeY < canvas.clientHeight * .22 || relativeY > canvas.clientHeight * .78) {
        targetPan = Math.min(maxPan, Math.max(0, writingY - canvas.clientHeight * .55));
      }
    }
    if (motionFrame === null) motionFrame = requestAnimationFrame(animateCamera);
  }
  const resize = new ResizeObserver(() => fitAndFollow());
  resize.observe(canvas);
  document.fonts?.ready.then(() => fitAndFollow());

  function start({ pages = [], text = "" } = {}) {
    stop();
    active = true;
    writing = false;
    previousHtml = "";
    caretOffset = 0;
    pan = targetPan = lastMotionTime = 0;
    paper.style.setProperty("--preview-pan", "0px");
    paper.replaceChildren();
    draft.hidden = true;
    scan.hidden = false;
    document.querySelector(".live-workspace").classList.remove("is-writing");
    const textPages = text.match(/[\s\S]{1,1900}/g) || [text];
    const count = pages.length || Math.max(1, textPages.length);
    let index = 0;
    function showPage() {
      source.replaceChildren();
      if (pages.length) {
        const img = document.createElement("img");
        img.src = pages[index].imgUrl;
        img.alt = `Your resume, page ${index + 1}`;
        img.draggable = false;
        source.append(img);
      } else {
        const page = document.createElement("div");
        page.className = "source-text-page";
        for (const paragraph of (textPages[index] || "").split(/\n+/)) {
          const line = document.createElement("p");
          line.textContent = paragraph;
          page.append(line);
        }
        source.append(page);
      }
      label.textContent = count > 1 ? `Your resume · ${index + 1} / ${count}` : "Your resume";
      source.getAnimations().forEach(animation => animation.cancel());
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        source.animate([{ opacity: 0, transform: "translateY(12px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 650, easing: "cubic-bezier(.2,.8,.2,1)" });
      }
    }
    showPage();
    if (count > 1) carousel = setInterval(() => { index = (index + 1) % count; showPage(); }, 4400);
  }

  function update(data, { final = false } = {}) {
    if (!active) return false;
    const html = renderResume(data, { linksClickable: false });
    if (html === previousHtml && !final) return writing;
    previousHtml = html;
    const template = document.createElement("template");
    template.innerHTML = html;
    if (!final) {
      template.content.querySelectorAll(".cv-placeholder").forEach(node => node.remove());
      template.content.querySelectorAll(".cv-contact-item").forEach(node => {
        if (!node.textContent.trim()) node.remove();
      });
      template.content.querySelectorAll(".cv-contact").forEach(node => {
        if (!node.textContent.trim()) node.remove();
      });
      template.content.querySelectorAll(".cv-section").forEach(section => {
        if (![...section.children].some(node => !node.classList.contains("cv-section-title") && node.textContent.trim())) section.remove();
      });
    }
    // Stripped placeholders must not leave bullet markers or empty list spacing.
    template.content.querySelectorAll(".cv-bullets > li").forEach(item => {
      if (!item.textContent.trim()) item.remove();
    });
    template.content.querySelectorAll(".cv-bullets").forEach(list => {
      if (!list.querySelector("li")) list.remove();
    });
    const hasContent = [...template.content.querySelectorAll(".cv-name,.cv-title,.cv-summary,.cv-entry-role,.cv-skill-row")].some(node => node.textContent.trim());
    if (!hasContent) return false;
    if (!writing) {
      writing = true;
      clearInterval(carousel);
      scan.hidden = true;
      draft.hidden = false;
      document.querySelector(".live-workspace").classList.add("is-writing");
    }
    const nextText = template.content.textContent;
    const changedEnd = changedTextEnd(paper.textContent, nextText);
    if (changedEnd !== null) caretOffset = changedEnd;
    caretOffset = Math.min(caretOffset, nextText.length);
    paper.replaceChildren(template.content);
    if (!final && nextText.trim()) {
      const walker = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT);
      let remaining = caretOffset, node;
      while ((node = walker.nextNode())) {
        if (remaining <= node.length) break;
        remaining -= node.length;
      }
      const caret = document.createElement("span");
      caret.className = "live-writing-caret";
      caret.setAttribute("aria-hidden", "true");
      if (node) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);
        range.insertNode(caret);
      }
    }
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => fitAndFollow());
    return true;
  }

  function stop() {
    active = false;
    clearInterval(carousel);
    cancelAnimationFrame(frame);
    cancelAnimationFrame(motionFrame);
    motionFrame = null;
    carousel = frame = null;
  }
  return { start, update, stop };
}
