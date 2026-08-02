import {
  sendMessage,
  channelDisplayName,
  buildCategoryTree,
  getCategoryAndDescendants,
  formatDate,
  escapeHtml,
  toast
} from "./common.js";
import { EXTENSION_NAME } from "./constants.js";

let state = null;
let query = "";
let selectedCategoryId = "";

document.title = EXTENSION_NAME;
document.querySelector("#extension-name").textContent = EXTENSION_NAME;

const elements = {
  search: document.querySelector("#search"),
  categoryFilter: document.querySelector("#category-filter"),
  refreshAll: document.querySelector("#refresh-all"),
  openSettings: document.querySelector("#open-settings"),
  content: document.querySelector("#content"),
  summary: document.querySelector("#summary"),
  progress: document.querySelector("#progress"),
  progressTitle: document.querySelector("#progress-title"),
  progressDetail: document.querySelector("#progress-detail"),
  progressBarValue: document.querySelector("#progress-bar-value")
};

await loadState();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local") void loadState(Boolean(changes.categories));
});

elements.search.addEventListener("input", () => {
  query = elements.search.value.trim().toLocaleLowerCase("pl");
  render();
});

elements.categoryFilter.addEventListener("change", () => {
  selectedCategoryId = elements.categoryFilter.value;
  render();
});

elements.refreshAll.addEventListener("click", async () => {
  try {
    const result = await sendMessage({ type: "updateAll" });
    if (!result.started) toast("Aktualizacja już trwa.");
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.openSettings.addEventListener("click", () => chrome.runtime.openOptionsPage());

elements.content.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-hide-video]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  try {
    await sendMessage({ type: "hideVideo", videoId: button.dataset.hideVideo });
    button.closest(".video-card")?.remove();
    await loadState(false);
  } catch (error) {
    toast(error.message, "error");
  }
});

async function loadState(renderCategories = true) {
  try {
    state = (await sendMessage({ type: "getState" })).state;
    document.documentElement.dataset.theme = state.settings.theme;
    if (renderCategories) renderCategoryFilter();
    render();
  } catch (error) {
    elements.content.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function renderCategoryFilter() {
  const flat = buildCategoryTree(state.categories);
  elements.categoryFilter.innerHTML = [
    `<option value="">Wszystkie kategorie</option>`,
    `<option value="__uncategorized__">Bez kategorii</option>`,
    ...flat.map((category) => {
      const prefix = category.depth ? `${"— ".repeat(category.depth)}` : "";
      return `<option value="${escapeHtml(category.id)}">${escapeHtml(prefix + category.name)}</option>`;
    })
  ].join("");
  elements.categoryFilter.value = selectedCategoryId;
}

function render() {
  if (!state) return;
  renderProgress();
  elements.refreshAll.disabled = Boolean(state.updateProgress?.running);

  const now = Date.now();
  const cutoff = now - state.settings.lookbackDays * 24 * 60 * 60 * 1000;
  const selectedCategoryIds = selectedCategoryId && selectedCategoryId !== "__uncategorized__"
    ? getCategoryAndDescendants(state.categories, selectedCategoryId)
    : null;

  const renderedChannels = [];
  let visibleVideos = 0;
  let visibleChannels = 0;

  const sortedChannels = [...state.channels].sort((a, b) =>
    channelDisplayName(a).localeCompare(channelDisplayName(b), "pl", { sensitivity: "base" })
  );

  for (const channel of sortedChannels) {
    if (selectedCategoryId === "__uncategorized__" && channel.categoryId) continue;
    if (selectedCategoryIds && !selectedCategoryIds.has(channel.categoryId)) continue;

    const channelName = channelDisplayName(channel);
    const channelMatches = !query || channelName.toLocaleLowerCase("pl").includes(query);
    const videos = (state.videosByChannel[channel.youtubeChannelId] || []).filter((video) => {
      if (state.hiddenVideoIds[video.videoId]) return false;
      if (Date.parse(video.publishedAt) < cutoff) return false;
      return channelMatches || !query || video.title.toLocaleLowerCase("pl").includes(query);
    });

    if (!channelMatches && videos.length === 0) continue;
    if (query && channelMatches) {
      // Gdy pasuje nazwa kanału, pokazujemy wszystkie jego filmy w zakresie dat.
      videos.splice(0, videos.length, ...(state.videosByChannel[channel.youtubeChannelId] || []).filter((video) =>
        !state.hiddenVideoIds[video.videoId] && Date.parse(video.publishedAt) >= cutoff
      ));
    }
    if (state.settings.hideEmptyChannels && videos.length === 0) continue;

    visibleChannels += 1;
    visibleVideos += videos.length;
    renderedChannels.push({ channel, html: renderChannel(channel, videos) });
  }

  elements.summary.textContent = `${visibleChannels} kanał(y), ${visibleVideos} film(y) z ostatnich ${state.settings.lookbackDays} dni.`;

  if (!state.channels.length) {
    elements.content.innerHTML = `
      <div class="empty-state">
        Nie ma jeszcze żadnych kanałów.<br>
        Otwórz ustawienia i dodaj adres kanału albo jego @nazwę.
      </div>`;
    return;
  }

  if (!renderedChannels.length) {
    elements.content.innerHTML = `<div class="empty-state">Brak filmów pasujących do wybranych filtrów.</div>`;
    return;
  }

  elements.content.innerHTML = selectedCategoryId
    ? renderedChannels.map((item) => item.html).join("")
    : renderCategoryGroups(renderedChannels);
}

function renderCategoryGroups(renderedChannels) {
  const channelsByCategory = new Map();
  for (const item of renderedChannels) {
    const categoryId = state.categories.some((category) => category.id === item.channel.categoryId)
      ? item.channel.categoryId
      : null;
    if (!channelsByCategory.has(categoryId)) channelsByCategory.set(categoryId, []);
    channelsByCategory.get(categoryId).push(item.html);
  }

  const groups = [];
  for (const category of buildCategoryTree(state.categories)) {
    const channels = channelsByCategory.get(category.id);
    if (channels?.length) groups.push(renderCategoryGroup(category.name, category.depth, channels));
  }

  const uncategorized = channelsByCategory.get(null);
  if (uncategorized?.length) groups.push(renderCategoryGroup("Bez kategorii", 0, uncategorized));
  return groups.join("");
}

function renderCategoryGroup(name, depth, channels) {
  return `
    <section class="category-group" style="--depth:${depth}">
      <h2 class="category-group-heading">${escapeHtml(name)}</h2>
      <div class="category-group-content">${channels.join("")}</div>
    </section>`;
}

function renderChannel(channel, videos) {
  const name = channelDisplayName(channel);
  const metaParts = [];
  if (channel.lastUpdatedAt) metaParts.push(`aktualizacja: ${formatDate(channel.lastUpdatedAt)}`);
  metaParts.push(`${videos.length} film(y)`);

  const videosHtml = videos.length
    ? `<div class="video-grid">${videos.map(renderVideo).join("")}</div>`
    : `<div class="empty-state">Brak widocznych filmów w tym kanale.</div>`;

  return `
    <section class="channel-section">
      <div class="channel-heading">
        <a class="channel-title" href="${escapeHtml(channel.channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>
        <span class="channel-meta">${escapeHtml(metaParts.join(" · "))}</span>
      </div>
      ${videosHtml}
      ${channel.lastError ? `<div class="error-note">Błąd ostatniej aktualizacji: ${escapeHtml(channel.lastError)}</div>` : ""}
    </section>`;
}

function renderVideo(video) {
  const todayClass = isToday(video.publishedAt) ? " video-card--today" : "";
  return `
    <article class="video-card${todayClass}">
      <a class="video-link" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">
        <div class="video-thumb-wrap"><img class="video-thumb" src="${escapeHtml(video.thumbnailUrl)}" alt="" loading="lazy"></div>
        <div class="video-body">
          <h3 class="video-title">${escapeHtml(video.title)}</h3>
          <div class="video-date">${escapeHtml(formatDate(video.publishedAt))}</div>
        </div>
      </a>
      <button class="hide-video" data-hide-video="${escapeHtml(video.videoId)}" title="Ukryj ten film">Ukryj</button>
    </article>`;
}

function isToday(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function renderProgress() {
  const progress = state.updateProgress || {};
  elements.progress.classList.toggle("is-visible", Boolean(progress.running));
  if (!progress.running) return;

  const completed = Number(progress.completed || 0);
  const total = Number(progress.total || 0);
  const percent = total ? Math.round((completed / total) * 100) : 0;
  elements.progressTitle.textContent = "Aktualizowanie kanałów…";
  elements.progressDetail.textContent = total
    ? `${progress.currentChannelTitle || "Przygotowanie"} · ${completed} z ${total}${progress.errorCount ? ` · błędy: ${progress.errorCount}` : ""}`
    : "Brak kanałów do aktualizacji";
  elements.progressBarValue.style.width = `${percent}%`;
}
