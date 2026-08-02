import {
  sendMessage,
  channelDisplayName,
  buildCategoryTree,
  categoryOptions,
  formatDate,
  escapeHtml,
  toast
} from "./common.js";
import {
  EXTENSION_NAME,
  EXTENSION_VERSION,
  EXTENSION_COPYRIGHT
} from "./constants.js";

let state = null;
let channelSearch = "";

document.title = `Ustawienia — ${EXTENSION_NAME}`;
document.querySelector("#extension-name").textContent = EXTENSION_NAME;
document.querySelector("#extension-version").textContent = `Wersja ${EXTENSION_VERSION}`;
document.querySelector("#extension-copyright").textContent = EXTENSION_COPYRIGHT;

const elements = {
  settingsTabs: [...document.querySelectorAll("[data-settings-tab]")],
  settingsPanels: [...document.querySelectorAll("[data-tab-panel]")],
  openDashboard: document.querySelector("#open-dashboard"),
  importData: document.querySelector("#import-data"),
  importDataFile: document.querySelector("#import-data-file"),
  exportData: document.querySelector("#export-data"),
  generalForm: document.querySelector("#general-form"),
  lookbackDays: document.querySelector("#lookback-days"),
  refreshHours: document.querySelector("#refresh-hours"),
  theme: document.querySelector("#theme"),
  hideEmptyChannels: document.querySelector("#hide-empty-channels"),
  restoreHidden: document.querySelector("#restore-hidden"),
  categoryForm: document.querySelector("#category-form"),
  categoryName: document.querySelector("#category-name"),
  categoryParent: document.querySelector("#category-parent"),
  categoryList: document.querySelector("#category-list"),
  channelForm: document.querySelector("#channel-form"),
  channelInput: document.querySelector("#channel-input"),
  channelCategory: document.querySelector("#channel-category"),
  addChannel: document.querySelector("#add-channel"),
  channelSearch: document.querySelector("#channel-search"),
  refreshAll: document.querySelector("#refresh-all-options"),
  channelList: document.querySelector("#channel-list")
};

await loadState();

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === "local") void loadState();
});

for (const tab of elements.settingsTabs) {
  tab.addEventListener("click", () => selectSettingsTab(tab.dataset.settingsTab));
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = elements.settingsTabs.indexOf(tab);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? elements.settingsTabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + elements.settingsTabs.length) % elements.settingsTabs.length;
    const nextTab = elements.settingsTabs[nextIndex];
    selectSettingsTab(nextTab.dataset.settingsTab);
    nextTab.focus();
  });
}

selectSettingsTab(sessionStorage.getItem("settingsTab") || "general");

elements.openDashboard.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

function selectSettingsTab(tabId) {
  if (!elements.settingsTabs.some((tab) => tab.dataset.settingsTab === tabId)) tabId = "general";
  for (const tab of elements.settingsTabs) {
    const selected = tab.dataset.settingsTab === tabId;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of elements.settingsPanels) panel.hidden = panel.dataset.tabPanel !== tabId;
  sessionStorage.setItem("settingsTab", tabId);
}

elements.exportData.addEventListener("click", () => {
  const exportedAt = new Date();
  const payload = {
    format: "youtube-substriptions-dashboard",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `youtube-substriptions-dashboard-${exportedAt.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast("Wyeksportowano dane i ustawienia.", "success");
});

elements.importData.addEventListener("click", () => elements.importDataFile.click());

elements.importDataFile.addEventListener("change", async () => {
  const file = elements.importDataFile.files?.[0];
  elements.importDataFile.value = "";
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    if (!confirm("Zaimportować dane z pliku? Bieżące ustawienia, kategorie, kanały i zapisane filmy zostaną zastąpione.")) return;
    elements.importData.disabled = true;
    await sendMessage({ type: "importData", payload });
    toast("Zaimportowano dane i ustawienia.", "success");
  } catch (error) {
    toast(error instanceof SyntaxError ? "Wybrany plik nie zawiera poprawnego JSON." : error.message, "error");
  } finally {
    elements.importData.disabled = false;
  }
});

elements.generalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await sendMessage({
      type: "saveSettings",
      settings: {
        lookbackDays: elements.lookbackDays.value,
        autoRefreshHours: elements.refreshHours.value,
        theme: elements.theme.value,
        hideEmptyChannels: elements.hideEmptyChannels.checked
      }
    });
    toast("Ustawienia zapisane.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.restoreHidden.addEventListener("click", async () => {
  try {
    await sendMessage({ type: "restoreHiddenVideos" });
    toast("Przywrócono ukryte filmy.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await sendMessage({
      type: "addCategory",
      name: elements.categoryName.value,
      parentId: elements.categoryParent.value || null
    });
    elements.categoryForm.reset();
    toast("Dodano kategorię.", "success");
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.categoryList.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-edit-category]");
  const remove = event.target.closest("[data-delete-category]");

  if (edit) {
    const category = state.categories.find((item) => item.id === edit.dataset.editCategory);
    if (!category) return;
    const name = prompt("Nowa nazwa kategorii:", category.name);
    if (name === null) return;
    const parentId = document.querySelector(`[data-category-parent-select="${CSS.escape(category.id)}"]`)?.value || null;
    try {
      await sendMessage({ type: "updateCategory", categoryId: category.id, patch: { name, parentId } });
      toast("Zmieniono kategorię.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  if (remove) {
    const category = state.categories.find((item) => item.id === remove.dataset.deleteCategory);
    if (!category || !confirm(`Usunąć kategorię „${category.name}” i jej podkategorie? Kanały zostaną przeniesione do „Bez kategorii”.`)) return;
    try {
      await sendMessage({ type: "deleteCategory", categoryId: category.id });
      toast("Usunięto kategorię.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }
});

elements.categoryList.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-category-parent-select]");
  if (!select) return;
  try {
    await sendMessage({
      type: "updateCategory",
      categoryId: select.dataset.categoryParentSelect,
      patch: { parentId: select.value || null }
    });
    toast("Zmieniono położenie kategorii.", "success");
  } catch (error) {
    toast(error.message, "error");
    await loadState();
  }
});

elements.channelForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  elements.addChannel.disabled = true;
  elements.addChannel.textContent = "Dodawanie…";
  try {
    await sendMessage({
      type: "addChannel",
      input: elements.channelInput.value,
      categoryId: elements.channelCategory.value || null
    });
    elements.channelInput.value = "";
    toast("Dodano kanał.", "success");
  } catch (error) {
    toast(error.message, "error");
  } finally {
    elements.addChannel.disabled = false;
    elements.addChannel.textContent = "Dodaj i pobierz";
  }
});

elements.channelSearch.addEventListener("input", () => {
  channelSearch = elements.channelSearch.value.trim().toLocaleLowerCase("pl");
  renderChannels();
});

elements.refreshAll.addEventListener("click", async () => {
  try {
    const result = await sendMessage({ type: "updateAll" });
    if (!result.started) toast("Aktualizacja już trwa.");
  } catch (error) {
    toast(error.message, "error");
  }
});

elements.channelList.addEventListener("change", async (event) => {
  const categorySelect = event.target.closest("[data-channel-category]");
  if (categorySelect) {
    try {
      await sendMessage({
        type: "updateChannelMeta",
        channelId: categorySelect.dataset.channelCategory,
        patch: { categoryId: categorySelect.value || null }
      });
      toast("Zmieniono kategorię kanału.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }

  const titleInput = event.target.closest("[data-channel-title]");
  if (titleInput) {
    try {
      await sendMessage({
        type: "updateChannelMeta",
        channelId: titleInput.dataset.channelTitle,
        patch: { customTitle: titleInput.value }
      });
      toast("Zapisano nazwę kanału.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }
});

elements.channelList.addEventListener("click", async (event) => {
  const refresh = event.target.closest("[data-refresh-channel]");
  const remove = event.target.closest("[data-delete-channel]");

  if (refresh) {
    refresh.disabled = true;
    try {
      await sendMessage({ type: "updateChannel", channelId: refresh.dataset.refreshChannel });
      toast("Kanał zaktualizowany.", "success");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      refresh.disabled = false;
    }
  }

  if (remove) {
    const channel = state.channels.find((item) => item.id === remove.dataset.deleteChannel);
    if (!channel || !confirm(`Usunąć kanał „${channelDisplayName(channel)}”?`)) return;
    try {
      await sendMessage({ type: "deleteChannel", channelId: channel.id });
      toast("Usunięto kanał.", "success");
    } catch (error) {
      toast(error.message, "error");
    }
  }
});

async function loadState() {
  state = (await sendMessage({ type: "getState" })).state;
  elements.lookbackDays.value = state.settings.lookbackDays;
  elements.refreshHours.value = state.settings.autoRefreshHours;
  elements.theme.value = state.settings.theme;
  elements.hideEmptyChannels.checked = state.settings.hideEmptyChannels;
  document.documentElement.dataset.theme = state.settings.theme;
  renderCategoryControls();
  renderCategories();
  renderChannels();
  elements.refreshAll.disabled = Boolean(state.updateProgress?.running);
}

function renderCategoryControls() {
  elements.categoryParent.innerHTML = `<option value="">Brak (kategoria główna)</option>${categoryOptions(state.categories, "", false)}`;
  elements.channelCategory.innerHTML = categoryOptions(state.categories);
}

function renderCategories() {
  const flat = buildCategoryTree(state.categories);
  if (!flat.length) {
    elements.categoryList.innerHTML = `<div class="empty-state">Nie utworzono jeszcze kategorii.</div>`;
    return;
  }

  elements.categoryList.innerHTML = flat.map((category) => {
    const descendants = getDescendantIds(category.id);
    descendants.add(category.id);
    return `
      <div class="list-item">
        <div class="item-main category-item-main" style="--depth:${category.depth}">
          <div class="item-title">${escapeHtml(category.name)}</div>
          <div class="item-subtitle">Poziom ${category.depth + 1}</div>
        </div>
        <select class="select" data-category-parent-select="${escapeHtml(category.id)}">
          <option value="">Brak (kategoria główna)</option>
          ${categoryOptions(state.categories, category.parentId || "", false, descendants)}
        </select>
        <div class="item-actions">
          <button class="button button--small" data-edit-category="${escapeHtml(category.id)}">Zmień nazwę</button>
          <button class="button button--small button--danger" data-delete-category="${escapeHtml(category.id)}">Usuń</button>
        </div>
      </div>`;
  }).join("");
}

function renderChannels() {
  const channels = [...state.channels]
    .filter((channel) => !channelSearch || channelDisplayName(channel).toLocaleLowerCase("pl").includes(channelSearch))
    .sort((a, b) => channelDisplayName(a).localeCompare(channelDisplayName(b), "pl", { sensitivity: "base" }));

  if (!channels.length) {
    elements.channelList.innerHTML = `<div class="empty-state">${state.channels.length ? "Brak pasujących kanałów." : "Nie dodano jeszcze kanałów."}</div>`;
    return;
  }

  elements.channelList.innerHTML = channels.map((channel) => `
    <div class="list-item channel-list-item">
      <div class="item-main">
        <a class="item-title" href="${escapeHtml(channel.channelUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(channelDisplayName(channel))}</a>
        <div class="item-subtitle">${escapeHtml(channel.youtubeChannelId)}${channel.lastUpdatedAt ? ` · ${escapeHtml(formatDate(channel.lastUpdatedAt))}` : ""}</div>
        ${channel.lastError ? `<div class="error-note">${escapeHtml(channel.lastError)}</div>` : ""}
        <input class="input channel-title-input" data-channel-title="${escapeHtml(channel.id)}" value="${escapeHtml(channel.customTitle || "")}" placeholder="Opcjonalna własna nazwa">
      </div>
      <select class="select" data-channel-category="${escapeHtml(channel.id)}">
        ${categoryOptions(state.categories, channel.categoryId || "")}
      </select>
      <div class="item-actions">
        <button class="button button--small" data-refresh-channel="${escapeHtml(channel.id)}">Odśwież</button>
        <button class="button button--small button--danger" data-delete-channel="${escapeHtml(channel.id)}">Usuń</button>
      </div>
    </div>`).join("");
}

function getDescendantIds(categoryId) {
  const ids = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of state.categories) {
      if ((category.parentId === categoryId || ids.has(category.parentId)) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }
  return ids;
}
