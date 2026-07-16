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

  // RGB / elevation wipe. A native range keeps mouse, touch and keyboard parity.
  const wipeRange = document.querySelector("#wipeRange");
  const wipeStage = document.querySelector(".wipe__stage");
  const wipeOutput = document.querySelector("#wipeOutput");

  const updateWipe = () => {
    if (!wipeRange || !wipeStage || !wipeOutput) return;
    const rgb = Number(wipeRange.value);
    const elevation = 100 - rgb;
    wipeStage.style.setProperty("--split", `${rgb}%`);
    wipeOutput.value = `${rgb} / ${elevation}`;
    wipeRange.setAttribute("aria-valuetext", `${rgb} por ciento RGB y ${elevation} por ciento elevación`);
  };

  wipeRange?.addEventListener("input", updateWipe);
  updateWipe();

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

  // Potree is injected only after explicit consent. The iframe is never created twice.
  const viewerShell = document.querySelector("#viewerShell");
  const loadViewerButton = document.querySelector("#loadViewer");
  const viewerStatus = document.querySelector("#viewerStatus");
  const viewerError = document.querySelector("#viewerError");
  let viewerTimeout;

  const setViewerError = () => {
    if (!viewerShell || !viewerStatus || !viewerError) return;
    viewerShell.dataset.state = "error";
    viewerStatus.textContent = "";
    viewerError.hidden = false;
  };

  loadViewerButton?.addEventListener("click", () => {
    if (!viewerShell || viewerShell.dataset.activated === "true") return;
    viewerShell.dataset.activated = "true";
    viewerShell.dataset.state = "loading";
    loadViewerButton.disabled = true;
    loadViewerButton.innerHTML = "<span aria-hidden='true'>···</span> Cargando visor";
    if (viewerStatus) viewerStatus.textContent = "Preparando experiencia 3D…";

    if (!navigator.onLine) {
      setViewerError();
      return;
    }

    const frame = document.createElement("iframe");
    frame.title = "Visor 3D de nube de puntos de un terreno boscoso";
    frame.src = "https://recorridos.dronemapping.mx/demo/terreno-boscoso/";
    frame.loading = "lazy";
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    frame.allow = "fullscreen";
    frame.setAttribute("allowfullscreen", "");
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-downloads allow-pointer-lock");

    frame.addEventListener("load", () => {
      window.clearTimeout(viewerTimeout);
      viewerShell.dataset.state = "ready";
      if (viewerStatus) viewerStatus.textContent = "Visor 3D listo";
      if (viewerError) viewerError.hidden = true;
    }, { once: true });

    frame.addEventListener("error", setViewerError, { once: true });
    viewerShell.append(frame);
    viewerTimeout = window.setTimeout(setViewerError, 15000);
  }, { once: true });

  const year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());
})();
