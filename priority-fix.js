function priorityFromDb(value) {
  const number = Number(value);
  if (number >= 2) return "Alta";
  if (number <= 0) return "Baixa";
  return "Normal";
}

function priorityToDb(value) {
  const key = normalizeKey(value);
  if (key === "alta") return 2;
  if (key === "baixa") return 0;
  return 1;
}

mapClientFromDb = function mapClientFromDb(row) {
  return makeClient({
    id: row.id,
    name: row.nom,
    phone: row.telefon,
    email: row.email,
    interest: row.tipus_interes,
    status: row.estat,
    priority: priorityFromDb(row.prioritat),
    notes: row.comentaris,
    createdAt: row.data_alta || row.created_at,
  });
};

mapClientToDb = function mapClientToDb(client) {
  return {
    nom: client.name,
    telefon: client.phone,
    email: client.email,
    tipus_interes: client.interest,
    estat: client.status,
    prioritat: priorityToDb(client.priority),
    comentaris: client.notes,
    data_alta: client.createdAt || todayIso(),
    updated_at: new Date().toISOString(),
  };
};

function fixStatusFilter() {
  if (!els.nextStepFilter) return;
  const label = els.nextStepFilter.closest("label");
  const labelText = label?.querySelector("span");
  if (labelText) labelText.textContent = "Estat";
  els.nextStepFilter.innerHTML = [
    '<option value="">Tots</option>',
    ...statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`),
  ].join("");
}

filteredClients = function filteredClients() {
  return state.clients.filter((client) => {
    const haystack = [client.name, client.phone, client.email, client.interest, client.assignedUnit, client.notes]
      .join(" ")
      .toLowerCase();
    const searchOk = !state.filters.search || haystack.includes(state.filters.search.toLowerCase());
    const interestOk = !state.filters.interest || normalizeInterest(client.interest) === state.filters.interest;
    const statusOk = !state.filters.nextStep || normalizeKey(client.status) === normalizeKey(state.filters.nextStep);
    return searchOk && interestOk && statusOk;
  });
};

fixStatusFilter();

function enableSharedSupabaseSync() {
  if (window.__crmSharedSyncEnabled) return;
  window.__crmSharedSyncEnabled = true;

  let syncing = false;
  let lastSyncAt = 0;

  async function syncFromSupabase(reason = "auto") {
    if (syncing || !state.supabaseReady || !supabaseClient) return;
    if (els.dialog?.open && reason === "interval") return;
    syncing = true;
    try {
      await refreshFromSupabase();
      lastSyncAt = Date.now();
    } catch (error) {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'han pogut sincronitzar les dades: ${error.message}`);
    } finally {
      syncing = false;
    }
  }

  function scheduleSync(reason) {
    const now = Date.now();
    if (now - lastSyncAt < 2500) return;
    setTimeout(() => syncFromSupabase(reason), 100);
  }

  window.addEventListener("focus", () => scheduleSync("focus"));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleSync("visible");
  });
  setInterval(() => syncFromSupabase("interval"), 15000);

  if (supabaseClient?.channel) {
    try {
      supabaseClient
        .channel("crm-aparcament-rector-sync")
        .on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => scheduleSync("clients"))
        .on("postgres_changes", { event: "*", schema: "public", table: "unitats" }, () => scheduleSync("unitats"))
        .on("postgres_changes", { event: "*", schema: "public", table: "assignacions" }, () => scheduleSync("assignacions"))
        .subscribe();
    } catch {
      // The interval and focus refresh still keep devices in sync if realtime is unavailable.
    }
  }
}

function enableMultipleUnitAssignments() {
  const isActive = (assignacio) => assignacio && !normalizeKey(assignacio.estat).includes("cancel");
  const unitStatusForClientStatus = (status) => {
    const key = normalizeKey(status);
    if (key.includes("contract")) return "llogada";
    if (key.includes("cancel")) return "disponible";
    return "reservada";
  };

  if (!document.querySelector("#multiAssignStyles")) {
    const style = document.createElement("style");
    style.id = "multiAssignStyles";
    style.textContent = ".assigned-units-list{display:grid;gap:8px;margin-top:8px}.assigned-unit-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid var(--line);border-radius:6px;background:#f8faf7}.assigned-unit-row span{font-size:13px;font-weight:750;color:var(--ink)}.assigned-unit-row small{display:block;color:var(--muted);font-size:12px;font-weight:650}.assigned-unit-row button{min-height:30px;padding:5px 8px;font-size:12px;border-color:#a33b32;color:#a33b32}";
    document.head.appendChild(style);
  }

  function ensureAssignedUnitsUi() {
    if (document.querySelector("#assignedUnitsList")) return;
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

  enrichAssignedUnits = function enrichAssignedUnits() {
    state.clients.forEach((client) => {
      const assignedUnits = state.assignacions
        .filter((assignacio) => String(assignacio.client_id) === String(client.id) && isActive(assignacio))
        .map((assignacio) => {
          const unitat = state.unitats.find((item) => String(item.id) === String(assignacio.unitat_id));
          if (!unitat) return null;
          return {
            assignacioId: assignacio.id,
            unitatId: unitat.id,
            label: unitat.label,
            detail: unitat.detail,
            estat: assignacio.estat || unitat.estat || "",
          };
        })
        .filter(Boolean);
      client.assignedUnits = assignedUnits;
      client.assignedUnit = assignedUnits.map((unitat) => unitat.label).join(", ");
    });
  };

  async function updateStatus(unitatId, estat) {
    const { error } = await supabaseClient
      .from("unitats")
      .update({ estat, updated_at: new Date().toISOString() })
      .eq("id", unitatId);
    if (error) throw error;
  }

  async function reserveIfAvailable(unitatId, estat) {
    const { data, error } = await supabaseClient
      .from("unitats")
      .update({ estat, updated_at: new Date().toISOString() })
      .eq("id", unitatId)
      .eq("estat", "disponible")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Aquesta placa ja no esta disponible. Actualitza la llista d'unitats.");
  }

  async function refreshAll() {
    await loadUnitats();
    await loadAssignacions();
    enrichAssignedUnits();
    cacheData();
    render();
  }

  async function releaseIfUnused(unitatId, excludedAssignacioId = null) {
    const { data, error } = await supabaseClient.from("assignacions").select("*").eq("unitat_id", unitatId);
    if (error) throw error;
    const hasActive = (data || []).some(
      (assignacio) => isActive(assignacio) && String(assignacio.id) !== String(excludedAssignacioId || "")
    );
    if (!hasActive) await updateStatus(unitatId, "disponible");
  }

  cancelAssignacio = async function cancelAssignacio(assignacioId) {
    const assignacio = state.assignacions.find((item) => String(item.id) === String(assignacioId));
    const { data, error } = await supabaseClient
      .from("assignacions")
      .update({ estat: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", assignacioId)
      .select()
      .single();
    if (error) throw error;
    state.assignacions = state.assignacions.map((item) => (String(item.id) === String(assignacioId) ? data : item));
    if (assignacio?.unitat_id) await releaseIfUnused(assignacio.unitat_id, assignacioId);
    await refreshAll();
  };

  assignUnitatToClient = async function assignUnitatToClient(clientId, unitatId, clientStatus) {
    const unitatStatus = unitStatusForClientStatus(clientStatus);
    const existing = state.assignacions.find(
      (item) =>
        String(item.client_id) === String(clientId) &&
        String(item.unitat_id) === String(unitatId) &&
        isActive(item)
    );
    if (!existing) await reserveIfAvailable(unitatId, unitatStatus);
    else await updateStatus(unitatId, unitatStatus);

    const payload = {
      client_id: clientId,
      unitat_id: unitatId,
      estat: clientStatus,
      data_assignacio: todayIso(),
      reserva_pagada: unitatStatus === "reservada" || unitatStatus === "llogada",
      contracte_generat: unitatStatus === "llogada",
      contracte_signat: unitatStatus === "llogada",
      updated_at: new Date().toISOString(),
    };
    try {
      if (existing) {
        const { error } = await supabaseClient.from("assignacions").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        payload.created_at = new Date().toISOString();
        const { error } = await supabaseClient.from("assignacions").insert(payload);
        if (error) throw error;
      }
      await refreshAll();
      showMessage("Placa assignada correctament", "ok");
    } catch (error) {
      if (!existing) await releaseIfUnused(unitatId);
      throw error;
    }
  };

  saveAssignacio = async function saveAssignacio(client, unitat) {
    if (!client?.id || !unitat?.id) return null;
    return assignUnitatToClient(client.id, unitat.id, client.status);
  };

  async function updateClientAssignmentsStatus(clientId, status) {
    const active = state.assignacions.filter((item) => String(item.client_id) === String(clientId) && isActive(item));
    for (const assignacio of active) {
      const unitatStatus = unitStatusForClientStatus(status);
      const { error } = await supabaseClient
        .from("assignacions")
        .update({
          estat: status,
          reserva_pagada: unitatStatus === "reservada" || unitatStatus === "llogada",
          contracte_generat: unitatStatus === "llogada",
          contracte_signat: unitatStatus === "llogada",
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignacio.id);
      if (error) throw error;
      await updateStatus(assignacio.unitat_id, unitatStatus);
    }
  }

  function renderAssignedUnitsForClient(clientId) {
    ensureAssignedUnitsUi();
    const target = els.assignedUnitsList;
    if (!target) return;
    const client = state.clients.find((item) => String(item.id) === String(clientId));
    const assignedUnits = client?.assignedUnits || [];
    target.innerHTML = assignedUnits.length
      ? assignedUnits
          .map(
            (unitat) =>
              `<div class="assigned-unit-row"><span>${escapeHtml(unitat.label)}<small>${escapeHtml(
                unitat.estat || "assignada"
              )}</small></span><button type="button" data-cancel-assignacio="${escapeHtml(
                unitat.assignacioId
              )}">Treure</button></div>`
          )
          .join("")
      : `<div class="empty">Cap unitat assignada</div>`;
    target.querySelectorAll("[data-cancel-assignacio]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Vols treure aquesta unitat del client?")) return;
        try {
          await cancelAssignacio(button.dataset.cancelAssignacio);
          renderAssignedUnitsForClient(clientId);
          showMessage("Unitat desassignada correctament", "ok");
        } catch (error) {
          setConnectionStatus("Error de conexion", "error");
          showMessage(`No s'ha pogut desassignar la unitat: ${error.message}`);
        }
      });
    });
  }

  openClient = function openClient(id) {
    const client = state.clients.find((item) => String(item.id) === String(id));
    if (!client) return;
    ensureAssignedUnitsUi();
    state.selectedId = client.id;
    els.dialogTitle.textContent = client.name;
    els.clientName.value = client.name;
    els.clientPhone.value = client.phone;
    els.clientEmail.value = client.email;
    els.clientInterest.value = client.interest;
    els.clientStatus.value = client.status;
    els.clientPriority.value = client.priority;
    els.assignedUnit.value = "";
    els.lastContact.value = client.lastContact;
    els.nextStep.value = client.nextStep;
    els.notes.value = client.notes;
    renderAssignedUnitsForClient(client.id);
    els.dialog.showModal();
  };

  saveSelectedClient = async function saveSelectedClient() {
    const client = state.clients.find((item) => String(item.id) === String(state.selectedId));
    if (!client) return;
    const unitatToAdd = els.assignedUnit.value.trim();
    const draft = {
      ...client,
      name: els.clientName.value.trim() || "Sense nom",
      phone: els.clientPhone.value.trim(),
      email: els.clientEmail.value.trim(),
      interest: els.clientInterest.value,
      status: els.clientStatus.value,
      priority: els.clientPriority.value,
      lastContact: els.lastContact.value,
      nextStep: els.nextStep.value,
      notes: els.notes.value.trim(),
    };
    try {
      const updated = await updateClient(draft);
      updated.lastContact = draft.lastContact;
      updated.nextStep = draft.nextStep;
      state.clients = state.clients.map((item) => (String(item.id) === String(updated.id) ? updated : item));
      if (unitatToAdd) {
        const unitat = findUnitatByLabel(unitatToAdd);
        if (!unitat) throw new Error("No he trobat aquesta unitat disponible.");
        await saveAssignacio(updated, unitat);
        els.assignedUnit.value = "";
      }
      await updateClientAssignmentsStatus(updated.id, updated.status);
      await refreshAll();
      els.dialog.close();
    } catch (error) {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'ha pogut guardar el client: ${error.message}`);
    }
  };

  renderUnitList = function renderUnitList() {
    els.unitList.innerHTML = state.unitats
      .filter((unitat) => normalizeKey(unitat.estat) === "disponible")
      .map((unitat) => `<option value="${escapeHtml(unitat.label)}">${escapeHtml(unitat.detail)}</option>`)
      .join("");
    if (typeof renderUnitatsPanel === "function") renderUnitatsPanel();
  };

  ensureAssignedUnitsUi();
  els.saveClient?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      saveSelectedClient();
    },
    true
  );
}

if (typeof refreshFromSupabase === "function") {
  setTimeout(() => {
    enableSharedSupabaseSync();
    enableMultipleUnitAssignments();
    refreshFromSupabase().catch((error) => {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'ha pogut recarregar Supabase: ${error.message}`);
    });
  }, 0);
}
