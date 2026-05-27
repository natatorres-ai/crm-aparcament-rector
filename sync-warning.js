const MAIN_STATUSES = [
  { value: "pendent", label: "Pendent" },
  { value: "interessat", label: "Interessat" },
  { value: "reserva_feta", label: "Reserva feta" },
  { value: "contracte_signat", label: "Contracte signat" },
];

const CLIENT_SITUACIONS = [
  { value: "pendent_de_contactar", label: "Pendent de contactar" },
  { value: "contactat", label: "Contactat" },
  { value: "no_contesta", label: "No contesta" },
  { value: "no_interessat", label: "No interessat" },
];

let crmSituacioColumnReady = false;
let crmSituacioWarningShown = false;

function labelForStatus(value) {
  return MAIN_STATUSES.find((item) => item.value === normalizeStatus(value))?.label || "Pendent";
}

function labelForSituacio(value) {
  return CLIENT_SITUACIONS.find((item) => item.value === normalizeSituacio(value))?.label || "Pendent de contactar";
}

normalizeStatus = function normalizeStatus(value) {
  const key = normalizeKey(value);
  const map = {
    "": "pendent",
    pendent: "pendent",
    pendentdecontactar: "pendent",
    contactar: "pendent",
    contactat: "pendent",
    nohacontestat: "pendent",
    nocontesta: "pendent",
    nointeressat: "pendent",
    interessat: "interessat",
    reservat: "reserva_feta",
    reservada: "reserva_feta",
    reservafeta: "reserva_feta",
    contractat: "contracte_signat",
    contractesignat: "contracte_signat",
  };
  return map[key] || "pendent";
};

function normalizeSituacio(value, fallbackStatus = "") {
  const key = normalizeKey(value);
  const map = {
    pendentdecontactar: "pendent_de_contactar",
    pendent: "pendent_de_contactar",
    contactar: "pendent_de_contactar",
    contactat: "contactat",
    nohacontestat: "no_contesta",
    nocontesta: "no_contesta",
    nointeressat: "no_interessat",
  };
  if (map[key]) return map[key];
  return map[normalizeKey(fallbackStatus)] || "pendent_de_contactar";
}

function normalizeClientState(estat, situacio) {
  return { estat: normalizeStatus(estat), situacio: normalizeSituacio(situacio, estat) };
}

function setupSimplifiedModel() {
  statuses.splice(0, statuses.length, ...MAIN_STATUSES.map((item) => item.value));
  state.filters.showNoInteressats = false;

  statusForAssignacio = function statusForAssignacio(status) {
    return normalizeStatus(status) === "contracte_signat" ? "llogada" : "reservada";
  };

  mapClientFromDb = function mapClientFromDb(row) {
    const normalized = normalizeClientState(row.estat, row.situacio);
    const client = makeClient({
      id: row.id,
      name: row.nom,
      phone: row.telefon,
      email: row.email,
      interest: row.tipus_interes,
      status: normalized.estat,
      priority: typeof priorityFromDb === "function" ? priorityFromDb(row.prioritat) : row.prioritat,
      notes: row.comentaris,
      createdAt: row.data_alta || row.created_at,
    });
    client.status = normalized.estat;
    client.situacio = normalized.situacio;
    client._dbStatus = row.estat || "";
    client._dbSituacio = row.situacio || "";
    return client;
  };

  mapClientToDb = function mapClientToDb(client) {
    const payload = {
      nom: client.name,
      telefon: client.phone,
      email: client.email,
      tipus_interes: client.interest,
      estat: normalizeStatus(client.status),
      prioritat: typeof priorityToDb === "function" ? priorityToDb(client.priority) : client.priority,
      comentaris: client.notes,
      data_alta: client.createdAt || todayIso(),
      updated_at: new Date().toISOString(),
    };
    if (crmSituacioColumnReady) payload.situacio = normalizeSituacio(client.situacio, client.status);
    return payload;
  };

  mapUnitatToDb = function mapUnitatToDb(unitat) {
    return {
      tipus_unitat: unitat.tipusUnitat || unitat.tipus || "Placa",
      numero: unitat.numero || unitat.label || "",
      planta: unitat.planta || "",
      tipus: unitat.tipus || "",
      preu: unitat.preu === "" ? null : Number(unitat.preu) || null,
      estat: "disponible",
      observacions: unitat.observacions || "",
      m2: unitat.m2 === "" ? null : Number(unitat.m2) || null,
      updated_at: new Date().toISOString(),
    };
  };
}

function ensureSimplifiedUi() {
  if (els.clientStatus) {
    els.clientStatus.innerHTML = MAIN_STATUSES.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  }
  if (!els.clientSituacio) {
    const situacioLabel = document.createElement("label");
    situacioLabel.innerHTML = `<span>Situacio</span><select id="clientSituacio"></select>`;
    els.clientStatus?.closest("label")?.insertAdjacentElement("afterend", situacioLabel);
    els.clientSituacio = situacioLabel.querySelector("#clientSituacio");
  }
  if (els.clientSituacio) {
    els.clientSituacio.innerHTML = CLIENT_SITUACIONS.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
  }
  if (els.nextStepFilter) {
    const label = els.nextStepFilter.closest("label");
    const span = label?.querySelector("span");
    if (span) span.textContent = "Estat";
    els.nextStepFilter.innerHTML = ['<option value="">Tots</option>', ...MAIN_STATUSES.map((item) => `<option value="${item.value}">${item.label}</option>`)].join("");
  }
  if (!document.querySelector("#showNoInteressats")) {
    const wrapper = document.createElement("label");
    wrapper.className = "checkbox-filter";
    wrapper.innerHTML = `<input id="showNoInteressats" type="checkbox" /> <span>Mostrar no interessats</span>`;
    els.nextStepFilter?.closest("label")?.insertAdjacentElement("afterend", wrapper);
    els.showNoInteressats = wrapper.querySelector("#showNoInteressats");
    els.showNoInteressats.addEventListener("change", () => {
      state.filters.showNoInteressats = els.showNoInteressats.checked;
      render();
    });
  }
}

function ensureStyles() {
  if (document.querySelector("#simplifiedStateStyles")) return;
  const style = document.createElement("style");
  style.id = "simplifiedStateStyles";
  style.textContent = ".status-pill.ok{display:none}.checkbox-filter{display:flex;align-items:center;gap:8px;margin-top:-2px}.checkbox-filter input{width:auto}.checkbox-filter span{font-size:13px;color:var(--muted);font-weight:750}.situacio-pill{background:#edf1ef;color:#52605b}.situacio-pill.alert{background:#fff1ef;color:#a33b32}.advanced-actions{position:relative}.advanced-actions summary{min-height:40px;display:inline-flex;align-items:center;border:1px solid var(--accent);border-radius:6px;background:#fff;color:var(--accent);padding:9px 13px;font-weight:750;cursor:pointer;list-style:none}.advanced-actions summary::-webkit-details-marker{display:none}.advanced-actions div{position:absolute;right:0;top:calc(100% + 8px);z-index:20;display:grid;gap:8px;min-width:230px;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff;box-shadow:var(--shadow)}.advanced-actions:not([open]) div{display:none}.advanced-actions div button,.advanced-actions div .file-button{width:100%;justify-content:center;text-align:center}#migrateLegacy{display:none}";
  document.head.appendChild(style);
}

filteredClients = function filteredClients() {
  return state.clients.filter((client) => {
    const status = normalizeStatus(client.status);
    const situacio = normalizeSituacio(client.situacio, client.status);
    if (situacio === "no_interessat" && !state.filters.showNoInteressats) return false;
    const haystack = [client.name, client.phone, client.email, client.interest, client.assignedUnit, client.notes].join(" ").toLowerCase();
    const searchOk = !state.filters.search || haystack.includes(state.filters.search.toLowerCase());
    const interestOk = !state.filters.interest || normalizeInterest(client.interest) === state.filters.interest;
    const statusOk = !state.filters.nextStep || status === normalizeStatus(state.filters.nextStep);
    return searchOk && interestOk && statusOk;
  });
};

renderStats = function renderStats() {
  const visible = filteredClients();
  els.stats.innerHTML = MAIN_STATUSES.map((status) => {
    const value = visible.filter((client) => normalizeStatus(client.status) === status.value).length;
    return `<div class="stat"><strong>${value}</strong><span>${escapeHtml(status.label)}</span></div>`;
  }).join("");
};

renderCard = function renderCard(client) {
  const contact = [client.phone, client.email].filter(Boolean).join(" - ");
  const assigned = client.assignedUnit ? `<span class="pill warn">${escapeHtml(client.assignedUnit)}</span>` : "";
  const situacio = normalizeSituacio(client.situacio, client.status);
  const showSituacio = normalizeStatus(client.status) === "pendent" && situacio !== "pendent_de_contactar";
  const situacioClass = situacio === "no_interessat" ? "pill situacio-pill alert" : "pill situacio-pill";
  const situacioPill = showSituacio ? `<span class="${situacioClass}">${escapeHtml(labelForSituacio(situacio))}</span>` : "";
  return `<button class="card" type="button" data-id="${escapeHtml(client.id)}"><span class="card-title"><span>${escapeHtml(client.name)}</span><span>${escapeHtml(client.priority)}</span></span><span class="card-meta">${escapeHtml(contact || "Sense contacte")}</span><span class="card-meta">${escapeHtml(client.interest)}</span><span class="pill-row">${situacioPill}${assigned}</span></button>`;
};

renderBoard = function renderBoard() {
  const clients = filteredClients();
  els.board.innerHTML = MAIN_STATUSES.map((status) => {
    const columnClients = clients.filter((client) => normalizeStatus(client.status) === status.value);
    const cards = columnClients.length ? columnClients.map(renderCard).join("") : `<div class="empty">Cap client</div>`;
    return `<section class="column" data-status="${escapeHtml(status.value)}"><div class="column-header"><h3>${escapeHtml(status.label)}</h3><span class="count">${columnClients.length}</span></div>${cards}</section>`;
  }).join("");
  document.querySelectorAll(".card").forEach((card) => card.addEventListener("click", () => openClient(card.dataset.id)));
};

function ensureAssignedUnitsUi() {
  if (document.querySelector("#assignedUnitsList")) {
    els.assignedUnitsList = document.querySelector("#assignedUnitsList");
    return;
  }
  const input = els.assignedUnit;
  const label = input?.closest("label");
  if (!input || !label) return;
  const labelText = label.querySelector("span");
  if (labelText) labelText.textContent = "Afegir placa/traster";
  input.placeholder = "Escriu una unitat disponible per afegir-la";
  const list = document.createElement("div");
  list.id = "assignedUnitsList";
  list.className = "assigned-units-list";
  label.appendChild(list);
  els.assignedUnitsList = list;
}

function renderAssignedUnits(clientId) {
  ensureAssignedUnitsUi();
  if (!els.assignedUnitsList) return;
  const client = state.clients.find((item) => String(item.id) === String(clientId));
  const assignedUnits = client?.assignedUnits || [];
  if (!assignedUnits.length) {
    els.assignedUnitsList.innerHTML = `<div class="empty">Cap unitat assignada</div>`;
    return;
  }
  els.assignedUnitsList.innerHTML = assignedUnits.map((unitat) => `<div class="assigned-unit-row"><span>${escapeHtml(unitat.label)}<small>${escapeHtml(labelForStatus(unitat.estat || client.status))}</small></span><button type="button" data-cancel-assignacio="${escapeHtml(unitat.assignacioId)}">Treure</button></div>`).join("");
  els.assignedUnitsList.querySelectorAll("[data-cancel-assignacio]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Vols treure aquesta unitat del client?")) return;
      try {
        await cancelAssignacio(button.dataset.cancelAssignacio);
        await refreshFromSupabase();
        renderAssignedUnits(clientId);
      } catch (error) {
        setConnectionStatus("Error de conexion", "error");
        showMessage(`No s'ha pogut desassignar la unitat: ${error.message}`);
      }
    });
  });
}

async function updateActiveAssignmentsForClientStatus(clientId, status) {
  const active = state.assignacions.filter((item) => String(item.client_id) === String(clientId) && !String(item.estat || "").toLowerCase().includes("cancel"));
  for (const assignacio of active) {
    const unitatStatus = normalizeStatus(status) === "contracte_signat" ? "llogada" : "reservada";
    const { error: assignError } = await supabaseClient.from("assignacions").update({ estat: normalizeStatus(status), reserva_pagada: normalizeStatus(status) === "reserva_feta" || normalizeStatus(status) === "contracte_signat", contracte_generat: normalizeStatus(status) === "contracte_signat", contracte_signat: normalizeStatus(status) === "contracte_signat", updated_at: new Date().toISOString() }).eq("id", assignacio.id);
    if (assignError) throw assignError;
    if (assignacio.unitat_id) {
      const { error: unitError } = await supabaseClient.from("unitats").update({ estat: unitatStatus, updated_at: new Date().toISOString() }).eq("id", assignacio.unitat_id);
      if (unitError) throw unitError;
    }
  }
}

openClient = function openClient(id) {
  const client = state.clients.find((item) => String(item.id) === String(id));
  if (!client) return;
  ensureSimplifiedUi();
  state.selectedId = client.id;
  els.dialogTitle.textContent = client.name;
  els.clientName.value = client.name;
  els.clientPhone.value = client.phone;
  els.clientEmail.value = client.email;
  els.clientInterest.value = client.interest;
  els.clientStatus.value = normalizeStatus(client.status);
  els.clientSituacio.value = normalizeSituacio(client.situacio, client.status);
  els.clientPriority.value = client.priority;
  els.assignedUnit.value = "";
  els.lastContact.value = client.lastContact;
  els.nextStep.value = client.nextStep;
  els.notes.value = client.notes;
  renderAssignedUnits(client.id);
  els.dialog.showModal();
};

saveSelectedClient = async function saveSelectedClient() {
  const client = state.clients.find((item) => String(item.id) === String(state.selectedId));
  if (!client) return;
  const unitatToAdd = els.assignedUnit.value.trim();
  const draft = { ...client, name: els.clientName.value.trim() || "Sense nom", phone: els.clientPhone.value.trim(), email: els.clientEmail.value.trim(), interest: els.clientInterest.value, status: normalizeStatus(els.clientStatus.value), situacio: normalizeSituacio(els.clientSituacio?.value, els.clientStatus.value), priority: els.clientPriority.value, lastContact: els.lastContact.value, nextStep: els.nextStep.value, notes: els.notes.value.trim() };
  try {
    const updated = await updateClient(draft);
    updated.status = draft.status;
    updated.situacio = draft.situacio;
    updated.lastContact = draft.lastContact;
    updated.nextStep = draft.nextStep;
    state.clients = state.clients.map((item) => (String(item.id) === String(updated.id) ? updated : item));
    if (unitatToAdd) {
      const unitat = findUnitatByLabel(unitatToAdd);
      if (!unitat) throw new Error("No he trobat aquesta unitat disponible.");
      await saveAssignacio(updated, unitat);
      els.assignedUnit.value = "";
    }
    await updateActiveAssignmentsForClientStatus(updated.id, updated.status);
    await refreshFromSupabase();
    els.dialog.close();
  } catch (error) {
    setConnectionStatus("Error de conexion", "error");
    showMessage(`No s'ha pogut guardar el client: ${error.message}`);
  }
};

exportClients = function exportClients() {
  if (!window.XLSX) return alert("La llibreria d'Excel encara s'esta carregant. Torna-ho a provar en uns segons.");
  const rows = state.clients.map((client) => ({ Nom: client.name, Telefon: client.phone, Email: client.email, Interes: client.interest, Estat: labelForStatus(client.status), Situacio: labelForSituacio(client.situacio), Prioritat: client.priority, "Placa o traster assignat": client.assignedUnit, "Ultim contacte": client.lastContact, "Proper pas": client.nextStep, Comentaris: client.notes }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Clients");
  XLSX.writeFile(workbook, "crm-aparcament-rector-clients.xlsx");
};

async function detectSituacioColumn() {
  if (!supabaseClient) return false;
  const { error } = await supabaseClient.from("clients").select("id,situacio").limit(1);
  crmSituacioColumnReady = !error;
  if (error && !crmSituacioWarningShown) {
    crmSituacioWarningShown = true;
    showMessage("Falta la columna situacio a Supabase. Cal crear-la per guardar la situacio del client.", "warning");
  }
  return crmSituacioColumnReady;
}

async function migrateClientStatesToSimplifiedModel() {
  if (!crmSituacioColumnReady || !supabaseClient) return;
  const clientsToUpdate = state.clients.filter((client) => {
    const normalized = normalizeClientState(client._dbStatus || client.status, client._dbSituacio || client.situacio);
    return client._dbStatus !== normalized.estat || client._dbSituacio !== normalized.situacio;
  });
  for (const client of clientsToUpdate) {
    const normalized = normalizeClientState(client._dbStatus || client.status, client._dbSituacio || client.situacio);
    const { error } = await supabaseClient.from("clients").update({ estat: normalized.estat, situacio: normalized.situacio, updated_at: new Date().toISOString() }).eq("id", client.id);
    if (error) throw error;
  }
  if (clientsToUpdate.length) await refreshFromSupabase();
}

function enableUnitatsExport() {
  if (document.querySelector("#exportUnitats")?.dataset.ready === "true") return;
  const button = document.querySelector("#exportUnitats");
  if (!button) return;
  button.dataset.ready = "true";
  button.addEventListener("click", async () => {
    if (!window.XLSX) return alert("La llibreria d'Excel encara s'esta carregant. Torna-ho a provar en uns segons.");
    try {
      setConnectionStatus("Preparant exportacio...", "busy");
      await refreshFromSupabase();
      const activeAssignacions = state.assignacions.filter((assignacio) => !String(assignacio.estat || "").toLowerCase().includes("cancel"));
      const rows = state.unitats.map((unitat) => {
        const unitAssignacions = activeAssignacions.filter((assignacio) => String(assignacio.unitat_id) === String(unitat.id));
        const clientNames = unitAssignacions.map((assignacio) => state.clients.find((client) => String(client.id) === String(assignacio.client_id))?.name).filter(Boolean);
        return { "Tipus unitat": unitat.tipusUnitat || "", Numero: unitat.numero || unitat.label || "", Planta: unitat.planta || "", Tipus: unitat.tipus || "", m2: unitat.m2 ?? "", Preu: unitat.preu ?? "", Estat: unitat.estat || "", "Client assignat": clientNames.join(" / "), "Estat assignacio": unitAssignacions.map((assignacio) => labelForStatus(assignacio.estat)).filter(Boolean).join(" / "), Observacions: unitat.observacions || "" };
      });
      const sheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Unitats");
      XLSX.writeFile(workbook, "crm-aparcament-rector-unitats.xlsx");
      setConnectionStatus("Conectado a Supabase", "ok");
    } catch (error) {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'han pogut exportar les unitats: ${error.message}`, "error");
    }
  });
}

function enableSharedRefreshFallback() {
  if (window.__crmSharedSyncEnabled) return;
  window.__crmSharedSyncEnabled = true;
  let syncing = false;
  let lastSyncAt = 0;
  async function sync(reason = "auto") {
    if (syncing || !state.supabaseReady || !supabaseClient) return;
    if (els.dialog?.open && reason === "interval") return;
    syncing = true;
    try { await refreshFromSupabase(); lastSyncAt = Date.now(); }
    catch (error) { setConnectionStatus("Error de conexion", "error"); showMessage(`No s'han pogut sincronitzar les dades: ${error.message}`); }
    finally { syncing = false; }
  }
  function schedule(reason) { if (Date.now() - lastSyncAt < 2500) return; setTimeout(() => sync(reason), 100); }
  window.addEventListener("focus", () => schedule("focus"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) schedule("visible"); });
  setInterval(() => sync("interval"), 10000);
}

function enableLocalClientsWarning() {
  const legacyKey = "crm-aparcament-rector-v1";
  let autoUploading = false;
  function normalizeLocal(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
  function getLocalClients() { try { const data = JSON.parse(localStorage.getItem(legacyKey) || "{}"); return Array.isArray(data.clients) ? data.clients.filter((client) => client && (client.name || client.phone || client.email)) : []; } catch { return []; } }
  function isAlreadyOnline(client) { const key = `${normalizeLocal(client.name)}-${normalizeLocal(client.phone)}`; return state.clients.some((item) => `${normalizeLocal(item.name)}-${normalizeLocal(item.phone)}` === key); }
  function removeNotice() { document.querySelector("#localSyncNotice")?.remove(); document.querySelector("#migrateLegacy")?.remove(); }
  async function uploadPendingClients(pending) {
    if (autoUploading || !pending.length || !state.supabaseReady || !supabaseClient) return;
    autoUploading = true;
    try {
      for (const client of pending) {
        if (isAlreadyOnline(client)) continue;
        const saved = await saveClient(makeClient({ name: client.name, phone: client.phone, email: client.email, interest: client.interest, status: client.status, priority: client.priority, notes: client.notes, createdAt: client.createdAt }));
        state.clients.push(saved);
      }
      await refreshFromSupabase();
      removeNotice();
    } catch (error) {
      showMessage(`No s'han pogut pujar automaticament els clients locals: ${error.message}`, "error");
    } finally { autoUploading = false; }
  }
  function check() { const pending = getLocalClients().filter((client) => !isAlreadyOnline(client)); if (!pending.length) return removeNotice(); if (state.supabaseReady && supabaseClient) uploadPendingClients(pending); }
  setTimeout(check, 2500);
  setInterval(check, 30000);
}

setTimeout(() => {
  document.querySelector("#migrateLegacy")?.remove();
  setupSimplifiedModel();
  ensureStyles();
  ensureSimplifiedUi();
  enableUnitatsExport();
  enableSharedRefreshFallback();
  enableLocalClientsWarning();
  els.saveClient?.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); saveSelectedClient(); }, true);
  els.exportClients?.addEventListener("click", (event) => { event.preventDefault(); event.stopImmediatePropagation(); exportClients(); }, true);
  detectSituacioColumn().then(() => refreshFromSupabase()).then(() => migrateClientStatesToSimplifiedModel()).catch((error) => showMessage(`No s'ha pogut revisar la migracio d'estats: ${error.message}`, "warning"));
}, 0);
