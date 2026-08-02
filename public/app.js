const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const emptyEl = $("#empty");

let state = { providers: [], activeModel: "", metadata: { order: [], notes: {}, links: {} } };

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || "请求失败");
  return body.data;
}

async function refresh() {
  const data = await api("/api/config");
  state = data;
  $("#config-path").textContent = data.configFile;
  render();
}

function orderedIds() {
  const ids = state.providers.map((p) => p.id);
  const order = state.metadata.order ?? [];
  const ordered = order.filter((id) => ids.includes(id));
  const rest = ids.filter((id) => !ordered.includes(id));
  return [...ordered, ...rest];
}

function render() {
  const ids = orderedIds();
  listEl.innerHTML = "";
  emptyEl.classList.toggle("hidden", ids.length > 0);
  ids.forEach((id) => {
    const p = state.providers.find((x) => x.id === id);
    if (!p) return;
    const card = document.createElement("div");
    card.className = "card" + (p.isDefault ? " active" : "");
    card.draggable = true;
    card.dataset.id = id;
    const modelKeys = Object.keys(p.config.models ?? {});
    const activeMid = state.activeModel.startsWith(id + "/") ? state.activeModel.slice(id.length + 1) : "";
    card.innerHTML = `
      <div class="top">
        <span class="drag">≡</span>
        <span class="name">${escapeHtml(p.config.name ?? id)}</span>
        ${p.isDefault ? `<span class="badge">默认 · ${escapeHtml(activeMid)}</span>` : ""}
      </div>
      <div class="meta">${escapeHtml(p.config.options?.baseURL ?? "")}</div>
      ${state.metadata.notes?.[id] ? `<div class="meta">📝 ${escapeHtml(state.metadata.notes[id])}</div>` : ""}
      <div class="meta">${modelKeys.length} 个模型</div>
      <div class="ops">
        ${p.isDefault
          ? ""
          : modelKeys.length > 0
            ? `<select class="activate-select" data-id="${id}"><option value="" selected disabled>设为默认…</option>${modelKeys.map((m) => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join("")}</select>`
            : `<button data-act="activate" data-id="${id}">设为默认</button>`}
        <button data-act="edit" data-id="${id}">编辑</button>
        <button data-act="dup" data-id="${id}">复制</button>
        <button data-act="del" data-id="${id}" class="danger">删除</button>
      </div>`;
    card.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", id); });
    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData("text/plain");
      const ids = orderedIds();
      const fromIdx = ids.indexOf(from);
      const toIdx = ids.indexOf(id);
      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, from);
      api("/api/order", { method: "PUT", body: JSON.stringify({ ids }) }).then(refresh);
    });
    listEl.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- 表单 ----
const dialog = $("#form-dialog");
const modelsEl = $("#models");
let editingId = null;
let models = {};

function openForm(provider) {
  editingId = provider?.id ?? null;
  models = provider?.config?.models ? JSON.parse(JSON.stringify(provider.config.models)) : {};
  $("#form-title").textContent = editingId ? "编辑供应商" : "添加供应商";
  $("#f-original-id").value = provider?.id ?? "";
  $("#f-id").value = provider?.id ?? "";
  $("#f-id").disabled = !!provider;
  $("#f-name").value = provider?.config?.name ?? "";
  $("#f-apiKey").value = provider?.config?.options?.apiKey ?? "";
  $("#f-baseURL").value = provider?.config?.options?.baseURL ?? "";
  $("#f-note").value = state.metadata.notes?.[provider?.id] ?? "";
  $("#f-link").value = state.metadata.links?.[provider?.id] ?? "";
  $("#f-default").checked = provider?.isDefault ?? false;
  renderModels();
  if (provider?.isDefault) {
    const mid = (state.activeModel || "").startsWith(provider.id + "/") ? state.activeModel.slice(provider.id.length + 1) : "";
    if (mid && models[mid]) $("#f-default-model").value = mid;
  }
  dialog.showModal();
}

function syncDefaultModelUI() {
  const checked = $("#f-default").checked;
  const has = Object.keys(models).length > 0;
  $("#default-model-row").hidden = !(checked && has);
  const sel = $("#f-default-model");
  sel.disabled = !(checked && has);
  if (checked && has && !sel.value) sel.selectedIndex = 0;
}

function renderModels() {
  modelsEl.innerHTML = "";
  Object.entries(models).forEach(([id, m]) => {
    const row = document.createElement("div");
    row.className = "model-row";
    row.innerHTML = `<input value="${escapeHtml(id)}" disabled><span class="meta">${escapeHtml(m?.name ?? "")}</span>`;
    const del = document.createElement("button");
    del.textContent = "×";
    del.onclick = () => { delete models[id]; renderModels(); };
    row.appendChild(del);
    modelsEl.appendChild(row);
  });
  const sel = $("#f-default-model");
  const prev = sel.value;
  sel.innerHTML = "";
  Object.keys(models).forEach((mid) => {
    const opt = document.createElement("option");
    opt.value = mid;
    opt.textContent = mid;
    sel.appendChild(opt);
  });
  if (prev && models[prev]) sel.value = prev;
  syncDefaultModelUI();
}

$("#btn-add").onclick = () => openForm(null);
$("#btn-cancel").onclick = () => dialog.close();
$("#f-default").addEventListener("change", syncDefaultModelUI);

$("#btn-add-model").onclick = () => {
  const input = $("#f-model-new");
  const id = input.value.trim();
  if (id && !models[id]) { models[id] = { name: id }; renderModels(); }
  input.value = "";
};

$("#btn-fetch-models").onclick = async () => {
  const btn = $("#btn-fetch-models");
  btn.disabled = true; btn.textContent = "获取中...";
  try {
    const data = await api("/api/fetch-models", {
      method: "POST",
      body: JSON.stringify({ baseURL: $("#f-baseURL").value, apiKey: $("#f-apiKey").value }),
    });
    data.models.forEach((m) => { models[m] = models[m] ?? { name: m }; });
    renderModels();
  } catch (e) {
    alert("获取模型失败: " + e.message);
  }
  btn.disabled = false; btn.textContent = "获取模型";
};

$("#provider-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    name: $("#f-name").value,
    baseURL: $("#f-baseURL").value,
    apiKey: $("#f-apiKey").value,
    note: $("#f-note").value,
    link: $("#f-link").value,
    models,
  };
  try {
    let savedId = editingId;
    if (editingId) {
      await api(`/api/providers/${editingId}`, { method: "PUT", body: JSON.stringify(payload) });
    } else {
      savedId = $("#f-id").value;
      await api("/api/providers", { method: "POST", body: JSON.stringify({ id: savedId, ...payload }) });
    }
    // 勾选「设为默认」则把 model 指针切到该供应商的所选模型
    if ($("#f-default").checked) {
      const modelIds = Object.keys(models);
      const modelId = $("#f-default-model").value || modelIds[0] || `${savedId}-default`;
      await api(`/api/providers/${savedId}/activate`, { method: "POST", body: JSON.stringify({ modelId }) });
    }
    dialog.close();
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

// ---- 列表操作 ----
listEl.addEventListener("change", async (e) => {
  const sel = e.target.closest("select.activate-select");
  if (!sel || !sel.value) return;
  try {
    await api(`/api/providers/${sel.dataset.id}/activate`, { method: "POST", body: JSON.stringify({ modelId: sel.value }) });
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

listEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;
  const p = state.providers.find((x) => x.id === id);
  try {
    if (act === "activate") {
      const models = Object.keys(p.config.models ?? {});
      const modelId = models.length > 0 ? models[0] : `${id}-default`;
      await api(`/api/providers/${id}/activate`, { method: "POST", body: JSON.stringify({ modelId }) });
    } else if (act === "edit") {
      openForm(p);
      return;
    } else if (act === "dup") {
      await api(`/api/providers/${id}/duplicate`, { method: "POST" });
    } else if (act === "del") {
      const isDefault = p.isDefault;
      const msg = isDefault
        ? `删除供应商 ${id}?这是当前默认供应商,删除后默认会自动切到其他供应商。`
        : `删除供应商 ${id}?`;
      if (!confirm(msg)) return;
      await api(`/api/providers/${id}`, { method: "DELETE" });
    }
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

refresh().catch((e) => {
  if (e.message.includes("未找到")) {
    listEl.innerHTML = `<p class="empty">未找到 mimocode.jsonc,请先运行 mimocode 生成配置,或设置 MIMOCODE_HOME 环境变量。</p>`;
  } else {
    alert(e.message);
  }
});
