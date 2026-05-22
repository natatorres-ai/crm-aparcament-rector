const LEGACY_STORAGE_KEY = "crm-aparcament-rector-v1";
let migrationRunning = false;

function getLegacyClients() {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "{}");
    if (!Array.isArray(legacy.clients)) return [];
    return legacy.clients.filter((client) => client && (client.name || client.phone || client.email));
  } catch {
    return [];
  }
}

function hasClientAlready(client) {
  const key = `${normalizeKey(client.name)}-${normalizeKey(client.phone)}`;
  return state.clients.some((existing) => `${normalizeKey(existing.name)}-${normalizeKey(existing.phone)}` === key);
}

async function migrateLegacyClientsToSupabase() {
  if (migrationRunning) return;
  const pendingClients = getLegacyClients().filter((client) => !hasClientAlready(client));
  if (!pendingClients.length) {
    alert("No he trobat clients locals pendents de migrar en aquest navegador.");
    return;
  }
  const ok = confirm(`He trobat ${pendingClients.length} clients guardats localment en aquest navegador. Vols pujar-los ara a Supabase?`);
  if (!ok) return;
  migrationRunning = true;
  try {
    setConnectionStatus("Guardando...", "busy");
    for (const client of pendingClients) {
      const saved = await saveClient(makeClient({
        name: client.name,
        phone: client.phone,
        email: client.email,
        interest: client.interest,
        status: client.status,
        priority: client.priority,
        notes: client.notes,
        createdAt: client.createdAt,
      }));
      state.clients.push(saved);
    }
    cacheData();
    render();
    setConnectionStatus("Guardado", "ok");
    alert(`Migrats ${pendingClients.length} clients locals a Supabase.`);
  } catch (error) {
    setConnectionStatus("Error de conexion", "error");
    showMessage(`No s'han pogut migrar les dades locals: ${error.message}`);
  } finally {
    migrationRunning = false;
  }
}

function addMigrationButton() {
  const actions = document.querySelector(".header-actions");
  if (!actions || document.querySelector("#migrateLegacy")) return;
  const button = document.createElement("button");
  button.id = "migrateLegacy";
  button.type = "button";
  button.textContent = "Migrar dades locals";
  button.addEventListener("click", migrateLegacyClientsToSupabase);
  actions.appendChild(button);
}

function suggestMigrationIfNeeded() {
  const pendingClients = getLegacyClients().filter((client) => !hasClientAlready(client));
  if (!pendingClients.length) return;
  showMessage(`Aquest navegador te ${pendingClients.length} clients antics guardats localment. Clica "Migrar dades locals" per pujar-los a Supabase.`, "warning");
}

function normalizeUnitatStatus(value) {
  const key = normalizeKey(value);
  const statusesMap = {
    "": "",
    disponible: "disponible",
    reservada: "reservada",
    reservat: "reservada",
    reserva: "reservada",
    llogada: "llogada",
    llogat: "llogada",
    contractada: "llogada",
    contractat: "llogada",
    bloquejada: "bloquejada",
    bloquejat: "bloquejada",
    pendent: "pendent",
    pendentpagament: "pendent",
    pendentdepagament: "pendent",
    cancelada: "cancelada",
    cancellada: "cancelada",
  };
  return statusesMap[key] ?? String(value || "").trim().toLowerCase();
}

function statusForAssignacio(estatAssignacio) {
  const key = normalizeKey(estatAssignacio);
  if (key.includes("cancel")) return "disponible";
  if (key.includes("contract") || key.includes("llog")) return "llogada";
  if (key.includes("pendent")) return "pendent";
  return "reservada";
}

function isCancelledAssignacio(estatAssignacio) {
  return normalizeKey(estatAssignacio).includes("cancel");
}

function isActiveAssignacio(assignacio) {
  return assignacio && !isCancelledAssignacio(assignacio.estat);
}

function isUnitatAvailable(unitat) {
  return normalizeUnitatStatus(unitat?.estat) === "disponible";
}

function ensureUnitatsPanel() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || document.querySelector("#unitatsList")) return;
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `<div class="panel-heading-row"><h2>Unitats</h2><button id="refreshUnitats" type="button">Refrescar</button></div><div class="unit-summary" id="unitatsSummary">0 unitats carregades</div><div class="unit-list" id="unitatsList"></div>`;
  sidebar.appendChild(panel);
  els.refreshUnitats = document.querySelector("#refreshUnitats");
  els.unitatsSummary = document.querySelector("#unitatsSummary");
  els.unitatsList = document.querySelector("#unitatsList");
}

function ensureUnitatsStyles() {
  if (document.querySelector("#unitatsStyles")) return;
  const style = document.createElement("style");
  style.id = "unitatsStyles";
  style.textContent = `.app-message[data-type="ok"]{border-color:#78a58f;background:#eef7f2;color:#245b4f}.app-message[data-type="warning"]{border-color:#c8aa75;background:#fff8e9;color:#704f15}.panel-heading-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.panel-heading-row h2{margin-bottom:0}.panel-heading-row button{min-height:34px;padding:7px 10px;font-size:13px}.unit-summary{margin:10px 0;color:var(--muted);font-size:13px;font-weight:750}.unit-list{display:grid;gap:8px;max-height:360px;overflow:auto}.unit-item{display:grid;gap:4px;padding:10px;border:1px solid var(--line);border-radius:6px;background:#f8faf7}.unit-item[data-status="reservada"]{border-color:#c8aa75;background:#fff8e9}.unit-item[data-status="llogada"]{border-color:#78a58f;background:#eef7f2}.unit-item[data-status="bloquejada"],.unit-item[data-status="pendent"]{border-color:#d5a19b;background:#fff1ef}.unit-item strong{overflow-wrap:anywhere}.unit-item span{color:var(--muted);font-size:12px;line-height:1.35}`;
  document.head.appendChild(style);
}

mapUnitatFromDb = function mapUnitatFromDb(row) {
  const label = [row.numero, row.planta ? `planta ${row.planta}` : "", row.tipus || row.tipus_unitat].filter(Boolean).join(" - ");
  return {
    id: row.id,
    tipusUnitat: row.tipus_unitat || "",
    numero: row.numero || "",
    planta: row.planta || "",
    tipus: row.tipus || "",
    preu: row.preu ?? "",
    estat: row.estat || "",
    observacions: row.observacions || "",
    m2: row.m2 ?? "",
    label: row.numero || label || "Unitat",
    detail: label || row.numero || "Unitat",
  };
};

cacheData = function cacheData() {
  localStorage.setItem(CACHE_KEY, JSON.stringify({
    clients: state.clients,
    assignacions: state.assignacions,
    cachedAt: new Date().toISOString(),
  }));
};

loadCache = function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
    state.clients = Array.isArray(cached.clients) ? cached.clients : [];
    state.unitats = [];
    state.assignacions = Array.isArray(cached.assignacions) ? cached.assignacions : [];
    enrichAssignedUnits();
    render();
  } catch {
    state.clients = [];
    state.unitats = [];
    state.assignacions = [];
  }
};

loadUnitats = async function loadUnitats() {
  requireSupabase();
  showMessage("Cargando unidades...", "warning");
  const { data, error } = await supabaseClient
    .from("unitats")
    .select("id,tipus_unitat,numero,planta,tipus,preu,estat,observacions,m2,created_at,updated_at")
    .order("planta", { ascending: true })
    .order("numero", { ascending: true });
  if (error) {
    showMessage("Error cargando unidades", "error");
    throw error;
  }
  state.unitats = (data || []).map(mapUnitatFromDb);
  showMessage("Unidades cargadas correctamente", "ok");
  return state.unitats;
};

loadAvailableUnitats = async function loadAvailableUnitats() {
  requireSupabase();
  const { data, error } = await supabaseClient
    .from("unitats")
    .select("id,tipus_unitat,numero,planta,tipus,preu,estat,observacions,m2,created_at,updated_at")
    .eq("estat", "disponible")
    .order("planta", { ascending: true })
    .order("numero", { ascending: true });
  if (error) throw error;
  return (data || []).map(mapUnitatFromDb);
};

updateUnitatStatus = async function updateUnitatStatus(unitatId, nouEstat) {
  requireSupabase();
  const { data, error } = await supabaseClient
    .from("unitats")
    .update({ estat: normalizeUnitatStatus(nouEstat), updated_at: new Date().toISOString() })
    .eq("id", unitatId)
    .select("id,tipus_unitat,numero,planta,tipus,preu,estat,observacions,m2,created_at,updated_at")
    .single();
  if (error) throw error;
  const mapped = mapUnitatFromDb(data);
  state.unitats = state.unitats.map((unitat) => (String(unitat.id) === String(mapped.id) ? mapped : unitat));
  return mapped;
};

reserveUnitatIfAvailable = async function reserveUnitatIfAvailable(unitatId, nouEstat) {
  requireSupabase();
  const { data, error } = await supabaseClient
    .from("unitats")
    .update({ estat: normalizeUnitatStatus(nouEstat), updated_at: new Date().toISOString() })
    .eq("id", unitatId)
    .eq("estat", "disponible")
    .select("id,tipus_unitat,numero,planta,tipus,preu,estat,observacions,m2,created_at,updated_at")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Aquesta placa ja no esta disponible. Actualitza la llista d'unitats.");
  const mapped = mapUnitatFromDb(data);
  state.unitats = state.unitats.map((unitat) => (String(unitat.id) === String(mapped.id) ? mapped : unitat));
  return mapped;
};

activeAssignacionsForUnitat = async function activeAssignacionsForUnitat(unitatId, excludedAssignacioId = null) {
  requireSupabase();
  const { data, error } = await supabaseClient.from("assignacions").select("*").eq("unitat_id", unitatId);
  if (error) throw error;
  return (data || []).filter((assignacio) => isActiveAssignacio(assignacio) && String(assignacio.id) !== String(excludedAssignacioId || ""));
};

releaseUnitatIfUnused = async function releaseUnitatIfUnused(unitatId, excludedAssignacioId = null) {
  if (!unitatId) return;
  const activeAssignacions = await activeAssignacionsForUnitat(unitatId, excludedAssignacioId);
  if (!activeAssignacions.length) await updateUnitatStatus(unitatId, "disponible");
};

refreshUnitatsAfterAssignment = async function refreshUnitatsAfterAssignment() {
  await loadUnitats();
  await loadAssignacions();
  enrichAssignedUnits();
  cacheData();
  render();
};

cancelAssignacio = async function cancelAssignacio(assignacioId) {
  requireSupabase();
  const assignacio = state.assignacions.find((item) => String(item.id) === String(assignacioId));
  const unitatId = assignacio?.unitat_id;
  const { data, error } = await supabaseClient
    .from("assignacions")
    .update({ estat: "cancelada", updated_at: new Date().toISOString() })
    .eq("id", assignacioId)
    .select()
    .single();
  if (error) throw error;
  state.assignacions = state.assignacions.map((item) => (String(item.id) === String(assignacioId) ? data : item));
  await releaseUnitatIfUnused(unitatId, assignacioId);
  await refreshUnitatsAfterAssignment();
  return data;
};

assignUnitatToClient = async function assignUnitatToClient(clientId, unitatId, estatAssignacio) {
  requireSupabase();
  const nouEstatUnitat = statusForAssignacio(estatAssignacio);
  const existing = state.assignacions.find((item) => String(item.client_id) === String(clientId) && isActiveAssignacio(item));
  const oldUnitatId = existing?.unitat_id;
  const sameUnitat = oldUnitatId && String(oldUnitatId) === String(unitatId);

  if (nouEstatUnitat === "disponible") {
    if (existing?.id) return cancelAssignacio(existing.id);
    return null;
  }

  if (sameUnitat) await updateUnitatStatus(unitatId, nouEstatUnitat);
  else await reserveUnitatIfAvailable(unitatId, nouEstatUnitat);

  const payload = {
    client_id: clientId,
    unitat_id: unitatId,
    estat: estatAssignacio,
    data_assignacio: todayIso(),
    reserva_pagada: nouEstatUnitat === "reservada" || nouEstatUnitat === "llogada",
    contracte_generat: nouEstatUnitat === "llogada",
    contracte_signat: nouEstatUnitat === "llogada",
    updated_at: new Date().toISOString(),
  };

  try {
    let saved;
    if (existing?.id) {
      const { data, error } = await supabaseClient.from("assignacions").update(payload).eq("id", existing.id).select().single();
      if (error) throw error;
      saved = data;
      state.assignacions = state.assignacions.map((item) => (item.id === existing.id ? data : item));
    } else {
      payload.created_at = new Date().toISOString();
      const { data, error } = await supabaseClient.from("assignacions").insert(payload).select().single();
      if (error) throw error;
      saved = data;
      state.assignacions.push(data);
    }
    if (oldUnitatId && !sameUnitat) await releaseUnitatIfUnused(oldUnitatId, existing?.id);
    await refreshUnitatsAfterAssignment();
    showMessage("Placa assignada correctament", "ok");
    return saved;
  } catch (error) {
    if (!sameUnitat) await releaseUnitatIfUnused(unitatId);
    throw error;
  }
};

saveAssignacio = async function saveAssignacio(client, unitat) {
  requireSupabase();
  if (!client?.id || !unitat?.id) return null;
  return assignUnitatToClient(client.id, unitat.id, client.status);
};

deleteClient = async function deleteClient(clientId) {
  requireSupabase();
  setConnectionStatus("Guardando...", "busy");
  const clientAssignacions = state.assignacions.filter((item) => String(item.client_id) === String(clientId));
  const unitatsToRelease = [...new Set(clientAssignacions.map((item) => item.unitat_id).filter(Boolean))];
  await supabaseClient.from("assignacions").delete().eq("client_id", clientId);
  const { error } = await supabaseClient.from("clients").delete().eq("id", clientId);
  if (error) throw error;
  for (const unitatId of unitatsToRelease) await releaseUnitatIfUnused(unitatId);
  setConnectionStatus("Guardado", "ok");
};

saveSelectedClient = async function saveSelectedClient() {
  const client = state.clients.find((item) => String(item.id) === String(state.selectedId));
  if (!client) return;
  const previousAssignedUnit = client.assignedUnit;
  const draft = {
    ...client,
    name: els.clientName.value.trim() || "Sense nom",
    phone: els.clientPhone.value.trim(),
    email: els.clientEmail.value.trim(),
    interest: els.clientInterest.value,
    status: els.clientStatus.value,
    priority: els.clientPriority.value,
    assignedUnit: els.assignedUnit.value.trim(),
    lastContact: els.lastContact.value,
    nextStep: els.nextStep.value,
    notes: els.notes.value.trim(),
  };
  try {
    const updated = await updateClient(draft);
    updated.assignedUnit = draft.assignedUnit;
    updated.lastContact = draft.lastContact;
    updated.nextStep = draft.nextStep;
    if (draft.assignedUnit) {
      const unitat = findUnitatByLabel(draft.assignedUnit);
      if (unitat) await saveAssignacio(updated, unitat);
      else showMessage("Client guardat, pero no he trobat aquesta unitat a Supabase per crear l'assignacio.", "warning");
    } else if (previousAssignedUnit) {
      const activeAssignacio = state.assignacions.find((item) => String(item.client_id) === String(updated.id) && isActiveAssignacio(item));
      if (activeAssignacio?.id) await cancelAssignacio(activeAssignacio.id);
    }
    state.clients = state.clients.map((item) => (String(item.id) === String(updated.id) ? updated : item));
    enrichAssignedUnits();
    cacheData();
    render();
    els.dialog.close();
  } catch (error) {
    setConnectionStatus("Error de conexion", "error");
    showMessage(`No s'ha pogut guardar el client: ${error.message}`);
  }
};

enrichAssignedUnits = function enrichAssignedUnits() {
  state.clients.forEach((client) => {
    const assignacio = [...state.assignacions].reverse().find((item) => item.client_id === client.id && isActiveAssignacio(item));
    if (!assignacio) return;
    const unitat = state.unitats.find((item) => item.id === assignacio.unitat_id);
    client.assignedUnit = unitat?.label || client.assignedUnit || "";
  });
};

renderUnitList = function renderUnitList() {
  els.unitList.innerHTML = state.unitats
    .filter(isUnitatAvailable)
    .map((unitat) => `<option value="${escapeHtml(unitat.label)}">${escapeHtml(unitat.detail)}</option>`)
    .join("");
  renderUnitatsPanel();
};

function renderUnitatsPanel() {
  ensureUnitatsPanel();
  if (!els.unitatsSummary || !els.unitatsList) return;
  const total = state.unitats.length;
  const places = state.unitats.filter((unitat) => normalizeKey(unitat.tipusUnitat || unitat.tipus).includes("plac")).length;
  const trasters = state.unitats.filter((unitat) => normalizeKey(unitat.tipusUnitat || unitat.tipus).includes("traster")).length;
  els.unitatsSummary.textContent = `${total} unitats carregades - ${places} places - ${trasters} trasters`;
  els.unitatsList.innerHTML = state.unitats.map((unitat) => {
    const title = [unitat.tipusUnitat || "Unitat", unitat.numero ? `num. ${unitat.numero}` : ""].filter(Boolean).join(" ");
    const details = [
      unitat.planta ? `Planta ${unitat.planta}` : "",
      unitat.tipus || "",
      unitat.estat ? `Estat: ${unitat.estat}` : "",
      unitat.preu !== "" && unitat.preu !== null ? `Preu: ${unitat.preu}` : "",
      unitat.m2 !== "" && unitat.m2 !== null ? `${unitat.m2} m2` : "",
    ].filter(Boolean);
    return `<div class="unit-item" data-status="${escapeHtml(normalizeUnitatStatus(unitat.estat) || "sense-estat")}"><strong>${escapeHtml(title || unitat.label)}</strong><span>${escapeHtml(details.join(" - ") || "Sense detall")}</span></div>`;
  }).join("");
}

async function refreshUnitatsFromSupabase() {
  try {
    setConnectionStatus("Connectant...", "busy");
    await loadUnitats();
    await loadAssignacions();
    enrichAssignedUnits();
    cacheData();
    render();
    setConnectionStatus("Conectado a Supabase", "ok");
  } catch (error) {
    setConnectionStatus("Error de conexion", "error");
    showMessage(`Error cargando unidades: ${error.message}`, "error");
  }
}

addMigrationButton();
setTimeout(suggestMigrationIfNeeded, 1800);
ensureUnitatsStyles();
ensureUnitatsPanel();
els.saveClient?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopImmediatePropagation();
  saveSelectedClient();
}, true);
els.refreshUnitats?.addEventListener("click", refreshUnitatsFromSupabase);
state.unitats = [];
setTimeout(refreshUnitatsFromSupabase, 0);
