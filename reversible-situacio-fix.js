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
    if (statusValue !== "pendent" && situacioValue === "no_interessat") {
      return "pendent_de_contactar";
    }
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

  if (typeof filteredClients === "function") {
    filteredClients = function filteredClients() {
      return state.clients.filter((client) => {
        const status = normalizedStatus(client.status);
        const situacio = normalizedSituacio(client.situacio, client.status);
        if (status === "pendent" && situacio === "no_interessat" && !state.filters.showNoInteressats) return false;
        const haystack = [client.name, client.phone, client.email, client.interest, client.assignedUnit, client.notes]
          .join(" ")
          .toLowerCase();
        const searchOk = !state.filters.search || haystack.includes(state.filters.search.toLowerCase());
        const interestOk = !state.filters.interest || normalizeInterest(client.interest) === state.filters.interest;
        const statusOk = !state.filters.nextStep || status === normalizedStatus(state.filters.nextStep);
        return searchOk && interestOk && statusOk;
      });
    };
  }

  if (typeof openClient === "function") {
    const previousOpenClient = openClient;
    openClient = function openClient(id) {
      previousOpenClient(id);
      if (!els?.clientStatus || !els?.clientSituacio) return;
      els.clientStatus.onchange = () => {
        if (normalizedStatus(els.clientStatus.value) !== "pendent" && els.clientSituacio.value === "no_interessat") {
          els.clientSituacio.value = "pendent_de_contactar";
        }
      };
    };
  }

  if (typeof saveSelectedClient === "function") {
    const previousSaveSelectedClient = saveSelectedClient;
    saveSelectedClient = async function saveSelectedClient() {
      if (els?.clientStatus && els?.clientSituacio) {
        els.clientSituacio.value = cleanSituacioForStatus(els.clientStatus.value, els.clientSituacio.value);
      }
      return previousSaveSelectedClient();
    };
  }

  if (typeof render === "function") render();
}

setTimeout(crmReversibleSituacioFix, 50);
