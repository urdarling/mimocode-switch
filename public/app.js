const $ = (sel) => document.querySelector(sel);
const listEl = $("#list");
const emptyEl = $("#empty");

let state = { providers: [], activeModel: "", metadata: { order: [], notes: {}, links: {} } };
let variantData = { builtin: {}, official: {} };

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
  fetch("/api/variants").then((r) => r.json()).then((d) => {
    if (d?.ok && d.data) {
      variantData = d.data;
      if (dialog.open) renderModels();
    }
  }).catch(() => {});
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
        ${p.isDefault ? '<span class="badge">默认</span>' : ""}
      </div>
      <div class="meta">${escapeHtml(p.config.options?.baseURL ?? "")}</div>
      ${state.metadata.notes?.[id] ? `<div class="meta">📝 ${escapeHtml(state.metadata.notes[id])}</div>` : ""}
      <div class="meta">${modelKeys.length} 个模型</div>
      <div class="ops">
        ${modelKeys.length > 0
          ? `<span class="dropdown">
              <button type="button" class="dd-btn${p.isDefault ? " dd-current" : ""}" data-dd="${id}" aria-haspopup="menu" aria-expanded="false">${p.isDefault ? `<span class="dd-label">默认模型</span><span class="dd-value" title="${escapeHtml(activeMid)}">${escapeHtml(activeMid)}</span>` : "设为默认"} <span class="caret">▾</span></button>
              <div class="dd-menu hidden" data-ddmenu="${id}" role="menu">
                ${modelKeys.map((m) => {
                  const cfg = p.config.models?.[m];
                  const nm = cfg?.name && cfg.name !== m ? `<span class="dd-name">${escapeHtml(cfg.name)}</span>` : "";
                  const cur = p.isDefault && m === activeMid ? ' class="dd-item on"' : ' class="dd-item"';
                  return `<button type="button"${cur} role="menuitem" data-dditem="${id}" data-model="${escapeHtml(m)}" title="${escapeHtml(m)}">${escapeHtml(m)}${nm}</button>`;
                }).join("")}
              </div>
            </span>`
          : p.isDefault
            ? ""
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

function prefillVariants(id) {
  const o = variantData.official?.[id];
  const b = variantData.builtin?.[id];
  const list = o?.variants?.length ? o.variants : b?.variants ?? [];
  return list.length ? Object.fromEntries(list.map((v) => [v, {}])) : null;
}

function renderVariantsInto(container, modelId) {
  const m = models[modelId];
  const selected = Object.keys(m?.variants ?? {});
  const o = variantData.official?.[modelId]?.variants ?? [];
  const b = variantData.builtin?.[modelId]?.variants ?? [];
  const known = new Set([...o, ...b]);
  container.innerHTML = "";

  const makeChip = (v, isOn) => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "chip" + (isOn ? " on" : "");
    el.textContent = v;
    el.title = v;
    el.setAttribute("aria-pressed", String(isOn));
    el.onclick = () => {
      if (isOn) {
        delete models[modelId].variants[v];
        if (Object.keys(models[modelId].variants).length === 0) delete models[modelId].variants;
      } else { models[modelId].variants ??= {}; models[modelId].variants[v] = {}; }
      renderVariantsInto(container, modelId);
    };
    return el;
  };

  const group = (label, list) => {
    const wrap = document.createElement("div");
    wrap.className = "vg";
    const h = document.createElement("div");
    h.className = "vg-label";
    h.textContent = label;
    wrap.appendChild(h);
    const chips = document.createElement("div");
    chips.className = "chips";
    list.forEach((v) => chips.appendChild(makeChip(v, selected.includes(v))));
    wrap.appendChild(chips);
    return wrap;
  };

  const groups = [];
  if (b.length) groups.push(group("内置变体", b));
  if (o.length) groups.push(group("官方变体", o));

  const custom = selected.filter((v) => !known.has(v));
  const cWrap = document.createElement("div");
  cWrap.className = "vg";
  const cH = document.createElement("div");
  cH.className = "vg-label";
  cH.textContent = "自定义";
  cWrap.appendChild(cH);
  const chips = document.createElement("div");
  chips.className = "chips";
  custom.forEach((v) => chips.appendChild(makeChip(v, true)));
  cWrap.appendChild(chips);
  const addRow = document.createElement("div");
  addRow.className = "chip-add-row";
  const add = document.createElement("input");
  add.className = "chip-add";
  add.placeholder = "自定义变体名";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "chip-add-btn";
  addBtn.textContent = "添加";
  const doAdd = () => {
    const v = add.value.trim();
    if (v && !models[modelId].variants?.[v]) { models[modelId].variants ??= {}; models[modelId].variants[v] = {}; }
    add.value = "";
    renderVariantsInto(container, modelId);
    container.querySelector(".chip-add")?.focus();
  };
  add.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); doAdd(); }
  });
  addBtn.onclick = doAdd;
  addRow.appendChild(add);
  addRow.appendChild(addBtn);
  cWrap.appendChild(addRow);
  groups.push(cWrap);

  if (b.length === 0 && o.length === 0 && custom.length === 0) {
    const note = document.createElement("div");
    note.className = "variant-empty";
    note.appendChild(document.createTextNode("无内置/官方记录,可自定义添加 · "));
    const link = document.createElement("button");
    link.type = "button";
    link.className = "link-btn";
    link.textContent = "管理官方库";
    link.onclick = () => { vbRefresh(); vbDialog.showModal(); };
    note.appendChild(link);
    container.appendChild(note);
  }
  groups.forEach((g) => container.appendChild(g));
  if (selected.length > 0) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "chip-clear";
    clear.textContent = "清空";
    clear.onclick = () => { delete models[modelId].variants; renderVariantsInto(container, modelId); };
    container.appendChild(clear);
  }
}

function renderModels() {
  modelsEl.innerHTML = "";
  Object.entries(models).forEach(([id, m]) => {
    const row = document.createElement("div");
    row.className = "model-row";
    const col1 = document.createElement("div");
    const bl = variantData.builtin?.[id]?.limit;
    const ol = variantData.official?.[id]?.limit;
    const ctx = m?.limit?.context ?? ol?.context ?? bl?.context ?? "";
    const out = m?.limit?.output ?? ol?.output ?? bl?.output ?? "";
    col1.innerHTML = `
      <div class="m-id" title="${escapeHtml(id)}">${escapeHtml(id)}</div>
      <div class="m-name" title="${escapeHtml(m?.name ?? "")}">${escapeHtml(m?.name ?? "")}</div>
      <div class="m-limit">
        <span>上下文</span><input class="limit-input" data-lk="context" inputmode="numeric" value="${ctx}" placeholder="?">
        <span>输出</span><input class="limit-input" data-lk="output" inputmode="numeric" value="${out}" placeholder="?">
      </div>`;
    const syncLimit = () => {
      const c = Number(col1.querySelector('[data-lk="context"]').value);
      const o = Number(col1.querySelector('[data-lk="output"]').value);
      const hasC = Number.isFinite(c) && c > 0;
      const hasO = Number.isFinite(o) && o > 0;
      if (hasC || hasO) {
        models[id].limit = { ...(hasC ? { context: c } : {}), ...(hasO ? { output: o } : {}) };
      } else {
        delete models[id].limit;
      }
    };
    col1.querySelector('[data-lk="context"]').addEventListener("change", syncLimit);
    col1.querySelector('[data-lk="output"]').addEventListener("change", syncLimit);
    const col2 = document.createElement("div");
    col2.className = "m-col-variants";
    renderVariantsInto(col2, id);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn m-del";
    del.textContent = "×";
    del.title = "删除模型";
    del.onclick = () => { delete models[id]; renderModels(); };
    row.appendChild(col1);
    row.appendChild(col2);
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
$("#btn-close").onclick = () => dialog.close();
$("#f-default").addEventListener("change", syncDefaultModelUI);

// ---- 官方变体库 ----
const vbDialog = $("#variants-dialog");
let vbEntries = {};

async function syncVariantData() {
  const d = await api("/api/variants");
  variantData = d;
  if (dialog.open) renderModels();
}

async function vbRefresh() {
  const d = await api("/api/variants");
  const { "//": _comment, ...rest } = d.official;
  vbEntries = rest;
  renderVbList();
}

function renderVbList() {
  const list = $("#vb-list");
  list.innerHTML = "";
  const ids = Object.keys(vbEntries).sort();
  if (ids.length === 0) {
    list.innerHTML = `<p class="empty">暂无条目,点击「+ 新增条目」录入。</p>`;
    return;
  }
  ids.forEach((id) => {
    const e = vbEntries[id];
    const row = document.createElement("div");
    row.className = "vb-row";
    const main = document.createElement("div");
    main.className = "vb-main";
    const idEl = document.createElement("div");
    idEl.className = "vb-id";
    idEl.textContent = id;
    idEl.title = id;
    main.appendChild(idEl);
    const lim = e.limit;
    const sub = document.createElement("div");
    sub.className = "vb-sub";
    sub.textContent = [e.name, lim ? `ctx ${lim.context ?? "?"} · out ${lim.output ?? "?"}` : "", e.source, e.updated].filter(Boolean).join(" · ");
    sub.title = sub.textContent;
    main.appendChild(sub);
    const vars = document.createElement("div");
    vars.className = "vb-variants";
    vars.textContent = (e.variants ?? []).join(", ");
    vars.title = vars.textContent;
    const ops = document.createElement("div");
    ops.className = "vb-ops";
    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.dataset.vb = "edit";
    editBtn.dataset.id = id;
    editBtn.textContent = "编辑";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.dataset.vb = "del";
    delBtn.dataset.id = id;
    delBtn.className = "danger";
    delBtn.textContent = "删除";
    ops.appendChild(editBtn);
    ops.appendChild(delBtn);
    row.appendChild(main);
    row.appendChild(vars);
    row.appendChild(ops);
    list.appendChild(row);
  });
}

function openVbForm(id = null) {
  const e = id ? vbEntries[id] : {};
  $("#vb-form-wrap").classList.remove("hidden");
  $("#vb-id").value = id ?? "";
  $("#vb-id").disabled = !!id;
  $("#vb-name").value = e.name ?? "";
  $("#vb-variants").value = (e.variants ?? []).join(", ");
  $("#vb-source").value = e.source ?? "";
  $("#vb-limit-context").value = e.limit?.context ?? "";
  $("#vb-limit-output").value = e.limit?.output ?? "";
  $("#vb-id").focus();
}

function closeVbForm() {
  $("#vb-form-wrap").classList.add("hidden");
}

$("#btn-variants").onclick = () => { vbRefresh(); vbDialog.showModal(); };
$("#vb-close").onclick = () => vbDialog.close();
$("#vb-add").onclick = () => openVbForm();
$("#vb-form-cancel").onclick = closeVbForm;

$("#vb-extract").onclick = async () => {
  const btn = $("#vb-extract");
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = "提取中...";
  const hint = $("#vb-hint");
  try {
    const d = await api("/api/variants/extract", { method: "POST" });
    hint.textContent = d.output.split("\n").pop() ?? "提取完成";
    await vbRefresh();
    await syncVariantData();
  } catch (err) {
    alert("提取失败: " + err.message);
  }
  btn.disabled = false;
  btn.textContent = old;
};

$("#vb-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#vb-id").value.trim();
  if (!id) return;
  const entry = {
    name: $("#vb-name").value.trim(),
    variants: $("#vb-variants").value.split(",").map((x) => x.trim()).filter(Boolean),
    source: $("#vb-source").value.trim(),
    updated: new Date().toISOString().slice(0, 10),
  };
  const cRaw = Number($("#vb-limit-context").value);
  const oRaw = Number($("#vb-limit-output").value);
  const hasC = Number.isFinite(cRaw) && cRaw > 0;
  const hasO = Number.isFinite(oRaw) && oRaw > 0;
  if (hasC || hasO) {
    entry.limit = { ...(hasC ? { context: cRaw } : {}), ...(hasO ? { output: oRaw } : {}) };
  }
  const next = { ...vbEntries, [id]: entry };
  try {
    await api("/api/variants/official", { method: "PUT", body: JSON.stringify(next) });
    closeVbForm();
    await vbRefresh();
    await syncVariantData();
  } catch (err) {
    alert(err.message);
  }
});

$("#vb-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-vb]");
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.vb === "edit") { openVbForm(id); return; }
  if (btn.dataset.vb === "del") {
    if (!confirm(`删除条目 ${id}?`)) return;
    const next = { ...vbEntries };
    delete next[id];
    try {
      await api("/api/variants/official", { method: "PUT", body: JSON.stringify(next) });
      await vbRefresh();
      await syncVariantData();
    } catch (err) {
      alert(err.message);
    }
  }
});

$("#btn-add-model").onclick = () => {
  const input = $("#f-model-new");
  const id = input.value.trim();
  if (id && !models[id]) { models[id] = { name: id, ...(prefillVariants(id) ? { variants: prefillVariants(id) } : {}) }; renderModels(); }
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
    data.models.forEach((m) => { models[m] = models[m] ?? { name: m, ...(prefillVariants(m) ? { variants: prefillVariants(m) } : {}) }; });
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
function closeAllDropdowns() {
  document.querySelectorAll(".dd-menu").forEach((m) => {
    m.classList.add("hidden");
    m.closest(".dropdown")?.querySelector(".dd-btn")?.setAttribute("aria-expanded", "false");
  });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown")) closeAllDropdowns();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeAllDropdowns();
});

listEl.addEventListener("click", async (e) => {
  const ddBtn = e.target.closest("button.dd-btn");
  if (ddBtn) {
    const menu = document.querySelector(`.dd-menu[data-ddmenu="${ddBtn.dataset.dd}"]`);
    const willOpen = menu?.classList.contains("hidden");
    closeAllDropdowns();
    if (willOpen) {
      menu?.classList.remove("hidden");
      ddBtn.setAttribute("aria-expanded", "true");
    }
    return;
  }
  const ddItem = e.target.closest("button.dd-item");
  if (ddItem) {
    closeAllDropdowns();
    try {
      await api(`/api/providers/${ddItem.dataset.dditem}/activate`, { method: "POST", body: JSON.stringify({ modelId: ddItem.dataset.model }) });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
    return;
  }
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
