const $ = (sel) => document.querySelector(sel);

// ---- 图标(12px 内联 SVG,currentColor) ----
const ICONS = {
  sun: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1"/></svg>',
  moon: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"/></svg>',
  edit: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11.3 2.7a1.4 1.4 0 0 1 2 2L5 13H3v-2l8.3-8.3Z"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2"/></svg>',
};

// ---- 主题切换(data-theme 契约:dark|light,localStorage ui-theme) ----
function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}
function updateThemeIcon() {
  const btn = $("#btn-theme");
  if (btn) btn.innerHTML = currentTheme() === "dark" ? ICONS.sun : ICONS.moon;
}
function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("ui-theme", next);
  updateThemeIcon();
}
const listEl = $("#list");
const emptyEl = $("#empty");
const authListEl = $("#auth-list");
const authSectionEl = $("#auth-section");
const authEmptyEl = $("#auth-empty");

let state = { providers: [], activeModel: "", metadata: { order: [], notes: {}, links: {} } };
let variantData = { builtin: {}, official: {} };
let authProviders = [];

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
  syncVariantData().catch(() => {});
  try {
    const auth = await api("/api/auth-providers");
    authProviders = auth.providers;
  } catch {
    authProviders = [];
  }
  render();
  renderAuth();
}

function renderAuth() {
  authSectionEl.classList.toggle("hidden", authProviders.length === 0);
  authEmptyEl.classList.toggle("hidden", authProviders.length > 0);
  authListEl.innerHTML = "";
  authProviders.forEach((p) => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="top">
        <span class="name">${escapeHtml(p.id)}</span>
        <span class="badge auth-type">${escapeHtml(p.type)}</span>
      </div>
      <div class="meta">认证类型:${escapeHtml(p.type)}${p.hasMetadata ? " · 含登录信息" : ""}</div>
      <div class="ops">
        <button data-auth-act="logout" data-auth-id="${escapeHtml(p.id)}" class="danger">登出</button>
      </div>`;
    authListEl.appendChild(card);
  });
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
      // 外部拖入(非卡片)时 fromIdx 为 -1,splice(-1,1) 会误删末位,必须拦截
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
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
  backfillVariantParams();
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

// 打开编辑时,已存的空对象变体自动补齐参数——数据源有映射用数据源的,
// 否则兜底生成 reasoningEffort 同名(如实保存用户填的变体,不因"官方没有"而留空)
function backfillVariantParams() {
  Object.entries(models).forEach(([id, m]) => {
    if (!m?.variants || Object.keys(m.variants).length === 0) return;
    const src = variantData.official?.[id]?.variantParams ?? variantData.builtin?.[id]?.variantParams ?? {};
    Object.entries(m.variants).forEach(([v, val]) => {
      if (typeof val === "object" && val !== null && Object.keys(val).length === 0) {
        m.variants[v] = src[v] ?? { reasoningEffort: v };
      }
    });
  });
}

function prefillVariants(id) {
  const o = variantData.official?.[id];
  const b = variantData.builtin?.[id];
  const src = o?.variantParams ?? b?.variantParams ?? {};
  const list = o?.variants?.length ? o.variants : b?.variants ?? [];
  return list.length ? Object.fromEntries(list.map((v) => [v, src[v] ?? { reasoningEffort: v }])) : null;
}

function prefillMeta(id) {
  const meta = {};
  const reasoning = variantData.builtin?.[id]?.reasoning ?? variantData.official?.[id]?.reasoning;
  if (reasoning !== undefined) meta.reasoning = reasoning;
  const modalities = variantData.official?.[id]?.modalities;
  if (modalities) meta.modalities = modalities;
  return meta;
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
      } else {
        models[modelId].variants ??= {};
        const src = variantData.official?.[modelId]?.variantParams?.[v]
          ?? variantData.builtin?.[modelId]?.variantParams?.[v]
          ?? { reasoningEffort: v };
        models[modelId].variants[v] = src;
      }
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

// 把模型行的 limit 输入框当前值同步进 models(预填/未触发 change 的值也会写入)
function syncLimitFromRow(id, row) {
  const c = Number(row.querySelector('[data-lk="context"]').value);
  const o = Number(row.querySelector('[data-lk="output"]').value);
  const hasC = Number.isFinite(c) && c > 0;
  const hasO = Number.isFinite(o) && o > 0;
  if (hasC || hasO) {
    models[id].limit = { ...(hasC ? { context: c } : {}), ...(hasO ? { output: o } : {}) };
  } else {
    delete models[id].limit;
  }
}

function syncModalitiesFromRow(id, row) {
  const checked = [...row.querySelectorAll('[data-mod]')].filter((cb) => cb.checked).map((cb) => cb.dataset.mod);
  const nonText = checked.filter((m) => m !== "text");
  if (nonText.length > 0) {
    const existingOutput = models[id]?.modalities?.output;
    models[id].modalities = { input: ["text", ...nonText], output: existingOutput ?? ["text"] };
  } else {
    delete models[id].modalities;
  }
}

function syncReasoningFromRow(id, row) {
  const val = row.querySelector("[data-rs]")?.value;
  if (val === "true") models[id].reasoning = true;
  else if (val === "false") models[id].reasoning = false;
  else delete models[id].reasoning;
}

function renderModels() {
  modelsEl.innerHTML = "";
  Object.entries(models).forEach(([id, m]) => {
    const row = document.createElement("div");
    row.className = "model-row";
    row.dataset.model = id;
    const col1 = document.createElement("div");
    const bl = variantData.builtin?.[id]?.limit;
    const ol = variantData.official?.[id]?.limit;
    const ctx = m?.limit?.context ?? ol?.context ?? bl?.context ?? "";
    const out = m?.limit?.output ?? ol?.output ?? bl?.output ?? "";
    const modIn = m?.modalities?.input ?? [];
    const rsVal = m?.reasoning === true ? "true" : m?.reasoning === false ? "false" : "";
    col1.innerHTML = `
      <div class="m-id" title="${escapeHtml(id)}">${escapeHtml(id)}</div>
      <div class="m-name" title="${escapeHtml(m?.name ?? "")}">${escapeHtml(m?.name ?? "")}</div>
      <div class="m-limit">
        <span>上下文</span><input class="limit-input" data-lk="context" inputmode="numeric" value="${ctx}" placeholder="?">
        <span>输出</span><input class="limit-input" data-lk="output" inputmode="numeric" value="${out}" placeholder="?">
      </div>
      <div class="m-modalities">
        <span>模态</span>
        <span><input type="checkbox" data-mod="text" checked disabled> text</span>
        <span><input type="checkbox" data-mod="image" ${modIn.includes("image") ? "checked" : ""}> image</span>
        <span><input type="checkbox" data-mod="audio" ${modIn.includes("audio") ? "checked" : ""}> audio</span>
        <span><input type="checkbox" data-mod="video" ${modIn.includes("video") ? "checked" : ""}> video</span>
        <span><input type="checkbox" data-mod="pdf" ${modIn.includes("pdf") ? "checked" : ""}> pdf</span>
      </div>
      <div class="m-reasoning">
        <span>推理</span>
        <select class="reasoning-select" data-rs>
          <option value="" ${rsVal === "" ? "selected" : ""}>未设置</option>
          <option value="true" ${rsVal === "true" ? "selected" : ""}>支持</option>
          <option value="false" ${rsVal === "false" ? "selected" : ""}>不支持</option>
        </select>
      </div>`;
    const syncLimit = () => syncLimitFromRow(id, row);
    col1.querySelector('[data-lk="context"]').addEventListener("change", syncLimit);
    col1.querySelector('[data-lk="output"]').addEventListener("change", syncLimit);
    const syncMod = () => syncModalitiesFromRow(id, row);
    const syncRs = () => syncReasoningFromRow(id, row);
    col1.querySelectorAll('[data-mod]').forEach((cb) => cb.addEventListener("change", syncMod));
    col1.querySelector('[data-rs]')?.addEventListener("change", syncRs);
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

// 变体数据统一刷新:/api/variants 只请求一次,同步 variantData 与 vbEntries 两处状态
async function syncVariantData() {
  const d = await api("/api/variants");
  variantData = d;
  const { "//": _comment, ...rest } = d.official;
  vbEntries = rest;
  if (vbDialog.open) renderVbList();
  if (dialog.open) renderModels();
}

async function vbRefresh() {
  await syncVariantData();
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
    const modStr = e.modalities?.input?.length > 1 ? `模态 ${e.modalities.input.join("+")}` : "";
    const rsStr = e.reasoning === true ? "推理:支持" : e.reasoning === false ? "推理:不支持" : "";
    const sub = document.createElement("div");
    sub.className = "vb-sub";
    sub.textContent = [e.name, lim ? `ctx ${lim.context ?? "?"} · out ${lim.output ?? "?"}` : "", modStr, rsStr, e.source, e.updated].filter(Boolean).join(" · ");
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
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.dataset.vb = "copy";
    copyBtn.dataset.id = id;
    copyBtn.textContent = "复制";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.dataset.vb = "del";
    delBtn.dataset.id = id;
    delBtn.className = "danger";
    delBtn.textContent = "删除";
    ops.appendChild(editBtn);
    ops.appendChild(copyBtn);
    ops.appendChild(delBtn);
    row.appendChild(main);
    row.appendChild(vars);
    row.appendChild(ops);
    list.appendChild(row);
  });
}

let vbCopySourceId = null;

function openVbForm(id = null, copy = false) {
  const e = id ? vbEntries[id] : {};
  vbCopySourceId = copy ? id : null;
  $("#vb-form-wrap").classList.remove("hidden");
  $("#vb-id").value = copy ? `${id}-copy` : id ?? "";
  $("#vb-id").disabled = !!id && !copy;
  $("#vb-name").value = e.name ?? "";
  $("#vb-variants").value = (e.variants ?? []).join(", ");
  $("#vb-source").value = e.source ?? "";
  $("#vb-limit-context").value = e.limit?.context ?? "";
  $("#vb-limit-output").value = e.limit?.output ?? "";
  const modIn = e.modalities?.input ?? [];
  document.querySelectorAll('#vb-form [data-vbmod]').forEach((cb) => {
    if (cb.dataset.vbmod !== "text") cb.checked = modIn.includes(cb.dataset.vbmod);
  });
  const rsVal = e.reasoning === true ? "true" : e.reasoning === false ? "false" : "";
  $("#vb-reasoning").value = rsVal;
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
  if (vbEntries[id] && id !== vbCopySourceId) { alert(`条目 ${id} 已存在,请换一个 ID`); return; }
  const entry = {
    name: $("#vb-name").value.trim(),
    variants: $("#vb-variants").value.split(",").map((x) => x.trim()).filter(Boolean),
    source: $("#vb-source").value.trim(),
    updated: new Date().toISOString().slice(0, 10),
  };
  // 编辑/复制时保留 variantParams(表单无此字段):编辑取自身,复制取源条目
  const paramsFrom = vbCopySourceId ?? id;
  const prevParams = vbEntries[paramsFrom]?.variantParams;
  if (prevParams && Object.keys(prevParams).length > 0) {
    entry.variantParams = prevParams;
  }
  const cRaw = Number($("#vb-limit-context").value);
  const oRaw = Number($("#vb-limit-output").value);
  const hasC = Number.isFinite(cRaw) && cRaw > 0;
  const hasO = Number.isFinite(oRaw) && oRaw > 0;
  if (hasC || hasO) {
    entry.limit = { ...(hasC ? { context: cRaw } : {}), ...(hasO ? { output: oRaw } : {}) };
  }
  // modalities
  const modChecked = [...document.querySelectorAll('#vb-form [data-vbmod]')].filter((cb) => cb.checked).map((cb) => cb.dataset.vbmod);
  const modNonText = modChecked.filter((m) => m !== "text");
  if (modNonText.length > 0) {
    const existingOutput = vbEntries[vbCopySourceId ?? id]?.modalities?.output;
    entry.modalities = { input: ["text", ...modNonText], output: existingOutput ?? ["text"] };
  }
  // reasoning
  const rsVal = $("#vb-reasoning").value;
  if (rsVal === "true") entry.reasoning = true;
  else if (rsVal === "false") entry.reasoning = false;
  // 增量提交:只提交目标条目,服务端 merge 保留文件内其他条目
  const next = { [id]: entry };
  try {
    await api("/api/variants/official", { method: "PUT", body: JSON.stringify(next) });
    closeVbForm();
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
  if (btn.dataset.vb === "copy") { openVbForm(id, true); return; }
  if (btn.dataset.vb === "del") {
    if (!confirm(`删除条目 ${id}?`)) return;
    try {
      // 增量删除:发 null 标记,服务端只删该条目,文件内其他条目保留
      await api("/api/variants/official", { method: "PUT", body: JSON.stringify({ [id]: null }) });
      await syncVariantData();
    } catch (err) {
      alert(err.message);
    }
  }
});

$("#btn-add-model").onclick = () => {
  const input = $("#f-model-new");
  const id = input.value.trim();
  if (id && !models[id]) {
    const pv = prefillVariants(id);
    models[id] = { name: id, ...prefillMeta(id), ...(pv ? { variants: pv } : {}) };
    renderModels();
  }
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
    data.models.forEach((m) => {
      if (models[m]) return;
      const pv = prefillVariants(m);
      models[m] = { name: m, ...prefillMeta(m), ...(pv ? { variants: pv } : {}) };
    });
    renderModels();
  } catch (e) {
    alert("获取模型失败: " + e.message);
  }
  btn.disabled = false; btn.textContent = "获取模型";
};

$("#provider-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  // 提交前兜底同步:未触发 change 的预填 limit 值也写入 models
  modelsEl.querySelectorAll(".model-row").forEach((row) => {
    const mid = row.dataset.model;
    if (mid && models[mid]) {
      syncLimitFromRow(mid, row);
      syncModalitiesFromRow(mid, row);
      syncReasoningFromRow(mid, row);
    }
  });
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

authListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-auth-act]");
  if (!btn) return;
  const id = btn.dataset.authId;
  if (!confirm(`登出已登录供应商 ${id}?登出后移除其认证,重新登录可恢复。`)) return;
  try {
    await api(`/api/auth-providers/${encodeURIComponent(id)}/logout`, { method: "POST" });
    await refresh();
  } catch (err) {
    alert(err.message);
  }
});

$("#btn-theme").onclick = toggleTheme;
updateThemeIcon();

refresh().catch((e) => {
  if (e.message.includes("未找到")) {
    listEl.innerHTML = `<p class="empty">未找到 mimocode.jsonc,请先运行 mimocode 生成配置,或设置 MIMOCODE_HOME 环境变量。</p>`;
  } else {
    alert(e.message);
  }
});
