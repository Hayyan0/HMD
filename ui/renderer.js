const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

window.electronAPI = {
  send: (channel, ...args) => {
    const cmd = channel.replace(/-/g, "_");
    invoke(
      cmd,
      args.length === 1 ? { payload: args[0] } : { payload: args },
    ).catch((err) => console.error(`[IPC] Error in ${channel}:`, err));
  },
  invoke: (channel, ...args) => {
    const cmd = channel.replace(/-/g, "_");
    return invoke(
      cmd,
      args.length === 1 ? { payload: args[0] } : { payload: args },
    );
  },
  on: (channel, callback) => {
    listen(channel, (event) => callback(event.payload));
  },
};

function isNewer(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (l[i] > (c[i] || 0)) return true;
    if (l[i] < (c[i] || 0)) return false;
  }
  return false;
}

document.addEventListener("DOMContentLoaded", () => {
    // Listen for debug logs from backend
    window.electronAPI.on("debug-log", (msg) => {
        console.log(`%c[DEBUG] ${msg}`, "color: cyan; font-weight: bold;");
    });
    
  const confirmModal = document.getElementById("confirm-modal");
  const confirmModalTitle = document.getElementById("confirm-modal-title");
  const confirmModalMessage = document.getElementById("confirm-modal-message");
  const confirmModalOk = document.getElementById("confirm-modal-ok");
  const confirmModalCancel = document.getElementById("confirm-modal-cancel");
  const confirmModalClose = document.getElementById("confirm-modal-close");

  const errorModal = document.getElementById("error-modal");
  const errorTraceback = document.getElementById("error-traceback");
  const errorModalOk = document.getElementById("error-modal-ok");
  const errorModalCopy = document.getElementById("error-modal-copy");
  const errorModalClose = document.getElementById("error-modal-close");

  const sidebar = document.getElementById("app-sidebar");
  const sidebarOverlay = document.getElementById("sidebar-overlay");
  const depModal = document.getElementById("dep-modal");
  const depModalTitle = depModal.querySelector("h3");
  const depProgress = document.getElementById("dep-progress");
  const depStatus = document.getElementById("dep-status");
  const updateBtn = document.getElementById("update-notification-btn");
  const appStatus = document.getElementById("app-status");
  const cookieStatusDot = document.getElementById("cookie-status-dot");
  const cookieStatusText = document.getElementById("cookie-status-text");
  const clearCookiesBtn = document.getElementById("clear-cookies-btn");
  const importCookiesBtn = document.getElementById("import-cookies-btn");
  const urlInput = document.getElementById("url-input");
  const fetchBtn = document.getElementById("download-btn");
  const listBody = document.getElementById("download-list-body");
  const emptyState = document.getElementById("empty-state");
  const modal = document.getElementById("config-modal");
  const modalThumb = document.getElementById("modal-thumb");
  const modalTitle = document.getElementById("modal-title");
  const modalChannel = document.getElementById("modal-channel");
  const qualitySelect = document.getElementById("quality-select");
  const pathInput = document.getElementById("output-dir");
  const browseBtn = document.getElementById("browse-btn");
  const confirmBtn = document.getElementById("confirm-download-btn");
  const hamburgerBtn = document.getElementById("hamburger-btn");
  const closeSidebarBtn = document.getElementById("close-sidebar");
  const settingsBtn = document.getElementById("settings-btn");
  const quitBtn = document.getElementById("quit-btn");
  const onCompleteSelect = document.getElementById("on-complete-select");
  const settingsOnCompleteSelect = document.getElementById("settings-on-complete-select");
  const viewHome = document.getElementById("view-home");
  const viewSettings = document.getElementById("view-settings");
  const settingsBackBtn = document.getElementById("settings-back-btn");

  let availableUpdate = null;
  let hasSystemUpdate = false;
  const downloads = {};
  let currentConfig = null;

  async function checkForUpdates() {
    console.log("[Updater] Starting check...");
    try {
      const release = await window.electronAPI.invoke("check_for_updates");
      if (!release) {
        console.log("[Updater] No release found or error in check_for_updates");
        return;
      }

      const currentVersion = await window.electronAPI.invoke("get_app_version");
      const latestVersion = release.tag_name.replace('v', '');
      
      console.log(`[Updater] Current version: ${currentVersion}`);
      console.log(`[Updater] Latest release tag: ${release.tag_name}`);
      console.log(`[Updater] Computed latest version: ${latestVersion}`);
      
      if (isNewer(latestVersion, currentVersion)) {
        console.log("[Updater] New version available:", latestVersion);
        availableUpdate = release;
        
        // Update notification UI if no system update is already showing
        if (!hasSystemUpdate) {
          updateBtn.querySelector("span").textContent = `${release.tag_name} AVAILABLE`;
          updateBtn.classList.remove("hidden");
          appStatus.style.display = "none";
        }
      }
    } catch (e) {
      console.error("[Updater] Custom check failed:", e);
    }
  }

  checkForUpdates();

  document.addEventListener("contextmenu", (e) => {
    if (e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
    }
  });

  let selectedPlaylistIndices = new Set();
  let lastSelectedIndex = null;
  let playlistEntries = [];

  document
    .getElementById("min-btn")
    .addEventListener("click", () => window.electronAPI.send("minimize-app"));
  document
    .getElementById("max-btn")
    .addEventListener("click", () => window.electronAPI.send("maximize-app"));
  document
    .getElementById("close-btn")
    .addEventListener("click", () => window.electronAPI.send("close-app"));

  let onCompleteAction = "none";
  let currentStep = 1;



  const formatCards = document.querySelectorAll(".format-card");
  const steps = document.querySelectorAll(".step-content");
  const nextBtns = document.querySelectorAll(".btn-next");
  const backBtns = document.querySelectorAll(".btn-back");






  const videoExtSelect = document.getElementById("pref-video-ext");
  const audioExtSelect = document.getElementById("pref-audio-ext");
  const thumbExtSelect = document.getElementById("pref-thumb-ext");
  const hwAccelSelect = document.getElementById("pref-hw-accel");
  const strictModeSelect = document.getElementById("pref-strict-mode");

  if (videoExtSelect) videoExtSelect.value = localStorage.getItem("pref-video-ext") || "mp4";
  if (audioExtSelect) audioExtSelect.value = localStorage.getItem("pref-audio-ext") || "mp3";
  if (thumbExtSelect) thumbExtSelect.value = localStorage.getItem("pref-thumb-ext") || "webp";
  if (hwAccelSelect) hwAccelSelect.value = localStorage.getItem("pref-hw-accel") || "auto";
  if (strictModeSelect) strictModeSelect.value = localStorage.getItem("pref-strict-mode") || "on";

  videoExtSelect?.addEventListener("change", () => localStorage.setItem("pref-video-ext", videoExtSelect.value));
  audioExtSelect?.addEventListener("change", () => localStorage.setItem("pref-audio-ext", audioExtSelect.value));
  thumbExtSelect?.addEventListener("change", () => localStorage.setItem("pref-thumb-ext", thumbExtSelect.value));
  hwAccelSelect?.addEventListener("change", () => localStorage.setItem("pref-hw-accel", hwAccelSelect.value));
  strictModeSelect?.addEventListener("change", () => localStorage.setItem("pref-strict-mode", strictModeSelect.value));

  if (onCompleteSelect && settingsOnCompleteSelect) {
    onCompleteSelect.addEventListener("change", () => {
      settingsOnCompleteSelect.value = onCompleteSelect.value;
      onCompleteAction = onCompleteSelect.value;
    });
    settingsOnCompleteSelect.addEventListener("change", () => {
      onCompleteSelect.value = settingsOnCompleteSelect.value;
      onCompleteAction = settingsOnCompleteSelect.value;
    });
  }


  const qualityOptions = {
    video: {
      "Best Available": "bestvideo+bestaudio/best",
      "4K (2160p)":
        "bestvideo[height<=2160]+bestaudio/best[height<=2160]",
      "1080p":
        "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
      "720p":
        "bestvideo[height<=720]+bestaudio/best[height<=720]",
      "480p":
        "bestvideo[height<=480]+bestaudio/best[height<=480]",
    },
    audio: {
      "High Quality (MP3)": "0",
      "Medium Quality (MP3)": "5",
      "Low Quality (MP3)": "9",
    },
    thumbnail: {
      "Maximum Resolution": "maxres",
    },
  };

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "v") {
      if (document.activeElement !== urlInput) {
        navigator.clipboard.readText().then((text) => {
          urlInput.value = text;
          handleFetch();
        });
      }
    }
  });

  fetchBtn.addEventListener("click", handleFetch);

  function isSupportedDomain(url) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const supported = [
        "youtube.com",
        "youtu.be",
        "instagram.com",
        "facebook.com",
        "twitter.com",
        "x.com",
        "fb.com",
        "fb.watch",
      ];
      return supported.some(
        (domain) => hostname === domain || hostname.endsWith("." + domain),
      );
    } catch (e) {
      return false;
    }
  }

  async function handleFetch() {
    const url = urlInput.value.trim();
    if (!url) return;

    const isStrict = (localStorage.getItem("pref-strict-mode") || "on") === "on";
    if (isStrict && !isSupportedDomain(url)) {
      const confirmed = await showConfirm(
        "UNSUPPORTED SITE",
        "This site is not officially supported and may fail. You can ignore this by disabling 'Supported Sites Only' in settings.",
        "GO TO SETTINGS",
        "CANCEL",
      );
      if (confirmed) {
        switchView("view-settings");
      }
      return;
    }

    fetchBtn.disabled = true;
    fetchBtn.querySelector(".label").textContent = "FETCHING...";

    try {
      const info = await window.electronAPI.invoke("get-video-info", url);
      showModal(url, info);
    } catch (err) {
      console.error(err);
      if (err.includes("Sign in to confirm your age")) {
        showAgeRestrictionModal();
      } else if (err.includes("Sign in to confirm you’re not a bot")) {
        showBotDetectionModal();
      } else {
        showAlert("FETCH ERROR", `Failed to fetch info: ${err}`);
      }
    } finally {
      fetchBtn.disabled = false;
      fetchBtn.querySelector(".label").textContent = "FETCH INFO";
    }
  }

  function showModal(url, info) {
    console.log("Fetched video info:", info);
    currentConfig = { url, info, type: "video", quality: "", path: "" };

    const playlistSection = document.getElementById("playlist-section");
    selectedPlaylistIndices.clear();
    lastSelectedIndex = null;

    const playlistFooterNav = document.getElementById("playlist-footer-nav");
    const step1Placeholder = document.getElementById("step1-placeholder");

    if (info.entries && Array.isArray(info.entries)) {
      playlistEntries = info.entries;
      playlistEntries.forEach((_, idx) => selectedPlaylistIndices.add(idx));
      renderPlaylist();
      playlistSection.classList.remove("hidden");
      if (playlistFooterNav) playlistFooterNav.classList.remove("hidden");
      if (step1Placeholder) step1Placeholder.classList.add("hidden");

      const mainThumb = getBestThumbnail(info);
      modalThumb.src = mainThumb;
      modalThumb.onerror = () => {
        modalThumb.src = "assets/youtube.svg";
      };
      modalChannel.textContent = info.uploader || "HMD Playlist";
    } else {
      playlistEntries = [];
      playlistSection.classList.add("hidden");
      if (playlistFooterNav) playlistFooterNav.classList.add("hidden");
      if (step1Placeholder) step1Placeholder.classList.remove("hidden");

      modalThumb.src = getBestThumbnail(info);
      modalThumb.onerror = () => {
        modalThumb.src = "assets/youtube.svg";
      };
      modalChannel.textContent = info.uploader || "Unknown";
    }

    modalTitle.textContent = info.title;

    const defaultCard = document.querySelector(
      '.format-card[data-type="video"]',
    );
    if (defaultCard) {
      formatCards.forEach((c) => c.classList.remove("selected"));
      defaultCard.classList.add("selected");
      currentConfig.type = "video";
    }

    goToStep(1);
    modal.classList.remove("hidden");
  }

  function renderPlaylist() {
    const container = document.getElementById("playlist-items-container");
    container.innerHTML = "";

    playlistEntries.forEach((entry, idx) => {
      const item = document.createElement("div");
      item.className = "playlist-item";
      if (selectedPlaylistIndices.has(idx)) item.classList.add("selected");
      item.dataset.index = idx;

      const duration = formatDuration(entry.duration);

      item.innerHTML = `
                <div class="item-checkbox"></div>
                <img src="${getBestThumbnail(entry)}" class="item-thumb" onerror="this.src='assets/youtube.svg'">
                <div class="item-info">
                    <h5>${entry.title}</h5>
                    <span class="duration">${duration}</span>
                </div>
            `;

      item.addEventListener("click", (e) => handlePlaylistClick(e, idx));
      container.appendChild(item);
    });

    updateSelectionStats();
  }

  function handlePlaylistClick(e, index) {
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(index, lastSelectedIndex);
      const end = Math.max(index, lastSelectedIndex);

      const shouldSelect = !selectedPlaylistIndices.has(index);

      for (let i = start; i <= end; i++) {
        if (shouldSelect) selectedPlaylistIndices.add(i);
        else selectedPlaylistIndices.delete(i);
      }
    } else {
      if (selectedPlaylistIndices.has(index)) {
        selectedPlaylistIndices.delete(index);
      } else {
        selectedPlaylistIndices.add(index);
      }
    }

    lastSelectedIndex = index;
    renderPlaylist();
  }

  function updateSelectionStats() {
    const count = selectedPlaylistIndices.size;
    const countEl = document.getElementById("playlist-selection-count-nav");
    if (countEl) countEl.textContent = `${count} VIDEOS SELECTED`;
  }

  document
    .getElementById("playlist-select-all")
    .addEventListener("click", () => {
      playlistEntries.forEach((_, idx) => selectedPlaylistIndices.add(idx));
      renderPlaylist();
    });

  document
    .getElementById("playlist-deselect-all")
    .addEventListener("click", () => {
      selectedPlaylistIndices.clear();
      renderPlaylist();
    });

  function formatDuration(seconds) {
    if (!seconds) return "---";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0)
      return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function getBestThumbnail(item) {
    if (!item) return "assets/youtube.svg";
    if (item.thumbnail && typeof item.thumbnail === "string")
      return item.thumbnail;
    if (
      item.thumbnails &&
      Array.isArray(item.thumbnails) &&
      item.thumbnails.length > 0
    ) {
      return item.thumbnails[item.thumbnails.length - 1].url;
    }
    return "assets/youtube.svg";
  }

  function goToStep(step) {
    currentStep = step;
    steps.forEach((s, idx) => {
      s.classList.toggle("active", idx === step - 1);
      s.classList.toggle("hidden", idx !== step - 1);
    });

    for (let i = 1; i <= 3; i++) {
      const nav = document.getElementById(`nav-step-${i}`);
      if (nav) {
        nav.classList.toggle("hidden", i !== step);
      }
    }

    if (step === 2 || (step === 3 && currentConfig.type === "thumbnail")) {
      updateQualityDropdown();
    }
  }

  function updateQualityDropdown() {
    qualitySelect.innerHTML = "";
    const info = currentConfig.info;

    if (currentConfig.type === "video" && info && info.formats) {
      const bestOpt = document.createElement("option");
      bestOpt.value = qualityOptions.video["Best Available"];
      bestOpt.textContent = "Best Available";
      qualitySelect.appendChild(bestOpt);

      const heights = [
        ...new Set(
          info.formats
            .filter((f) => f.height && f.vcodec && f.vcodec !== "none" && f.vcodec !== "images" && f.ext !== "mhtml")
            .map((f) => f.height),
        ),
      ].sort((a, b) => b - a);

      heights.forEach((height) => {
        const opt = document.createElement("option");
        opt.value = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

        let label = `${height}p`;
        if (height >= 2160) label = `4K (${height}p)`;
        else if (height >= 1440) label = `2K (${height}p)`;
        else if (height >= 1080) label = `Full HD (${height}p)`;
        else if (height >= 720) label = `HD (${height}p)`;

        opt.textContent = label;
        qualitySelect.appendChild(opt);
      });
    } else if (currentConfig.type === "audio" && info && info.formats) {
      const bestOpt = document.createElement("option");
      bestOpt.value = "bestaudio/best";
      bestOpt.textContent = "Best Available Quality";
      qualitySelect.appendChild(bestOpt);

      const bitrates = [
        ...new Set(
          info.formats
            .filter((f) => f.abr && f.vcodec === "none")
            .map((f) => Math.round(f.abr)),
        ),
      ].sort((a, b) => b - a);

      if (bitrates.length > 0) {
        bitrates.forEach((abr) => {
          const opt = document.createElement("option");
          opt.value = `bestaudio[abr<=${abr}]/bestaudio`;
          opt.textContent = `${abr}kbps`;
          qualitySelect.appendChild(opt);
        });
      } else {
        const opts = qualityOptions.audio || {};
        for (const [name, val] of Object.entries(opts)) {
          const opt = document.createElement("option");
          opt.value = val;
          opt.textContent = name;
          qualitySelect.appendChild(opt);
        }
      }
    } else {
      const opts = qualityOptions[currentConfig.type] || {};
      for (const [name, val] of Object.entries(opts)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = name;
        qualitySelect.appendChild(opt);
      }
    }
  }

  formatCards.forEach((card) => {
    card.addEventListener("click", () => {
      formatCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      currentConfig.type = card.dataset.type;
    });
  });

  nextBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      if (currentStep === 1 && currentConfig.type === "thumbnail") {
        goToStep(3);
      } else {
        goToStep(currentStep + 1);
      }
    }),
  );
  backBtns.forEach((btn) =>
    btn.addEventListener("click", () => {
      if (currentStep === 3 && currentConfig.type === "thumbnail") {
        goToStep(1);
      } else {
        goToStep(currentStep - 1);
      }
    }),
  );

  document
    .getElementById("close-modal")
    .addEventListener("click", () => modal.classList.add("hidden"));

  browseBtn.addEventListener("click", async () => {
    const path = await window.electronAPI.invoke("select-folder");
    if (path) pathInput.value = path;
  });

  confirmBtn.addEventListener("click", () => {
    if (!pathInput.value) {
      alert("Please select a destination folder.");
      return;
    }
    currentConfig.quality = qualitySelect.value;
    currentConfig.path = pathInput.value;

    if (playlistEntries.length > 0) {
      if (selectedPlaylistIndices.size === 0) {
        alert("Please select at least one video to download.");
        return;
      }

      const playlistTitle = currentConfig.info.title;
      const subfolder = sanitizeFilename(playlistTitle);
      const basePath = pathInput.value;
      const finalPath = `${basePath}/${subfolder}`;

      const groupId = `group_${Date.now()}`;
      const groupDownload = {
        id: groupId,
        title: playlistTitle,
        thumb: modalThumb.src,
        type: "playlist",
        qualityName: qualitySelect.options[qualitySelect.selectedIndex].text,
        path: finalPath,
        progress: 0,
        status: "INITIALIZING",
        isGroup: true,
        children: [],
        element: null,
      };
      downloads[groupId] = groupDownload;
      addDownloadRow(groupDownload);

      selectedPlaylistIndices.forEach((idx) => {
        const entry = playlistEntries[idx];
        const childId = `${groupId}_${idx}`;
        const config = {
          ...currentConfig,
          url: entry.url || currentConfig.url,
          info: entry,
          path: finalPath,
          playlistIndex: idx + 1,
        };

        const childDownload = startDownload(null, config, childId, groupId);
        groupDownload.children.push(childId);
      });
    } else {
      startDownload();
    }

    modal.classList.add("hidden");
    urlInput.value = "";
  });

  function startDownload(
    resumeId = null,
    playlistConfig = null,
    customId = null,
    parentId = null,
  ) {
    let id, args, download;
    let config = playlistConfig || currentConfig;

    if (resumeId) {
      id = resumeId;
      download = downloads[id];
      args = download.args;
      download.status = "INITIALIZING";
      updateDownloadUI(id);
    } else {
      id =
        customId ||
        Date.now().toString() +
          (playlistConfig ? `_${playlistConfig.playlistIndex}` : "");

      args = {
        id: id,
        url: config.url,
        type: config.type,
        quality: config.quality,
        outputDir: config.path,
        videoExt: videoExtSelect.value,
        audioExt: audioExtSelect.value,
        thumbExt: thumbExtSelect.value,
        hwAccel: hwAccelSelect.value,
      };

      download = {
        id,
        args,
        videoId: config.info.id,
        title: config.info.title,
        thumb: getBestThumbnail(config.info),
        type: config.type,
        qualityName: qualitySelect.selectedIndex !== -1 && qualitySelect.options[qualitySelect.selectedIndex] 
          ? qualitySelect.options[qualitySelect.selectedIndex].text 
          : (config.type === "thumbnail" ? "Maximum Resolution" : "Default"),
        path: config.path,
        progress: 0,
        status: "INITIALIZING",
        parentId,
        element: null,
      };
      downloads[id] = download;
      addDownloadRow(download);
    }

    window.electronAPI.invoke("start-download", args).catch((err) => {
      console.error(`Download ${id} failed to start:`, err);
      download.status = "ERROR";
      updateDownloadUI(id);
    });
    return download;
  }

  function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*]/g, "_").trim();
  }

  function addDownloadRow(dl) {
    if (emptyState) emptyState.classList.add("hidden");

    const row = document.createElement("tr");
    row.id = `dl-${dl.id}`;

    if (dl.isGroup) row.classList.add("group-row");
    if (dl.parentId) row.classList.add("child-row", `parent-${dl.parentId}`);

    const expandBtn = dl.isGroup
      ? `
            <button class="expand-btn" data-id="${dl.id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
            </button>
        `
      : "";

    row.innerHTML = `
            <td class="col-preview">
                <img src="${dl.thumb}" class="row-thumb" onerror="this.src='assets/youtube.svg'">
            </td>
            <td class="col-title row-title-cell">
                <div class="group-title-wrapper">
                    ${expandBtn}
                    <h4>${dl.title}</h4>
                </div>
            </td>
            <td class="col-quality">
                <p>${dl.type.toUpperCase()} // ${dl.qualityName}</p>
            </td>
            <td class="col-progress">
                <div class="progress-cell-inner">
                    <div class="progress-info">
                        <span class="status-tag">${dl.status}</span>
                        <div class="stats-mini">
                            <span class="percent">0%</span>
                            <span class="speed">---</span>
                        </div>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: 0%"></div>
                    </div>
                </div>
            </td>
            <td class="col-actions">
                <div class="row-actions-group">
                    <button class="control-btn pause-btn" data-id="${dl.id}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                    </button>
                    <button class="control-btn cancel-btn" data-id="${dl.id}">✕</button>
                </div>
            </td>
        `;

    if (dl.isGroup) {
      const btn = row.querySelector(".expand-btn");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        btn.classList.toggle("active");
        const children = listBody.querySelectorAll(`.parent-${dl.id}`);
        children.forEach((child) => child.classList.toggle("expanded"));
      });
    }

    row.querySelector(".row-thumb").addEventListener("click", (e) => {
      e.stopPropagation();
      // Ensure path uses backslashes for Windows explorer compatibility
      const targetPath = dl.path.includes(":") ? dl.path.replace(/\//g, "\\") : dl.path;
      window.electronAPI.invoke("open-path", targetPath);
    });

    row.querySelector(".cancel-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      showCancelConfirmModal(dl.id);
    });

    row.querySelector(".pause-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      togglePause(dl.id);
    });

    if (dl.parentId) {
      const parentRow = document.getElementById(`dl-${dl.parentId}`);
      if (parentRow) {
        parentRow.after(row);
      } else {
        listBody.prepend(row);
      }
    } else {
      listBody.prepend(row);
    }

    dl.element = row;
  }

  function updateParentProgress(parentId) {
    const parent = downloads[parentId];
    if (!parent || !parent.isGroup) return;

    const children = Object.values(downloads).filter(
      (d) => d.parentId === parentId,
    );
    if (children.length === 0) return;

    const totalProgress = children.reduce(
      (sum, child) => sum + (child.progress || 0),
      0,
    );
    const avgProgress = (totalProgress / children.length).toFixed(1);

    parent.progress = parseFloat(avgProgress);

    const row = parent.element;
    if (row) {
      row.querySelector(".progress-bar-fill").style.width = `${avgProgress}%`;
      row.querySelector(".percent").textContent = `${avgProgress}%`;

      const statuses = new Set(children.map((c) => c.status));
      if (statuses.has("DOWNLOADING")) parent.status = "DOWNLOADING";
      else if (statuses.has("FINALIZING")) parent.status = "FINALIZING";
      else if (statuses.has("INITIALIZING")) parent.status = "INITIALIZING";
      else if (children.every((c) => c.status === "COMPLETED"))
        parent.status = "COMPLETED";
      else if (children.every((c) => c.status === "PAUSED"))
        parent.status = "PAUSED";
      else parent.status = "QUEUED";

      updateDownloadUI(parentId);
    }
  }

  function togglePause(id) {
    const dl = downloads[id];
    if (!dl) return;

    if (dl.isGroup) {
      const isPaused = dl.status === "PAUSED";
      dl.children.forEach((childId) => togglePause(childId));
      updatePauseIcon(id, !isPaused);
      return;
    }

    const activeStates = ["DOWNLOADING", "INITIALIZING", "FINALIZING"];
    const resumableStates = ["PAUSED", "ERROR", "CANCELLED"];

    if (activeStates.includes(dl.status)) {
      dl.isPausing = true;
      dl.status = "PAUSED";
      dl.lastSpeedValue = 0;
      updateDownloadUI(id);
      updatePauseIcon(id, true);
      updateGlobalStats();
      window.electronAPI.invoke("cancel-download", id);
    } else if (resumableStates.includes(dl.status)) {
      dl.isPausing = false;
      dl.isCancelling = false;
      dl.status = "RESUMING";
      updateDownloadUI(id);
      updatePauseIcon(id, false);
      startDownload(id);
    }
  }

  function updatePauseIcon(id, isPaused) {
    const dl = downloads[id];
    if (!dl || !dl.element) return;
    const btn = dl.element.querySelector(".pause-btn");
    if (isPaused) {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
    } else {
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    }
  }

  function updateDownloadUI(id) {
    const dl = downloads[id];
    if (!dl || !dl.element) return;
    const row = dl.element;
    const tag = row.querySelector(".status-tag");
    tag.textContent = dl.status;

    if (dl.status === "COMPLETED") {
      tag.style.color = "var(--success)";
      // Update buttons for completed downloads
      const actionsGroup = row.querySelector(".row-actions-group");
      if (actionsGroup) {
        actionsGroup.innerHTML = `
          <button class="control-btn open-btn" data-id="${dl.id}" title="Open Folder">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          </button>
          <button class="control-btn delete-btn" data-id="${dl.id}" title="Remove from list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        `;
        actionsGroup.querySelector(".open-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          const targetPath = dl.path.includes(":") ? dl.path.replace(/\//g, "\\") : dl.path;
          window.electronAPI.invoke("open-path", targetPath);
        });
        actionsGroup.querySelector(".delete-btn").addEventListener("click", (e) => {
          e.stopPropagation();
          removeDownload(dl.id);
        });
      }
    } else if (dl.status === "ERROR") tag.style.color = "var(--error)";
    else if (dl.status === "PAUSED" || dl.status === "CANCELLED")
      tag.style.color = "var(--text-low)";
    else tag.style.color = "var(--accent-primary)";
  }

  function removeDownload(id) {
    const dl = downloads[id];
    if (!dl) return;

    if (dl.isGroup) {
      // Recursively remove children and delete their files
      dl.children.forEach(childId => {
        const child = downloads[childId];
        if (child) {
          if (child.finalPath) {
             window.electronAPI.invoke("delete_file", child.finalPath);
          }
          if (child.element) {
            child.element.remove();
          }
          delete downloads[childId];
        }
      });
    } else {
      // Delete physical file for single items
      if (dl.finalPath) {
        window.electronAPI.invoke("delete_file", dl.finalPath);
      }
    }

    if (dl.element) {
      dl.element.remove();
    }
    delete downloads[id];
    if (Object.keys(downloads).length === 0 && emptyState) {
      emptyState.classList.remove("hidden");
    }
    updateGlobalStats();
  }

  window.electronAPI.on("ytdlp-output", (payload) => {
    const { id, data } = payload;
    const dl = downloads[id];
    if (!dl || !dl.element || dl.isPausing || dl.isCancelling) return;
    if (dl.status === "PAUSED" || dl.status === "CANCELLED") return;

    const row = dl.element;
    const lines = data.split(/[\r\n]+/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const percentMatch = trimmed.match(
        /\[download\]\s+([\d.]+)%\s+of\s+(?:~?)\s*(.+?)(?:\s+at\s+(.+?)\s+ETA\s+(.+?))?$/i,
      );
      if (percentMatch) {
        const [, percent, size, speed, eta] = percentMatch;
        const fill = row.querySelector(".progress-bar-fill");
        const pText = row.querySelector(".percent");
        const sText = row.querySelector(".speed");

        fill.style.width = `${percent}%`;
        pText.textContent = `${percent}%`;
        
        let formattedEta = "---";
        if (eta) {
          const parts = eta.split(":");
          if (parts.length === 3) { // HH:MM:SS
            const h = parseInt(parts[0]);
            const m = parseInt(parts[1]);
            formattedEta = h > 0 ? `${h}h ${m}m` : `${m}m`;
          } else if (parts.length === 2) { // MM:SS
            formattedEta = `${parseInt(parts[0])}m`;
          } else {
            formattedEta = eta;
          }
        }

        sText.textContent = speed ? `${speed} // ETA: ${formattedEta}` : "---";

        dl.progress = parseFloat(percent);
        if (dl.parentId) updateParentProgress(dl.parentId);

        if (speed) {
          dl.lastSpeed = speed;
          dl.lastSpeedValue = parseSpeed(speed);
        }

        if (dl.status !== "DOWNLOADING") {
          dl.status = "DOWNLOADING";
          updateDownloadUI(id);
        }
        updateGlobalStats();
        continue;
      }

      if (trimmed.includes("[Merger]") || trimmed.includes("[ExtractAudio]")) {
        if (dl.status !== "FINALIZING") {
          dl.status = "FINALIZING";
          updateDownloadUI(id);
        }
      }
    }
  });

  window.electronAPI.on("download-finished", (payload) => {
    const { id, code, path } = payload;
    const dl = downloads[id];
    if (!dl || !dl.element) return;

    if (path) dl.finalPath = path;

    if (dl.isPausing || dl.isCancelling) return;
    if (["PAUSED", "CANCELLED", "COMPLETED", "ERROR"].includes(dl.status))
      return;

    dl.status = code === 0 ? "COMPLETED" : "ERROR";
    updateDownloadUI(id);
    updateGlobalStats();

    if (code === 0) {
      dl.progress = 100;
      const row = dl.element;
      row.querySelector(".progress-bar-fill").style.width = "100%";
      row.querySelector(".percent").textContent = "100%";
    }
    if (dl.parentId) updateParentProgress(dl.parentId);
  });

  window.electronAPI.on("download-error", (payload) => {
    const { id, error } = payload;
    const dl = downloads[id];
    if (!dl) return;

    if (dl.isCancelling || dl.isPausing) return;

    dl.status = "ERROR";
    updateDownloadUI(id);
    updateGlobalStats();
    if (dl.parentId) updateParentProgress(dl.parentId);

    if (error.includes("Sign in to confirm you’re not a bot")) {
        showBotDetectionModal();
    } else {
        showErrorModal(dl.title, error);
    }
  });

  function showErrorModal(title, traceback) {
    errorTraceback.textContent = `[TARGET: ${title}]\n\n${traceback}`;
    errorModal.classList.remove("hidden");

    const cleanup = () => {
      errorModal.classList.add("hidden");
      errorModalOk.removeEventListener("click", cleanup);
      errorModalClose.removeEventListener("click", cleanup);
      errorModalCopy.removeEventListener("click", onCopy);
    };

    const onCopy = () => {
      navigator.clipboard.writeText(traceback).then(() => {
        const originalText = errorModalCopy.textContent;
        errorModalCopy.textContent = "COPIED!";
        setTimeout(() => {
          errorModalCopy.textContent = originalText;
        }, 2000);
      });
    };

    errorModalOk.addEventListener("click", cleanup);
    errorModalClose.addEventListener("click", cleanup);
    errorModalCopy.addEventListener("click", onCopy);
  }

  window.electronAPI.on("download-cancelled", (id) => {
    const dl = downloads[id];
    if (!dl || !dl.element) return;

    if (dl.isPausing) return;

    if (["COMPLETED", "ERROR"].includes(dl.status)) return;

    dl.status = "CANCELLED";
    updateDownloadUI(id);
    updateGlobalStats();

    const row = dl.element;
    row.querySelector(".progress-bar-fill").style.backgroundColor =
      "var(--bg-accent)";
    updatePauseIcon(id, true);

    if (dl.parentId) updateParentProgress(dl.parentId);
  });

  const cancelModal = document.getElementById("cancel-confirm-modal");
  const cancelConfirmYes = document.getElementById("cancel-confirm-yes");
  const cancelConfirmNo = document.getElementById("cancel-confirm-no");
  let pendingCancelId = null;

  function showCancelConfirmModal(id) {
    pendingCancelId = id;
    cancelModal.classList.remove("hidden");
  }

  function hideCancelConfirmModal() {
    cancelModal.classList.add("hidden");
    pendingCancelId = null;
  }

  cancelConfirmNo.addEventListener("click", (e) => {
    e.stopPropagation();
    hideCancelConfirmModal();
  });

  cancelModal.addEventListener("click", (e) => {
    if (e.target === cancelModal) hideCancelConfirmModal();
  });

  cancelConfirmYes.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!pendingCancelId) return;
    const dl = downloads[pendingCancelId];
    if (!dl) {
      hideCancelConfirmModal();
      return;
    }

    const idsToCancel = dl.isGroup
      ? [pendingCancelId, ...dl.children]
      : [pendingCancelId];

    hideCancelConfirmModal();

    for (const id of idsToCancel) {
      const item = downloads[id];
      if (!item) continue;

      item.isCancelling = true;

      if (item.element) item.element.remove();

      if (item.parentId && downloads[item.parentId]) {
        downloads[item.parentId].children = downloads[
          item.parentId
        ].children.filter((cid) => cid !== id);
      }

      await window.electronAPI.invoke("cancel-download", id);

      if (item.path && item.videoId) {
        await window.electronAPI.invoke("cleanup-partial-files", {
          path: item.path,
          video_id: item.videoId,
        });
      }

      delete downloads[id];
    }

    updateGlobalStats();
  });

  function updateGlobalStats() {
    let activeCount = 0;
    let totalSpeedValue = 0;
    const activeStates = [
      "DOWNLOADING",
      "INITIALIZING",
      "FINALIZING",
      "RESUMING",
    ];
    const processingStates = [
      "DOWNLOADING",
      "INITIALIZING",
      "FINALIZING",
      "RESUMING",
      "QUEUED",
    ];

    let hasActiveDownloads = false;

    Object.values(downloads).forEach((dl) => {
      if (activeStates.includes(dl.status)) {
        if (!dl.parentId) {
          activeCount++;
        }

        if (dl.lastSpeedValue) {
          totalSpeedValue += dl.lastSpeedValue;
        }
      }
      if (processingStates.includes(dl.status)) {
        hasActiveDownloads = true;
      }
    });

    const activeElem = document.getElementById("active-count");
    const speedElem = document.getElementById("speed-total");
    if (activeElem) activeElem.textContent = `${activeCount} ACTIVE`;
    if (speedElem) speedElem.textContent = formatSpeed(totalSpeedValue);

    if (!hasActiveDownloads && onCompleteAction !== "none") {
      handleOnCompleteAction();
    }
  }

  async function handleOnCompleteAction() {
    if (window.shutdownTimeout) clearTimeout(window.shutdownTimeout);

    window.shutdownTimeout = setTimeout(async () => {
      let stillActive = false;
      const processingStates = [
        "DOWNLOADING",
        "INITIALIZING",
        "FINALIZING",
        "RESUMING",
        "QUEUED",
      ];
      Object.values(downloads).forEach((dl) => {
        if (processingStates.includes(dl.status)) stillActive = true;
      });

      if (!stillActive && onCompleteAction !== "none") {
        try {
          await invoke("system_action", { action: onCompleteAction });
        } catch (e) {
          console.error("System action failed:", e);
        }
      }
    }, 2000);
  }


  function toggleSidebar(open) {
    if (open) {
      sidebar.classList.add("open");
      sidebarOverlay.classList.remove("hidden");
    } else {
      sidebar.classList.remove("open");
      sidebarOverlay.classList.add("hidden");
    }
  }

  hamburgerBtn.addEventListener("click", () => toggleSidebar(true));
  closeSidebarBtn.addEventListener("click", () => toggleSidebar(false));
  sidebarOverlay.addEventListener("click", () => toggleSidebar(false));

  quitBtn.addEventListener("click", () => window.electronAPI.send("close-app"));

  onCompleteSelect.addEventListener("change", (e) => {
    onCompleteAction = e.target.value;
  });

  settingsBtn.addEventListener("click", () => {
    toggleSidebar(false);
    switchView("view-settings");
  });

  settingsBackBtn.addEventListener("click", () => {
    switchView("view-home");
  });

  function switchView(viewId) {
    const views = [viewHome, viewSettings];
    const target = document.getElementById(viewId);

    views.forEach((v) => {
      if (v === target) {
        v.classList.remove("hidden");
        void v.offsetWidth;
        v.classList.add("active");

        if (viewId === "view-settings") checkCookieStatus();
      } else {
        v.classList.remove("active");
        setTimeout(() => {
          if (!v.classList.contains("active")) v.classList.add("hidden");
        }, 250);
      }
    });
  }

  async function checkCookieStatus() {
    try {
      cookieStatusText.textContent = "Checking...";
      const exists = await window.electronAPI.invoke("get-cookies-status");
      if (exists) {
        cookieStatusDot.className = "status-dot active";
        cookieStatusText.textContent = "COOKIES PRESENT";
        clearCookiesBtn.classList.remove("hidden");
      } else {
        cookieStatusDot.className = "status-dot";
        cookieStatusText.textContent = "NO COOKIES FOUND";
        clearCookiesBtn.classList.add("hidden");
      }
    } catch (e) {
      console.error("Failed to check cookies:", e);
      cookieStatusText.textContent = "ERROR CHECKING STATUS";
    }
  }

  importCookiesBtn.addEventListener("click", async () => {
    const btn = importCookiesBtn;
    const originalText = btn.textContent;

    btn.disabled = true;
    btn.textContent = "OPENING BROWSER...";

    try {
      await invoke("login_with_browser", {});
      await checkCookieStatus();
      showAlert("AUTHENTICATION", "Cookies imported successfully!");
    } catch (e) {
      console.error(e);
      showAlert("AUTH ERROR", `Login failed or cancelled: ${e}`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  });

  clearCookiesBtn.addEventListener("click", async () => {
    const confirmed = await showConfirm(
      "DELETE COOKIES",
      "Are you sure you want to delete the stored cookies? This will sign you out of YouTube in the app."
    );

    if (confirmed) {
      await window.electronAPI.invoke("clear-cookies");
      await checkCookieStatus();
    }
  });

  function showConfirm(title, message, okText = "CONFIRM", cancelText = "CANCEL") {
    return new Promise((resolve) => {
      confirmModalTitle.textContent = title;
      confirmModalMessage.textContent = message;
      confirmModalOk.textContent = okText;
      confirmModalCancel.textContent = cancelText;
      confirmModal.classList.remove("hidden");

      const cleanup = (result) => {
        confirmModal.classList.add("hidden");
        confirmModalOk.removeEventListener("click", onOk);
        confirmModalCancel.removeEventListener("click", onCancel);
        confirmModalClose.removeEventListener("click", onCancel);
        resolve(result);
      };

      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);

      confirmModalOk.addEventListener("click", onOk);
      confirmModalCancel.addEventListener("click", onCancel);
      confirmModalClose.addEventListener("click", onCancel);
    });
  }

  function showAlert(title, message, btnText = "UNDERSTOOD") {
    return new Promise((resolve) => {
      confirmModalTitle.textContent = title;
      confirmModalMessage.textContent = message;
      confirmModalOk.textContent = btnText;
      confirmModalCancel.classList.add("hidden");
      confirmModal.classList.remove("hidden");

      const cleanup = () => {
        confirmModal.classList.add("hidden");
        confirmModalCancel.classList.remove("hidden");
        confirmModalOk.removeEventListener("click", onClose);
        confirmModalClose.removeEventListener("click", onClose);
        resolve();
      };

      const onClose = () => cleanup();

      confirmModalOk.addEventListener("click", onClose);
      confirmModalClose.addEventListener("click", onClose);
    });
  }

  async function showAgeRestrictionModal() {
    const confirmed = await showConfirm(
      "AGE RESTRICTED",
      "This content requires age verification via cookies. Go to settings and import cookies to continue.",
      "OPEN SETTINGS",
      "CANCEL"
    );

    if (confirmed) {
      switchView("view-settings");
    }
  }

  async function showBotDetectionModal() {
    const confirmed = await showConfirm(
      "BOT DETECTION",
      "YouTube has detected automated traffic. Some videos may fail to download. If you are using a VPN, try turning it off. If the issue persists, please go to Settings and 'Import Cookies' to verify your session.",
      "OPEN SETTINGS",
      "CANCEL"
    );

    if (confirmed) {
      switchView("view-settings");
    }
  }

  function parseSpeed(speedStr) {
    const match = speedStr.match(/([\d.]+)\s*(\w+)\/s/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
      b: 1,
      kib: 1024,
      mib: 1024 * 1024,
      gib: 1024 * 1024 * 1024,
      kb: 1000,
      mb: 1000 * 1000,
      gb: 1000 * 1000 * 1000,
    };

    return value * (multipliers[unit] || 1);
  }

  function formatSpeed(bytesPerSec) {
    if (bytesPerSec === 0) return "0 KB/S";
    const units = ["B/S", "KB/S", "MB/S", "GB/S"];
    let space = bytesPerSec;
    let unitIdx = 0;
    while (space >= 1024 && unitIdx < units.length - 1) {
      space /= 1024;
      unitIdx++;
    }
    return `${space.toFixed(1)} ${units[unitIdx]}`;
  }

  checkDependencies();

  async function checkDependencies() {
    try {
      const deps = await window.electronAPI.invoke("check_dependencies");
      console.log("Dependencies status:", deps);

      if (!deps.ytdlp || !deps.ffmpeg || !deps.deno) {
        hasSystemUpdate = true;
        const missing = [];
        if (!deps.ytdlp) missing.push("YT-DLP");
        if (!deps.deno) missing.push("DENO");
        if (!deps.ffmpeg) missing.push("CODECS");

        const label =
          missing.length > 0
            ? `UPDATE: ${missing.join(" + ")}`
            : "SYSTEM UPDATE";
        updateBtn.querySelector("span").textContent = label;

        updateBtn.classList.remove("hidden");
        appStatus.style.display = "none";
      } else {
        hasSystemUpdate = false;
        // If we have an app update, show that instead of hiding
        if (availableUpdate) {
            updateBtn.querySelector("span").textContent = `${availableUpdate.tag_name} AVAILABLE`;
            updateBtn.classList.remove("hidden");
        } else {
            updateBtn.classList.add("hidden");
        }
        appStatus.style.display = "none";
      }
    } catch (e) {
      console.error("Dependency check failed:", e);
    }
  }

  updateBtn.addEventListener("click", async () => {
    if (hasSystemUpdate) {
      depModalTitle.textContent = "SYSTEM UPDATING";
      depModal.classList.remove("hidden");
      try {
        await window.electronAPI.invoke("download_dependencies");
      } catch (e) {
        console.error("Download failed:", e);
        alert("Update failed: " + e);
        depModal.classList.add("hidden");
      }
    } else if (availableUpdate) {
        const release = availableUpdate;
        const confirmed = await showConfirm(
            "UPDATE AVAILABLE",
            `A new version (${release.tag_name}) is available! Do you want to download and install it now?\n\n${release.body}`,
            "UPDATE NOW",
            "LATER"
          );
          
          if (confirmed) {
            let asset;
            const isLinux = navigator.userAgent.includes("Linux");
            
            if (isLinux) {
              asset = release.assets.find(a => a.name.endsWith('.rpm') || a.name.endsWith('.AppImage'));
            } else {
              asset = release.assets.find(a => a.name.endsWith('.exe') || a.name.endsWith('.msi'));
            }
  
            if (asset) {
              depModalTitle.textContent = "APP UPDATING";
              depModal.classList.remove("hidden");
              try {
                await window.electronAPI.invoke("download_and_install_update", asset.browser_download_url);
              } catch (e) {
                console.error("App update failed:", e);
                alert("Update failed: " + e);
                depModal.classList.add("hidden");
              }
            } else {
              showAlert("UPDATE ERROR", "Could not find a valid installer for your platform in the latest release. Please check GitHub manually.");
            }
          }
    }
  });

  window.electronAPI.on("dependencies-download-progress", (payload) => {
    if (depProgress) depProgress.style.width = `${payload.percent}%`;
    if (depStatus) depStatus.textContent = payload.details;
  });

  window.electronAPI.on("dependencies-download-finished", () => {
    if (depStatus) depStatus.textContent = "Updates complete. Resuming...";
    setTimeout(() => {
      depModal.classList.add("hidden");
      updateBtn.classList.add("hidden");
      appStatus.style.display = "block";
      checkDependencies();
    }, 1500);
  });
});
