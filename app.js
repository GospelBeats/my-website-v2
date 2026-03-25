// ====== CONFIG ======
const LIBRARY_URL = "https://media.gospelbeatsapp.com/library/library.json";
const DEFAULT_ALBUM_ID = "count-it-all-joy";
const DEFAULT_COVER_URL = "https://media.gospelbeatsapp.com/covers/count-it-all-joy.png";
const SHARE_BASE_URL = "https://gospelbeatsapp.com";

const STORAGE_KEYS = {
  albumId: "gba:lastAlbumId",
  trackIndex: "gba:lastTrackIndex",
  time: "gba:lastTrackTime",
  volume: "gba:volume",
  shuffle: "gba:shuffle",
  repeat: "gba:repeat"
};

// ====== DOM ======
const elAlbums = document.getElementById("albums");
const elQueue = document.getElementById("queue");
const elSearch = document.getElementById("search");
const elStatus = document.getElementById("libStatus");
const elHint = document.getElementById("hint");

const audio = document.getElementById("audio");
const btnPlay = document.getElementById("btnPlay");
const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const rngSeek = document.getElementById("seek");
const rngVol = document.getElementById("volume");

const elCover = document.getElementById("cover");
const elTitle = document.getElementById("title");
const elArtist = document.getElementById("artist");
const elCurTime = document.getElementById("curTime");
const elDurTime = document.getElementById("durTime");

const btnShuffle = document.getElementById("btnShuffle");
const btnRepeat = document.getElementById("btnRepeat");

const elCategoryBar = document.getElementById("categoryBar");
const elBgArt = document.getElementById("bgArt");
const btnShare = document.getElementById("btnShare");

// ====== STATE ======
let library = null;

let queueOriginal = [];
let queuePlayOrder = [];
let currentIndex = -1;

let shuffleOn = false;
let repeatMode = "off"; // "off" | "all" | "one"
let seeking = false;
let resumeTimeAfterMetadata = null;

let selectedCategory = "All";

// ====== HELPERS ======
function parseCleanUrl() {
  const parts = window.location.pathname
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .filter(Boolean);

  if (parts.length < 2) return null;

  const albumId = parts[0];
  const trackSlug = parts[1];

  const album = (library.albums || []).find(a => a.id === albumId);
  if (!album) return null;

  const trackIndex = (album.tracks || []).findIndex(t =>
    (t.f || "").replace(".mp3", "") === trackSlug
  );

  if (trackIndex === -1) return null;

  return {
    albumId,
    trackIndex
  };
}

function getShareUrl() {
  const track = getCurrentTrack();
  if (!track) return SHARE_BASE_URL;

  const albumId = track.id.split("-").slice(0, -1).join("-");
  const slug = track.srcUrl.split("/").pop().replace(".mp3", "");

  return `${SHARE_BASE_URL}/${albumId}/${slug}`;
}

function updateBackgroundArt(url) {
  if (!elBgArt) return;
  elBgArt.style.backgroundImage = url ? `url("${url}")` : "none";
}

function isIos() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isInStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function updateInstallUI() {
  const btnInstall = document.getElementById("btnInstall");
  const iosHint = document.getElementById("iosInstallHint");

  if (isIos() && !isInStandaloneMode()) {
    iosHint.classList.remove("hidden");
    btnInstall.classList.add("hidden");
  } else {
    iosHint.classList.add("hidden");
  }
}

function updateWaveform(isPlaying) {
  const el = document.getElementById("waveform");
  if (!el) return;
  el.classList.toggle("paused", !isPlaying);
}

function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setHint(msg) {
  elHint.textContent = msg || "";
  if (msg) {
    setTimeout(() => {
      if (elHint.textContent === msg) elHint.textContent = "";
    }, 3500);
  }
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getMediaBase() {
  return library?.mediaBase || library?.baseUrl || "";
}

function getCurrentTrack() {
  if (currentIndex < 0 || currentIndex >= queuePlayOrder.length) return null;
  return queuePlayOrder[currentIndex];
}

function savePlaybackState() {
  const currentTrack = getCurrentTrack();
  if (!currentTrack) return;

  const albumId = currentTrack.id.split("-").slice(0, -1).join("-");
  localStorage.setItem(STORAGE_KEYS.albumId, albumId);
  localStorage.setItem(STORAGE_KEYS.trackIndex, String(currentIndex));
  localStorage.setItem(STORAGE_KEYS.time, String(audio.currentTime || 0));
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEYS.volume, String(audio.volume));
  localStorage.setItem(STORAGE_KEYS.shuffle, JSON.stringify(shuffleOn));
  localStorage.setItem(STORAGE_KEYS.repeat, repeatMode);
}

function loadSettings() {
  const savedVolume = localStorage.getItem(STORAGE_KEYS.volume);
  if (savedVolume !== null) {
    const v = Number(savedVolume);
    if (!Number.isNaN(v)) {
      audio.volume = v;
      rngVol.value = String(v);
    }
  }

  const savedShuffle = localStorage.getItem(STORAGE_KEYS.shuffle);
  if (savedShuffle !== null) {
    shuffleOn = savedShuffle === "true";
  }

  const savedRepeat = localStorage.getItem(STORAGE_KEYS.repeat);
  if (savedRepeat === "off" || savedRepeat === "all" || savedRepeat === "one") {
    repeatMode = savedRepeat;
  }
}

function rebuildPlayOrder() {
  const currentTrack = getCurrentTrack();

  if (!shuffleOn) {
    queuePlayOrder = queueOriginal.slice();
  } else {
    queuePlayOrder = shuffleArray(queueOriginal);
  }

  if (currentTrack) {
    const newIdx = queuePlayOrder.findIndex(t => t.id === currentTrack.id);
    currentIndex = newIdx >= 0 ? newIdx : 0;
  } else {
    currentIndex = queuePlayOrder.length ? 0 : -1;
  }

  renderQueue();
}

function setRepeatButton() {
  const label =
    repeatMode === "off"
      ? "Repeat: Off"
      : repeatMode === "all"
      ? "Repeat: All"
      : "Repeat: One";

  btnRepeat.textContent = label;
  btnRepeat.dataset.mode = repeatMode;
  btnRepeat.classList.toggle("on", repeatMode !== "off");
  btnRepeat.setAttribute("aria-pressed", String(repeatMode !== "off"));
}

function setShuffleButton() {
  btnShuffle.classList.toggle("on", shuffleOn);
  btnShuffle.setAttribute("aria-pressed", String(shuffleOn));
}

// ====== MEDIA SESSION ======
function setupMediaSession(track) {
  if (!("mediaSession" in navigator) || !track) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.title || "",
    artist: track.artist || "",
    album: track.album || "",
    artwork: track.coverUrl
      ? [{ src: track.coverUrl, sizes: "512x512", type: "image/png" }]
      : []
  });

  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  navigator.mediaSession.setActionHandler("previoustrack", () => prevTrack());
  navigator.mediaSession.setActionHandler("nexttrack", () => nextTrack());

  navigator.mediaSession.setActionHandler("seekto", (details) => {
    if (details.fastSeek && "fastSeek" in audio) {
      audio.fastSeek(details.seekTime);
      return;
    }
    audio.currentTime = details.seekTime;
  });

  navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
}

function updatePlaybackState() {
  if (!("mediaSession" in navigator)) return;
  navigator.mediaSession.playbackState = audio.paused ? "paused" : "playing";
}

// ====== RENDER ======
function renderAlbums(filterText = "") {
  elAlbums.innerHTML = "";

  const MEDIA_BASE = getMediaBase();
  const q = (filterText || "").trim().toLowerCase();

  const filteredAlbums = (library.albums || []).filter((album) => {
    const matchesSearch =
      !q || (album.title || "").toLowerCase().includes(q);

    const matchesCategory =
      selectedCategory === "All" ||
      (album.category || "Other") === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  filteredAlbums.forEach((album) => {
    const coverUrl = `${MEDIA_BASE}${album.cover}`;
    const card = document.createElement("button");
    card.className = "album";
    card.type = "button";
    card.innerHTML = `
      <img src="${coverUrl}" alt="${album.title} cover" loading="lazy">
      <div class="aMeta">
        <div class="aTitle">${album.title}</div>
        <div class="aSub">${album.category || (library.artist || "CYB")}</div>
      </div>
    `;

    card.addEventListener("click", () => loadAlbumToQueue(album.id));
    elAlbums.appendChild(card);
  });
}

function renderQueue() {
  elQueue.innerHTML = "";

  queuePlayOrder.forEach((t, idx) => {
    const li = document.createElement("li");
    li.className = idx === currentIndex ? "playing" : "";
    li.innerHTML = `
      <div class="qTitle">${t.trackNo ? `${t.trackNo}. ` : ""}${t.title || "Untitled"}</div>
      <div class="qSub">${t.artist || ""} • ${t.album || ""}</div>
    `;
    li.addEventListener("click", () => {
      playAtIndex(idx);
    });
    elQueue.appendChild(li);
  });
}

function renderNowPlaying(track) {
  if (!track) {
    elCover.style.opacity = 0;

    setTimeout(() => {
      elCover.src = DEFAULT_COVER_URL;
      elCover.style.opacity = 1;
    }, 120);

    elTitle.textContent = "Select an album";
    elArtist.textContent = "CYB";
    elCurTime.textContent = "0:00";
    elDurTime.textContent = "0:00";
    rngSeek.value = 0;
    updateBackgroundArt(DEFAULT_COVER_URL);
    updateWaveform(false);
    return;
  }

  const cover = track.coverUrl || DEFAULT_COVER_URL;

  elCover.style.opacity = 0;

  setTimeout(() => {
    elCover.src = cover;
    elCover.style.opacity = 1;
  }, 120);

  elTitle.textContent = track.title || "Untitled";
  elArtist.textContent = `${track.artist || ""}${track.album ? " • " + track.album : ""}`;
  updateBackgroundArt(cover);
  updateWaveform(!audio.paused);
}

function renderCategoryBar() {
  if (!library || !Array.isArray(library.albums)) return;

  const categories = [
    "All",
    ...new Set(
      library.albums
        .map(a => a.category || "Other")
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
    )
  ];

  elCategoryBar.innerHTML = "";

  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "categoryChip";
    if (cat === selectedCategory) btn.classList.add("active");
    btn.textContent = cat;

    btn.addEventListener("click", () => {
      selectedCategory = cat;
      renderCategoryBar();
      renderAlbums(elSearch.value);
    });

    elCategoryBar.appendChild(btn);
  });
}

// ====== QUEUE BUILDING ======
function flattenAlbum(album) {
  const MEDIA_BASE = getMediaBase();
  const coverUrl = `${MEDIA_BASE}${album.cover}`;

  return (album.tracks || []).map((tr) => ({
    id: `${album.id}-${tr.n}`,
    trackNo: tr.n,
    title: tr.t,
    artist: library.artist || "CYB",
    album: album.title || "",
    duration: null,
    srcUrl: `${MEDIA_BASE}/audio/${album.id}/${tr.f}`,
    coverUrl
  }));
}

function loadAlbumToQueue(albumId, options = {}) {
  const { restoreTrackIndex = 0, restoreTime = 0, autoplay = false } = options;
  const album = (library.albums || []).find((a) => a.id === albumId);
  if (!album) return;

  // Stop current playback when changing albums
  audio.pause();
  audio.currentTime = 0;
  btnPlay.textContent = "▶";
  updatePlaybackState();

  queueOriginal = flattenAlbum(album);
  queuePlayOrder = queueOriginal.slice();

  if (shuffleOn) {
    queuePlayOrder = shuffleArray(queueOriginal);
  }

  currentIndex = Math.max(0, Math.min(restoreTrackIndex, queuePlayOrder.length - 1));

  const firstTrack = getCurrentTrack();
  if (firstTrack) {
    audio.src = firstTrack.srcUrl;
    resumeTimeAfterMetadata = restoreTime > 0 ? restoreTime : null;
    renderNowPlaying(firstTrack);
    setupMediaSession(firstTrack);
  } else {
    renderNowPlaying(null);
  }

  renderQueue();
  savePlaybackState();
  setHint(`Loaded album: ${album.title}`);

  if (autoplay && firstTrack) {
    playCurrent();
  }
}

// ====== PLAYBACK ======
function playAtIndex(idx) {
  if (idx < 0 || idx >= queuePlayOrder.length) return;
  currentIndex = idx;
  renderQueue();
  playCurrent();
}

function playCurrent() {
  const track = getCurrentTrack();
  if (!track) return;

  audio.src = track.srcUrl;
  resumeTimeAfterMetadata = null;

  audio.play().catch(() => {
    setHint("Tap Play to start audio.");
  });

  renderNowPlaying(track);
  renderQueue();
  btnPlay.textContent = "⏸";
  setupMediaSession(track);
  savePlaybackState();
}

function playNextAlbum() {
  const currentTrack = getCurrentTrack();
  if (!currentTrack || !library || !Array.isArray(library.albums)) return false;

  const currentAlbumId = currentTrack.id.split("-").slice(0, -1).join("-");
  const albumIndex = library.albums.findIndex(a => a.id === currentAlbumId);

  if (albumIndex === -1) return false;

  const nextAlbum = library.albums[albumIndex + 1];

  if (!nextAlbum) {
    return false; // no next album
  }

  loadAlbumToQueue(nextAlbum.id, {
    restoreTrackIndex: 0,
    restoreTime: 0,
    autoplay: true
  });

  return true;
}

function nextTrack() {
  const n = queuePlayOrder.length;
  if (!n) return;

  if (repeatMode === "one") {
    audio.currentTime = 0;
    audio.play();
    return;
  }

  if (currentIndex + 1 < n) {
    currentIndex++;
    renderQueue();
    playCurrent();
    return;
  }

  // End of current album
  if (repeatMode === "all") {
    currentIndex = 0;
    renderQueue();
    playCurrent();
    return;
  }

  // Try autoplaying next album
  const startedNextAlbum = playNextAlbum();

  if (!startedNextAlbum) {
    btnPlay.textContent = "▶️";
    updatePlaybackState();
    updateWaveform(false);
    savePlaybackState();
  }
}

function prevTrack() {
  if (!queuePlayOrder.length) return;

  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (currentIndex > 0) {
    currentIndex--;
    renderQueue();
    playCurrent();
  } else if (repeatMode === "all") {
    currentIndex = queuePlayOrder.length - 1;
    renderQueue();
    playCurrent();
  } else {
    audio.currentTime = 0;
  }
}

// ====== EVENTS ======
btnShare?.addEventListener("click", async () => {
  const track = getCurrentTrack();
  if (!track) {
    setHint("Select a song first.");
    return;
  }

  const url = getShareUrl();
  const shareTitle = `${track.title} — ${track.album}`;
  const shareText = `${track.title} by ${track.artist}`;

  try {
    if (navigator.share) {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url
      });
    } else {
      await navigator.clipboard.writeText(url);
      setHint("Song link copied.");
    }
  } catch {
    setHint("Share canceled.");
  }
});

btnPlay.addEventListener("click", async () => {
  const track = getCurrentTrack();

  if (!track && queuePlayOrder.length) {
    currentIndex = 0;
    playCurrent();
    return;
  }

  if (!track) {
    setHint("Select an album first.");
    return;
  }

  if (!audio.src) {
    playCurrent();
    return;
  }

  if (audio.paused) {
    await audio.play().catch(() => setHint("Tap again to start audio."));
    btnPlay.textContent = "⏸";
  } else {
    audio.pause();
    btnPlay.textContent = "▶";
  }

  updatePlaybackState();
  savePlaybackState();
});

btnNext.addEventListener("click", () => nextTrack());
btnPrev.addEventListener("click", () => prevTrack());

audio.addEventListener("ended", () => nextTrack());

audio.addEventListener("play", () => {
  btnPlay.textContent = "⏸";
  updatePlaybackState();
  savePlaybackState();
  updateWaveform(true);
});

audio.addEventListener("pause", () => {
  btnPlay.textContent = "▶";
  updatePlaybackState();
  savePlaybackState();
  updateWaveform(false);
});

audio.addEventListener("loadedmetadata", () => {
  elDurTime.textContent = fmtTime(audio.duration);

  if (resumeTimeAfterMetadata && Number.isFinite(resumeTimeAfterMetadata)) {
    const safeTime = Math.min(resumeTimeAfterMetadata, audio.duration || resumeTimeAfterMetadata);
    audio.currentTime = safeTime;
    resumeTimeAfterMetadata = null;
  }
});

audio.addEventListener("timeupdate", () => {
  if (!seeking) {
    const cur = audio.currentTime || 0;
    const dur = audio.duration || 0;
    elCurTime.textContent = fmtTime(cur);

    if (dur > 0) {
      rngSeek.value = Math.floor((cur / dur) * 1000);
    } else {
      rngSeek.value = 0;
    }
  }

  savePlaybackState();
});

// Seek bar
rngSeek.addEventListener("input", () => {
  seeking = true;
});

rngSeek.addEventListener("change", () => {
  const dur = audio.duration || 0;
  const ratio = Number(rngSeek.value) / 1000;
  if (dur > 0) audio.currentTime = dur * ratio;
  seeking = false;
  savePlaybackState();
});

// Volume
rngVol.addEventListener("input", () => {
  audio.volume = Number(rngVol.value);
  saveSettings();
});

// Shuffle / Repeat
btnShuffle.addEventListener("click", () => {
  shuffleOn = !shuffleOn;
  setShuffleButton();
  rebuildPlayOrder();
  saveSettings();
  setHint(shuffleOn ? "Shuffle on" : "Shuffle off");
});

btnRepeat.addEventListener("click", () => {
  repeatMode = repeatMode === "off" ? "all" : repeatMode === "all" ? "one" : "off";
  setRepeatButton();
  saveSettings();
  setHint(`Repeat: ${repeatMode}`);
});

// Search albums
elSearch.addEventListener("input", () => {
  renderAlbums(elSearch.value);
});

// Online/offline notice
window.addEventListener("online", () => setHint("Back online"));
window.addEventListener("offline", () => setHint("Offline mode"));

// ====== INIT ======
async function loadLibrary() {
  elStatus.textContent = "Loading library…";

  try {
    const res = await fetch(LIBRARY_URL, { cache: "no-store" });

    if (!res.ok) {
      throw new Error(`Library fetch failed: ${res.status}`);
    }

    const text = await res.text();
    library = JSON.parse(text);

    if (!library || !Array.isArray(library.albums)) {
      throw new Error("library.json is missing a valid albums array");
    }

    loadSettings();

    elStatus.textContent = `${library.albums.length} Albums`;
    renderCategoryBar();
    renderAlbums();
    setRepeatButton();
    setShuffleButton();

    // Support share links 
const route = parseCleanUrl();

if (route) {

  loadAlbumToQueue(route.albumId, {
    restoreTrackIndex: route.trackIndex,
    restoreTime: 0,
    autoplay: false
  });

} else {

  const savedAlbumId =
    localStorage.getItem(STORAGE_KEYS.albumId) || DEFAULT_ALBUM_ID;

  const savedTrackIndex =
    Number(localStorage.getItem(STORAGE_KEYS.trackIndex) || 0);

  const savedTime =
    Number(localStorage.getItem(STORAGE_KEYS.time) || 0);

  loadAlbumToQueue(savedAlbumId, {
    restoreTrackIndex: savedTrackIndex,
    restoreTime: savedTime,
    autoplay: false
  });

}

    if (!navigator.onLine) {
      setHint("Offline mode");
    }
  } catch (err) {
    console.error("loadLibrary error:", err);
    elStatus.textContent = "Failed to load library";
    setHint(String(err.message || err));
    renderNowPlaying(null);
  }
}

function setupPWA() {
  updateInstallUI();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  const btnInstall = document.getElementById("btnInstall");
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove("hidden");
  });

  btnInstall.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    deferredPrompt = null;
    btnInstall.classList.add("hidden");
  });
}

(function main() {
  setupPWA();
  renderNowPlaying(null);
  loadLibrary();
  updateInstallUI();
})();