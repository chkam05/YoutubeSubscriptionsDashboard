const DEFAULT_SETTINGS = {
  lookbackDays: 30,
  autoRefreshHours: 6,
  theme: "light",
  hideEmptyChannels: false
};

const DEFAULT_DATA = {
  settings: DEFAULT_SETTINGS,
  categories: [],
  channels: [],
  videosByChannel: {},
  hiddenVideoIds: {},
  updateProgress: {
    running: false,
    total: 0,
    completed: 0,
    currentChannelId: null,
    currentChannelTitle: "",
    errorCount: 0,
    startedAt: null,
    finishedAt: null
  }
};

let activeUpdatePromise = null;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await configureAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await configureAlarm();
});

chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "refresh-channels") {
    void startUpdateAll("alarm");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: normalizeError(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "getState":
      return { state: await getState() };
    case "saveSettings":
      return { settings: await saveSettings(message.settings) };
    case "importData":
      return { state: await importData(message.payload) };
    case "addCategory":
      return { category: await addCategory(message.name, message.parentId) };
    case "updateCategory":
      return { category: await updateCategory(message.categoryId, message.patch) };
    case "deleteCategory":
      await deleteCategory(message.categoryId);
      return {};
    case "addChannel":
      return { channel: await addChannel(message.input, message.categoryId) };
    case "updateChannelMeta":
      return { channel: await updateChannelMeta(message.channelId, message.patch) };
    case "deleteChannel":
      await deleteChannel(message.channelId);
      return {};
    case "updateAll":
      return await startUpdateAll("manual");
    case "updateChannel":
      return { channel: await updateSingleChannel(message.channelId) };
    case "hideVideo":
      await hideVideo(message.videoId);
      return {};
    case "restoreHiddenVideos":
      await chrome.storage.local.set({ hiddenVideoIds: {} });
      return {};
    default:
      throw new Error("Nieznane polecenie rozszerzenia.");
  }
}

async function ensureDefaults() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_DATA));
  const patch = {};
  for (const [key, value] of Object.entries(DEFAULT_DATA)) {
    if (stored[key] === undefined) patch[key] = value;
  }
  if (Object.keys(patch).length > 0) await chrome.storage.local.set(patch);
}

async function getState() {
  await ensureDefaults();
  const state = await chrome.storage.local.get(Object.keys(DEFAULT_DATA));
  return {
    ...DEFAULT_DATA,
    ...state,
    settings: { ...DEFAULT_SETTINGS, ...(state.settings || {}) }
  };
}

async function saveSettings(patch) {
  const state = await getState();
  const settings = {
    lookbackDays: clampInteger(patch?.lookbackDays, 1, 365, state.settings.lookbackDays),
    autoRefreshHours: clampInteger(patch?.autoRefreshHours, 1, 168, state.settings.autoRefreshHours),
    theme: patch?.theme === "dark" ? "dark" : "light",
    hideEmptyChannels: Boolean(patch?.hideEmptyChannels)
  };
  await chrome.storage.local.set({ settings });
  await pruneOldVideos(settings.lookbackDays);
  await configureAlarm(settings.autoRefreshHours);
  return settings;
}

async function importData(payload) {
  if (activeUpdatePromise) throw new Error("Poczekaj na zakończenie aktualizacji kanałów przed importem.");
  if (!payload || typeof payload !== "object") throw new Error("Plik importu ma nieprawidłowy format.");
  const supportedFormats = new Set(["youtube-substriptions-dashboard", "youtube-channel-dashboard"]);
  if (payload.format && !supportedFormats.has(payload.format)) {
    throw new Error("Plik nie jest eksportem Youtube Substriptions Dashboard.");
  }

  const data = payload.data || payload;
  if (!data || typeof data !== "object" || !Array.isArray(data.categories) || !Array.isArray(data.channels)) {
    throw new Error("W pliku brakuje listy kategorii lub kanałów.");
  }
  if (!isPlainObject(data.videosByChannel) || !isPlainObject(data.hiddenVideoIds)) {
    throw new Error("W pliku brakuje danych filmów lub ukrytych pozycji.");
  }
  const validCategories = data.categories.every((item) =>
    isPlainObject(item) && typeof item.id === "string" && typeof item.name === "string"
  );
  const validChannels = data.channels.every((item) =>
    isPlainObject(item) && typeof item.id === "string" && typeof item.youtubeChannelId === "string"
  );
  const validVideoCache = Object.values(data.videosByChannel).every(Array.isArray);
  if (!validCategories || !validChannels || !validVideoCache) {
    throw new Error("Plik zawiera nieprawidłowe rekordy kategorii, kanałów lub filmów.");
  }

  const importedSettings = data.settings || {};
  const settings = {
    lookbackDays: clampInteger(importedSettings.lookbackDays, 1, 365, DEFAULT_SETTINGS.lookbackDays),
    autoRefreshHours: clampInteger(importedSettings.autoRefreshHours, 1, 168, DEFAULT_SETTINGS.autoRefreshHours),
    theme: importedSettings.theme === "dark" ? "dark" : "light",
    hideEmptyChannels: Boolean(importedSettings.hideEmptyChannels)
  };
  const imported = {
    settings,
    categories: data.categories,
    channels: data.channels,
    videosByChannel: data.videosByChannel,
    hiddenVideoIds: data.hiddenVideoIds,
    updateProgress: { ...DEFAULT_DATA.updateProgress }
  };

  await chrome.storage.local.set(imported);
  await pruneOldVideos(settings.lookbackDays);
  await configureAlarm(settings.autoRefreshHours);
  return await getState();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function configureAlarm(hoursOverride) {
  const { settings } = await getState();
  const hours = clampInteger(hoursOverride, 1, 168, settings.autoRefreshHours);
  await chrome.alarms.clear("refresh-channels");
  await chrome.alarms.create("refresh-channels", {
    delayInMinutes: Math.min(5, hours * 60),
    periodInMinutes: hours * 60
  });
}

async function addCategory(rawName, parentId = null) {
  const name = String(rawName || "").trim();
  if (!name) throw new Error("Podaj nazwę kategorii.");

  const state = await getState();
  if (parentId && !state.categories.some((category) => category.id === parentId)) {
    throw new Error("Wybrana kategoria nadrzędna nie istnieje.");
  }
  const siblingExists = state.categories.some(
    (category) => category.parentId === (parentId || null) && category.name.localeCompare(name, "pl", { sensitivity: "base" }) === 0
  );
  if (siblingExists) throw new Error("Kategoria o tej nazwie już istnieje na tym poziomie.");

  const category = {
    id: crypto.randomUUID(),
    name,
    parentId: parentId || null
  };
  await chrome.storage.local.set({ categories: [...state.categories, category] });
  return category;
}

async function updateCategory(categoryId, patch = {}) {
  const state = await getState();
  const current = state.categories.find((category) => category.id === categoryId);
  if (!current) throw new Error("Nie znaleziono kategorii.");

  const name = patch.name === undefined ? current.name : String(patch.name || "").trim();
  const parentId = patch.parentId === undefined ? current.parentId : (patch.parentId || null);
  if (!name) throw new Error("Nazwa kategorii nie może być pusta.");
  if (parentId === categoryId) throw new Error("Kategoria nie może być własnym rodzicem.");
  if (parentId && !state.categories.some((category) => category.id === parentId)) {
    throw new Error("Wybrana kategoria nadrzędna nie istnieje.");
  }
  if (parentId && getDescendantIds(state.categories, categoryId).has(parentId)) {
    throw new Error("Nie można przenieść kategorii do jej własnej podkategorii.");
  }

  const siblingExists = state.categories.some(
    (category) => category.id !== categoryId && category.parentId === parentId && category.name.localeCompare(name, "pl", { sensitivity: "base" }) === 0
  );
  if (siblingExists) throw new Error("Kategoria o tej nazwie już istnieje na tym poziomie.");

  const categories = state.categories.map((category) =>
    category.id === categoryId ? { ...category, name, parentId } : category
  );
  await chrome.storage.local.set({ categories });
  return categories.find((category) => category.id === categoryId);
}

async function deleteCategory(categoryId) {
  const state = await getState();
  const idsToDelete = getDescendantIds(state.categories, categoryId);
  idsToDelete.add(categoryId);

  const categories = state.categories.filter((category) => !idsToDelete.has(category.id));
  const channels = state.channels.map((channel) =>
    idsToDelete.has(channel.categoryId) ? { ...channel, categoryId: null } : channel
  );
  await chrome.storage.local.set({ categories, channels });
}

async function addChannel(rawInput, categoryId = null) {
  const input = String(rawInput || "").trim();
  if (!input) throw new Error("Podaj adres kanału, @nazwę lub identyfikator UC…");

  const state = await getState();
  if (categoryId && !state.categories.some((category) => category.id === categoryId)) {
    throw new Error("Wybrana kategoria nie istnieje.");
  }

  const resolved = await resolveChannel(input);
  if (state.channels.some((channel) => channel.youtubeChannelId === resolved.youtubeChannelId)) {
    throw new Error("Ten kanał jest już dodany.");
  }

  const channel = {
    id: crypto.randomUUID(),
    youtubeChannelId: resolved.youtubeChannelId,
    title: resolved.title || resolved.youtubeChannelId,
    customTitle: "",
    sourceInput: input,
    categoryId: categoryId || null,
    channelUrl: resolved.channelUrl,
    lastUpdatedAt: null,
    lastError: ""
  };

  await chrome.storage.local.set({ channels: [...state.channels, channel] });
  try {
    return await updateSingleChannel(channel.id);
  } catch (error) {
    const latest = await getState();
    const channels = latest.channels.map((item) =>
      item.id === channel.id ? { ...item, lastError: normalizeError(error) } : item
    );
    await chrome.storage.local.set({ channels });
    return channels.find((item) => item.id === channel.id);
  }
}

async function updateChannelMeta(channelId, patch = {}) {
  const state = await getState();
  const current = state.channels.find((channel) => channel.id === channelId);
  if (!current) throw new Error("Nie znaleziono kanału.");

  const categoryId = patch.categoryId === undefined ? current.categoryId : (patch.categoryId || null);
  if (categoryId && !state.categories.some((category) => category.id === categoryId)) {
    throw new Error("Wybrana kategoria nie istnieje.");
  }

  const customTitle = patch.customTitle === undefined
    ? current.customTitle
    : String(patch.customTitle || "").trim();

  const channels = state.channels.map((channel) =>
    channel.id === channelId ? { ...channel, categoryId, customTitle } : channel
  );
  await chrome.storage.local.set({ channels });
  return channels.find((channel) => channel.id === channelId);
}

async function deleteChannel(channelId) {
  const state = await getState();
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) return;

  const channels = state.channels.filter((item) => item.id !== channelId);
  const videosByChannel = { ...state.videosByChannel };
  delete videosByChannel[channel.youtubeChannelId];
  await chrome.storage.local.set({ channels, videosByChannel });
}

async function hideVideo(videoId) {
  const state = await getState();
  await chrome.storage.local.set({
    hiddenVideoIds: {
      ...state.hiddenVideoIds,
      [videoId]: Date.now()
    }
  });
}

async function startUpdateAll(source) {
  if (activeUpdatePromise) return { started: false, reason: "already-running" };
  activeUpdatePromise = runUpdateAll(source).finally(() => {
    activeUpdatePromise = null;
  });
  await activeUpdatePromise;
  return { started: true };
}

async function runUpdateAll(_source) {
  const state = await getState();
  const channels = [...state.channels].sort((a, b) => displayTitle(a).localeCompare(displayTitle(b), "pl"));
  let errorCount = 0;

  await setProgress({
    running: true,
    total: channels.length,
    completed: 0,
    currentChannelId: null,
    currentChannelTitle: "",
    errorCount: 0,
    startedAt: Date.now(),
    finishedAt: null
  });

  for (let index = 0; index < channels.length; index += 1) {
    const channel = channels[index];
    await setProgress({
      running: true,
      total: channels.length,
      completed: index,
      currentChannelId: channel.id,
      currentChannelTitle: displayTitle(channel),
      errorCount
    });
    try {
      await updateSingleChannel(channel.id);
    } catch (_error) {
      errorCount += 1;
    }
  }

  await setProgress({
    running: false,
    total: channels.length,
    completed: channels.length,
    currentChannelId: null,
    currentChannelTitle: "",
    errorCount,
    finishedAt: Date.now()
  });
}

async function updateSingleChannel(channelId) {
  const state = await getState();
  const channel = state.channels.find((item) => item.id === channelId);
  if (!channel) throw new Error("Nie znaleziono kanału.");

  try {
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.youtubeChannelId)}`;
    const response = await fetch(feedUrl, { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error(`YouTube zwrócił kod HTTP ${response.status}.`);

    const xml = await response.text();
    const parsed = parseFeed(xml, channel.youtubeChannelId);
    if (!parsed.channelTitle && parsed.videos.length === 0) {
      throw new Error("Nie udało się odczytać kanału RSS.");
    }

    const latest = await getState();
    const existing = latest.videosByChannel[channel.youtubeChannelId] || [];
    const merged = mergeVideos(existing, parsed.videos, latest.settings.lookbackDays);
    const videosByChannel = {
      ...latest.videosByChannel,
      [channel.youtubeChannelId]: merged
    };
    const channels = latest.channels.map((item) =>
      item.id === channelId
        ? {
            ...item,
            title: parsed.channelTitle || item.title,
            channelUrl: parsed.channelUrl || item.channelUrl,
            lastUpdatedAt: Date.now(),
            lastError: ""
          }
        : item
    );

    await chrome.storage.local.set({ videosByChannel, channels });
    return channels.find((item) => item.id === channelId);
  } catch (error) {
    const latest = await getState();
    const channels = latest.channels.map((item) =>
      item.id === channelId
        ? { ...item, lastUpdatedAt: Date.now(), lastError: normalizeError(error) }
        : item
    );
    await chrome.storage.local.set({ channels });
    throw error;
  }
}

async function resolveChannel(input) {
  const trimmed = input.trim();
  const directId = trimmed.match(/^(UC[\w-]{20,})$/i)?.[1]
    || trimmed.match(/youtube\.com\/channel\/(UC[\w-]{20,})/i)?.[1];

  if (directId) {
    return {
      youtubeChannelId: directId,
      channelUrl: `https://www.youtube.com/channel/${directId}`,
      title: ""
    };
  }

  const url = withConsentBypass(normalizeChannelUrl(trimmed));
  const response = await fetch(url, { cache: "no-store", credentials: "omit" });
  if (!response.ok) throw new Error(`Nie udało się otworzyć kanału (HTTP ${response.status}).`);
  const html = await response.text();

  const youtubeChannelId = firstMatch(html, [
    /<link\s+rel=["']canonical["']\s+href=["']https:\/\/(?:www\.)?youtube\.com\/channel\/(UC[\w-]+)["']/i,
    /<link\s+href=["']https:\/\/(?:www\.)?youtube\.com\/channel\/(UC[\w-]+)["']\s+rel=["']canonical["']/i,
    /<meta\s+itemprop="channelId"\s+content="(UC[\w-]+)"/i,
    /<meta\s+content="(UC[\w-]+)"\s+itemprop="channelId"/i,
    /"externalId":"(UC[\w-]+)"/,
    /"channelId":"(UC[\w-]+)"/,
    /"browseId":"(UC[\w-]+)"/
  ]);
  if (!youtubeChannelId) {
    throw new Error("Nie udało się rozpoznać identyfikatora kanału. Wklej pełny adres kanału lub identyfikator zaczynający się od UC.");
  }

  const title = decodeHtml(firstMatch(html, [
    /<meta\s+property="og:title"\s+content="([^"]+)"/i,
    /<title>([^<]+)<\/title>/i
  ]) || "").replace(/\s*-\s*YouTube\s*$/i, "").trim();

  return {
    youtubeChannelId,
    channelUrl: `https://www.youtube.com/channel/${youtubeChannelId}`,
    title
  };
}

function normalizeChannelUrl(input) {
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(?:www\.)?youtube\.com\//i.test(value)) return `https://${value}`;
  if (/^\/?@/.test(value)) return `https://www.youtube.com/${value.replace(/^\//, "")}`;
  if (/^\/?(channel|c|user)\//i.test(value)) return `https://www.youtube.com/${value.replace(/^\//, "")}`;
  return `https://www.youtube.com/@${value.replace(/^@/, "")}`;
}

function withConsentBypass(channelUrl) {
  const url = new URL(channelUrl);
  url.searchParams.set("ucbcb", "1");
  return url.toString();
}

function parseFeed(xml, fallbackChannelId) {
  const channelTitle = decodeXml(extractTag(xml, "title"));
  const channelId = decodeXml(extractTag(xml, "yt:channelId")) || fallbackChannelId;
  const channelUrl = `https://www.youtube.com/channel/${channelId}`;
  const entries = xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/g) || [];

  const videos = entries.map((entry) => {
    const videoId = decodeXml(extractTag(entry, "yt:videoId"));
    const title = decodeXml(extractTag(entry, "title"));
    const published = decodeXml(extractTag(entry, "published"));
    const updated = decodeXml(extractTag(entry, "updated"));
    const link = firstMatch(entry, [/<link\s+rel="alternate"\s+href="([^"]+)"/i])
      || `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnailUrl = firstMatch(entry, [/<media:thumbnail\s+url="([^"]+)"/i])
      || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");

    return {
      videoId,
      title,
      publishedAt: published || updated,
      url: decodeXml(link),
      thumbnailUrl: decodeXml(thumbnailUrl)
    };
  }).filter((video) => video.videoId && video.title && video.publishedAt);

  return { channelTitle, channelUrl, videos };
}

function mergeVideos(existing, incoming, lookbackDays) {
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const byId = new Map();
  for (const video of [...existing, ...incoming]) {
    const timestamp = Date.parse(video.publishedAt);
    if (Number.isFinite(timestamp) && timestamp >= cutoff) byId.set(video.videoId, video);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

async function pruneOldVideos(lookbackDays) {
  const state = await getState();
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  const videosByChannel = {};
  for (const [channelId, videos] of Object.entries(state.videosByChannel)) {
    videosByChannel[channelId] = videos.filter((video) => Date.parse(video.publishedAt) >= cutoff);
  }

  const hiddenVideoIds = {};
  const hiddenRetention = cutoff - 30 * 24 * 60 * 60 * 1000;
  for (const [videoId, hiddenAt] of Object.entries(state.hiddenVideoIds)) {
    if (hiddenAt >= hiddenRetention) hiddenVideoIds[videoId] = hiddenAt;
  }
  await chrome.storage.local.set({ videosByChannel, hiddenVideoIds });
}

async function setProgress(patch) {
  const { updateProgress = DEFAULT_DATA.updateProgress } = await chrome.storage.local.get("updateProgress");
  await chrome.storage.local.set({ updateProgress: { ...updateProgress, ...patch } });
}

function getDescendantIds(categories, categoryId) {
  const result = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if ((category.parentId === categoryId || result.has(category.parentId)) && !result.has(category.id)) {
        result.add(category.id);
        changed = true;
      }
    }
  }
  return result;
}

function displayTitle(channel) {
  return channel.customTitle || channel.title || channel.youtubeChannelId;
}

function extractTag(xml, tagName) {
  const escaped = tagName.replace(":", "\\:");
  const match = xml.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match?.[1] || "";
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function decodeHtml(value) {
  return decodeXml(value);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error || "Nieznany błąd.");
}
