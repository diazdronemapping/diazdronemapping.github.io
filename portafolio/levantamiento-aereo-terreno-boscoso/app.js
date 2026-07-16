(() => {
  "use strict";

  const root = document.documentElement;
  root.classList.add("js");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Graceful local-media fallbacks. The page remains legible while an asset is unavailable.
  const bindImageState = (image) => {
    const shell = image.closest(".media-shell");
    if (!shell) return;

    image.addEventListener("load", () => shell.classList.remove("is-error"));
    image.addEventListener("error", () => shell.classList.add("is-error"));

    if (image.complete && image.naturalWidth === 0) {
      shell.classList.add("is-error");
    }
  };

  document.querySelectorAll("img").forEach(bindImageState);

  // Quiet editorial reveals, disabled when the visitor requests reduced motion.
  const revealItems = [...document.querySelectorAll("[data-reveal]")];
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10%", threshold: 0.08 });

    revealItems.forEach((item) => revealObserver.observe(item));
  }

  // RGB / elevation wipe. The native range covers the image for mouse, touch and keyboard parity.
  const wipeRange = document.querySelector("#wipeRange");
  const wipeStage = document.querySelector(".wipe__stage");
  const wipeOutput = document.querySelector("#wipeOutput");

  const updateWipe = () => {
    if (!wipeRange || !wipeStage || !wipeOutput) return;
    const rgb = Number(wipeRange.value);
    const elevation = 100 - rgb;
    wipeStage.style.setProperty("--split", `${rgb}%`);
    wipeOutput.value = `${rgb}% RGB · ${elevation}% elevación`;
    wipeRange.setAttribute("aria-valuetext", `${rgb} por ciento RGB y ${elevation} por ciento elevación`);
    wipeStage.classList.add("has-dragged");
  };

  wipeRange?.addEventListener("input", updateWipe);
  wipeRange?.addEventListener("pointerdown", () => wipeStage?.classList.add("has-dragged"), { once: true });
  wipeRange?.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      wipeStage?.classList.add("has-dragged");
    }
  });

  let wipePointer = null;
  const updateWipeFromPointer = (event) => {
    if (!wipeRange || !wipeStage) return;
    const bounds = wipeStage.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / bounds.width;
    wipeRange.value = String(Math.round(Math.min(1, Math.max(0, ratio)) * 100));
    updateWipe();
  };

  wipeStage?.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary) return;
    wipePointer = event.pointerId;
    wipeStage.setPointerCapture?.(event.pointerId);
    updateWipeFromPointer(event);
  });
  wipeStage?.addEventListener("pointermove", (event) => {
    if (wipePointer !== event.pointerId) return;
    updateWipeFromPointer(event);
  });
  const finishWipe = (event) => {
    if (wipePointer !== event.pointerId) return;
    wipePointer = null;
    if (wipeStage?.hasPointerCapture?.(event.pointerId)) wipeStage.releasePointerCapture(event.pointerId);
  };
  wipeStage?.addEventListener("pointerup", finishWipe);
  wipeStage?.addEventListener("pointercancel", finishWipe);

  if (wipeRange && wipeStage && wipeOutput) {
    const rgb = Number(wipeRange.value);
    const elevation = 100 - rgb;
    wipeStage.style.setProperty("--split", `${rgb}%`);
    wipeOutput.value = `${rgb}% RGB · ${elevation}% elevación`;
  }

  // Accessible tab-carousel: click, arrow keys and previous/next controls share one state.
  const tabs = [...document.querySelectorAll(".view-tabs [role='tab']")];
  const viewStage = document.querySelector("#view-stage");
  const viewImage = document.querySelector("#viewImage");
  const viewLabel = document.querySelector("#viewLabel");
  const viewCaption = document.querySelector("#viewCaption");
  const galleryCount = document.querySelector("#galleryCount");
  const galleryPrev = document.querySelector("#galleryPrev");
  const galleryNext = document.querySelector("#galleryNext");
  let activeView = 0;

  const selectView = (index, moveFocus = false) => {
    if (!tabs.length || !viewStage || !viewImage || !viewLabel || !viewCaption) return;
    activeView = (index + tabs.length) % tabs.length;
    const selected = tabs[activeView];

    tabs.forEach((tab, tabIndex) => {
      const active = tabIndex === activeView;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });

    viewStage.classList.remove("is-error");
    viewStage.classList.add("is-loading");
    viewStage.setAttribute("aria-labelledby", selected.id);
    viewImage.alt = selected.dataset.alt || "Vista procesada del levantamiento aéreo";
    viewImage.src = selected.dataset.src || "";
    viewLabel.textContent = selected.textContent.trim();
    viewCaption.textContent = selected.dataset.caption || "";
    if (galleryCount) galleryCount.textContent = `${String(activeView + 1).padStart(2, "0")} / ${String(tabs.length).padStart(2, "0")}`;
    if (moveFocus) selected.focus();
    const tabList = selected.parentElement;
    tabList?.scrollTo({
      left: selected.offsetLeft - ((tabList.clientWidth - selected.offsetWidth) / 2),
      behavior: reduceMotion ? "auto" : "smooth"
    });

    if (viewImage.complete) {
      viewStage.classList.remove("is-loading");
    }
  };

  viewImage?.addEventListener("load", () => viewStage?.classList.remove("is-loading"));
  viewImage?.addEventListener("error", () => {
    viewStage?.classList.remove("is-loading");
    viewStage?.classList.add("is-error");
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectView(index));
    tab.addEventListener("keydown", (event) => {
      const keyActions = {
        ArrowRight: activeView + 1,
        ArrowLeft: activeView - 1,
        Home: 0,
        End: tabs.length - 1
      };
      if (!(event.key in keyActions)) return;
      event.preventDefault();
      selectView(keyActions[event.key], true);
    });
  });

  galleryPrev?.addEventListener("click", () => selectView(activeView - 1));
  galleryNext?.addEventListener("click", () => selectView(activeView + 1));

  // The large gallery also supports a horizontal swipe without blocking vertical page scroll.
  let swipePointer = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeLastX = 0;
  let swipeLastY = 0;

  const completeSwipe = (endX, endY) => {
    const deltaX = endX - swipeStartX;
    const deltaY = endY - swipeStartY;
    swipePointer = null;

    if (Math.abs(deltaX) < 34 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.2) return;
    selectView(activeView + (deltaX < 0 ? 1 : -1));
  };

  viewStage?.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.target.closest("button")) return;
    if (event.pointerType === "mouse") event.preventDefault();
    swipePointer = event.pointerId;
    viewStage.setPointerCapture?.(event.pointerId);
    swipeStartX = event.clientX;
    swipeStartY = event.clientY;
    swipeLastX = event.clientX;
    swipeLastY = event.clientY;
  });

  viewStage?.addEventListener("pointermove", (event) => {
    if (swipePointer !== event.pointerId) return;
    swipeLastX = event.clientX;
    swipeLastY = event.clientY;
  });

  viewStage?.addEventListener("pointerup", (event) => {
    if (swipePointer !== event.pointerId) return;
    completeSwipe(event.clientX, event.clientY);
    if (viewStage.hasPointerCapture?.(event.pointerId)) viewStage.releasePointerCapture(event.pointerId);
  });

  viewStage?.addEventListener("pointercancel", () => {
    if (swipePointer === null) return;
    completeSwipe(swipeLastX, swipeLastY);
  });

  if (viewImage) viewImage.draggable = false;

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
