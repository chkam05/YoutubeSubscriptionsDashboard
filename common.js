export async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || "Nieznany błąd rozszerzenia.");
  return response;
}

export function channelDisplayName(channel) {
  return channel.customTitle || channel.title || channel.youtubeChannelId;
}

export function buildCategoryTree(categories) {
  const byParent = new Map();
  for (const category of categories) {
    const parentId = category.parentId || null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(category);
  }
  for (const items of byParent.values()) {
    items.sort((a, b) => a.name.localeCompare(b.name, "pl", { sensitivity: "base" }));
  }

  const flat = [];
  const visit = (parentId, depth) => {
    for (const category of byParent.get(parentId) || []) {
      flat.push({ ...category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return flat;
}

export function getCategoryAndDescendants(categories, categoryId) {
  if (!categoryId) return null;
  const ids = new Set([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    }
  }
  return ids;
}

export function formatDate(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function categoryOptions(categories, selectedId = "", includeEmpty = true, excludedIds = new Set()) {
  const flat = buildCategoryTree(categories);
  const options = [];
  if (includeEmpty) {
    options.push(`<option value="" ${selectedId ? "" : "selected"}>Bez kategorii</option>`);
  }
  for (const category of flat) {
    if (excludedIds.has(category.id)) continue;
    const prefix = category.depth ? `${"— ".repeat(category.depth)}` : "";
    options.push(
      `<option value="${escapeHtml(category.id)}" ${category.id === selectedId ? "selected" : ""}>${escapeHtml(prefix + category.name)}</option>`
    );
  }
  return options.join("");
}

export function toast(message, type = "info") {
  const container = document.querySelector("#toast-container") || createToastContainer();
  const element = document.createElement("div");
  element.className = `toast toast--${type}`;
  element.textContent = message;
  container.appendChild(element);
  requestAnimationFrame(() => element.classList.add("toast--visible"));
  setTimeout(() => {
    element.classList.remove("toast--visible");
    setTimeout(() => element.remove(), 250);
  }, 3500);
}

function createToastContainer() {
  const container = document.createElement("div");
  container.id = "toast-container";
  container.className = "toast-container";
  document.body.appendChild(container);
  return container;
}
