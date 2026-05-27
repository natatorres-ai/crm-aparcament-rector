function crmReversibleSituacioFix() {
  function normalizedStatus(value) {
    return typeof normalizeStatus === "function" ? normalizeStatus(value) : String(value || "pendent");
  }

  function normalizedSituacio(value, fallbackStatus = "") {
    return typeof normalizeSituacio === "function"
      ? normalizeSituacio(value, fallbackStatus)
      : String(value || "pendent_de_contactar");
  }

  function situacioColumnIsReady() {
    try {
      return typeof crmSituacioColumnReady !== "undefined" && crmSituacioColumnReady;
    } catch {
      return false;
    }
  }

  function cleanSituacioForStatus(status, situacio) {
    const statusValue = normalizedStatus(status);
    const situacioValue = normalizedSituacio(situacio, statusValue);
    if (statusValue !== "pendent" && situacioValue === "no_interessat") return "pendent_de_contactar";
    return situacioValue;
  }

  function legacyStatusForSituacio(status, situacio) {
    const statusValue = normalizedStatus(status);
    if (statusValue !== "pendent") return statusValue;
    const situacioValue = normalizedSituacio(situacio, statusValue);
    const map = {
      pendent_de_contactar: "pendent de contactar",
      contactat: "contactat",
      no_contesta: "no ha contestat",
      no_interessat: "no interessat",
    };
    return map[situacioValue] || "pendent";
  }

  function isActiveAssignacioLocal(assignacio) {
    const value = String(assignacio?.estat || "").toLowerCase();
    return !!assignacio && !value.includes("cancel");
  }

  function unitLabel(unitat) {
    if (!unitat) return "";
    return unitat.label || unitat.numero || unitat.detail || "";
  }

  function sortUnits(a, b) {
    const numberA = Number(String(a.label || "").match(/\d+/)?.[0] || 0);
    const numberB = Number(String(b.label || "").match(/\d+/)?.[0] || 0);
    if (numberA && numberB && numberA !== numberB) return numberA - numberB;
    return String(a.label || "").localeCompare(String(b.label || ""));
  }

  function assignedTextForCard(client) {
    const units = client?.assignedUnits || [];
    if (!units.length) return client?.assignedUnit || "";
    if (units.length === 1) return units[0].label;
    const preview = units.slice(0, 4).map((unitat) => unitat.label).join(", ");
    return `${units.length} unitats: ${preview}${units.length > 4 ? "..." : ""}`;
  }

  function enrichAllAssignedUnits() {
    if (!state?.clients || !state?.assignacions || !state?.unitats) return;
    state.clients.forEach((client) => {
      const assignacions = state.assignacions.filter(
        (assignacio) => String(assignacio.client_id) === String(client.id) && isActiveAssignacioLocal(assignacio)
      );
      const assignedUnits = assignacions
        .map((assignacio) => {
          const unitat = state.unitats.find((item) => String(item.id) === String(assignacio.unitat_id));
          if (!unitat) return null;
          return {
            assignacioId: assignacio.id,
            unitatId: unitat.id,
            label: unitLabel(unitat),
            detail: unitat.detail || [unitat.numero, unitat.planta ? `planta ${unitat.planta}` : "", unitat.tipus]
              .filter(Boolean)
              .join(" - "),
            estat: assignacio.estat || unitat.estat || client.status,
          };
        })
        .filter(Boolean)
        .sort(sortUnits);
      client.assignedUnits = assignedUnits;
      client.assignedUnit = assignedUnits.map((unitat) => unitat.label).join(", ");
    });
  }

  async function updateActiveAssignmentsStatus(clientId, status) {
    if (!window.supabaseClient && typeof supabaseClient === "undefined") return;
    if (!state?.assignacions) return;
    const active = state.assignacions.filter(
      (assignacio) => String(assignacio.client_id) === String(clientId) && isActiveAssignacioLocal(assignacio)
    );
    const unitatStatus = normalizedStatus(status) === "contracte_signat" ? "llogada" : "reservada";
    for (const assignacio of active) {
      const { error: assignError } = await supabaseClient
        .from("assignacions")
        .update({
          estat: normalizedStatus(status),
          reserva_pagada: normalizedStatus(status) === "reserva_feta" || normalizedStatus(status) === "contracte_signat",
          contracte_generat: normalizedStatus(status) === "contracte_signat",
          contracte_signat: normalizedStatus(status) === "contracte_signat",
          updated_at: new Date().toISOString(),
        })
        .eq("id", assignacio.id);
      if (assignError) throw assignError;
      if (assignacio.unitat_id) {
        const { error: unitError } = await supabaseClient
          .from("unitats")
          .update({ estat: unitatStatus, updated_at: new Date().toISOString() })
          .eq("id", assignacio.unitat_id);
        if (unitError) throw unitError;
      }
    }
  }

  if (typeof mapClientToDb === "function") {
    mapClientToDb = function mapClientToDb(client) {
      const status = normalizedStatus(client.status);
      const situacio = cleanSituacioForStatus(status, client.situacio);
      const payload = {
        nom: client.name,
        telefon: client.phone,
        email: client.email,
        tipus_interes: client.interest,
        estat: situacioColumnIsReady() ? status : legacyStatusForSituacio(status, situacio),
        prioritat: typeof priorityToDb === "function" ? priorityToDb(client.priority) : client.priority,
        comentaris: client.notes,
        data_alta: client.createdAt || todayIso(),
        updated_at: new Date().toISOString(),
      };
      if (situacioColumnIsReady()) payload.situacio = situacio;
      return payload;
    };
  }

  enrichAssignedUnits = function enrichAssignedUnits() {
    enrichAllAssignedUnits();
  };

  if (typeof filteredClients === "function") {
    filteredClients = function filteredClients() {
      return state.clients.filter((client) => {
        const status = normalizedStatus(client.status);
        const situacio = normalizedSituacio(client.situacio, client.status);
        if (status === "pendent" && situacio === "no_interessat" && !state.filters.showNoInteressats) return false;
        const haystack = [
          client.name,
          client.phone,
          client.email,
          client.interest,
          client.assignedUnit,
          (client.assignedUnits || []).map((unitat) => unitat.label).join(" "),
          client.notes,
        ]
          .join(" ")
          .toLowerCase();
        const searchOk = !state.filters.search || haystack.includes(state.filters.search.toLowerCase());
        const interestOk = !state.filters.interest || normalizeInterest(client.interest) === state.filters.interest;
        const statusOk = !state.filters.nextStep || status === normalizedStatus(state.filters.nextStep);
        return searchOk && interestOk && statusOk;
      });
    };
  }

  if (typeof renderCard === "function") {
    renderCard = function renderCard(client) {
      const contact = [client.phone, client.email].filter(Boolean).join(" - ");
      const assignedText = assignedTextForCard(client);
      const assigned = assignedText ? `<span class="pill warn">${escapeHtml(assignedText)}</span>` : "";
      const situacio = normalizedSituacio(client.situacio, client.status);
      const showSituacio = normalizedStatus(client.status) === "pendent" && situacio !== "pendent_de_contactar";
      const situacioClass = situacio === "no_interessat" ? "pill situacio-pill alert" : "pill situacio-pill";
      const situacioPill = showSituacio ? `<span class="${situacioClass}">${escapeHtml(labelForSituacio(situacio))}</span>` : "";
      return `
        <button class="card" type="button" data-id="${escapeHtml(client.id)}">
          <span class="card-title"><span>${escapeHtml(client.name)}</span></span>
          <span class="card-meta">${escapeHtml(contact || "Sense contacte")}</span>
          <span class="card-meta">${escapeHtml(client.interest)}</span>
          <span class="pill-row">${situacioPill}${assigned}</span>
        </button>
      `;
    };
  }

  function renderAssignedUnitsList(clientId) {
    const input = els?.assignedUnit;
    const label = input?.closest("label");
    if (!input || !label) return;
    let list = document.querySelector("#assignedUnitsList");
    if (!list) {
      list = document.createElement("div");
      list.id = "assignedUnitsList";
      list.className = "assigned-units-list";
      label.appendChild(list);
    }
    els.assignedUnitsList = list;
    const client = state.clients.find((item) => String(item.id) === String(clientId));
    const units = client?.assignedUnits || [];
    list.innerHTML = units.length
      ? units
          .map(
            (unitat) => `
              <div class="assigned-unit-row">
                <span>${escapeHtml(unitat.label)}<small>${escapeHtml(unitat.estat || "assignada")}</small></span>
                <button type="button" data-cancel-assignacio="${escapeHtml(unitat.assignacioId)}">Treure</button>
              </div>
            `
          )
          .join("")
      : `<div class="empty">Cap unitat assignada</div>`;
    list.querySelectorAll("[data-cancel-assignacio]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("Vols treure aquesta unitat del client?")) return;
        try {
          await cancelAssignacio(button.dataset.cancelAssignacio);
          await refreshFromSupabase();
          enrichAllAssignedUnits();
          renderAssignedUnitsList(clientId);
          render();
        } catch (error) {
          setConnectionStatus("Error de conexion", "error");
          showMessage(`No s'ha pogut desassignar la unitat: ${error.message}`);
        }
      });
    });
  }

  if (typeof openClient === "function") {
    const previousOpenClient = openClient;
    openClient = function openClient(id) {
      enrichAllAssignedUnits();
      previousOpenClient(id);
      if (!els?.clientStatus || !els?.clientSituacio) return;
      els.clientStatus.onchange = () => {
        if (normalizedStatus(els.clientStatus.value) !== "pendent" && els.clientSituacio.value === "no_interessat") {
          els.clientSituacio.value = "pendent_de_contactar";
        }
      };
      renderAssignedUnitsList(id);
    };
  }

  async function reliableSaveSelectedClient() {
    const client = state.clients.find((item) => String(item.id) === String(state.selectedId));
    if (!client) return;
    const status = normalizedStatus(els.clientStatus.value);
    const situacio = cleanSituacioForStatus(status, els.clientSituacio?.value);
    if (els.clientSituacio) els.clientSituacio.value = situacio;
    const unitatToAdd = els.assignedUnit?.value.trim() || "";
    const draft = {
      ...client,
      name: els.clientName.value.trim() || "Sense nom",
      phone: els.clientPhone.value.trim(),
      email: els.clientEmail.value.trim(),
      interest: els.clientInterest.value,
      status,
      situacio,
      priority: els.clientPriority?.value || client.priority,
      lastContact: els.lastContact?.value || "",
      nextStep: els.nextStep?.value || "",
      notes: els.notes.value.trim(),
    };
    try {
      setConnectionStatus("Guardando...", "busy");
      const updated = await updateClient(draft);
      Object.assign(updated, {
        status: draft.status,
        situacio: draft.situacio,
        lastContact: draft.lastContact,
        nextStep: draft.nextStep,
      });
      state.clients = state.clients.map((item) => (String(item.id) === String(updated.id) ? updated : item));
      if (unitatToAdd) {
        const unitat = findUnitatByLabel(unitatToAdd);
        if (!unitat) throw new Error("No he trobat aquesta unitat disponible.");
        await saveAssignacio(updated, unitat);
        els.assignedUnit.value = "";
      }
      await updateActiveAssignmentsStatus(updated.id, updated.status);
      await refreshFromSupabase();
      enrichAllAssignedUnits();
      render();
      els.dialog.close();
      setConnectionStatus("Guardado", "ok");
    } catch (error) {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'ha pogut guardar el client: ${error.message}`);
    }
  }

  saveSelectedClient = reliableSaveSelectedClient;

  if (!window.__crmReliableSaveInstalled) {
    window.__crmReliableSaveInstalled = true;
    document.addEventListener(
      "click",
      (event) => {
        if (!event.target?.closest?.("#saveClient")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        reliableSaveSelectedClient();
      },
      true
    );
  }

  enrichAllAssignedUnits();
  if (typeof render === "function") render();
}

setTimeout(crmReversibleSituacioFix, 50);
