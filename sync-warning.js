function enableSharedRefreshFallback() {
  if (window.__crmSharedSyncEnabled) return;
  window.__crmSharedSyncEnabled = true;

  let syncing = false;
  let lastSyncAt = 0;

  async function sync(reason = "auto") {
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

  function schedule(reason) {
    if (Date.now() - lastSyncAt < 2500) return;
    setTimeout(() => sync(reason), 100);
  }

  window.addEventListener("focus", () => schedule("focus"));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule("visible");
  });
  setInterval(() => sync("interval"), 10000);
}

function forceUnitImportsAsCatalogueOnly() {
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

function enableUnitatsExport() {
  if (document.querySelector("#exportUnitats")?.dataset.ready === "true") return;
  const button = document.querySelector("#exportUnitats");
  if (!button) return;
  button.dataset.ready = "true";
  button.addEventListener("click", async () => {
    if (!window.XLSX) {
      alert("La llibreria d'Excel encara s'esta carregant. Torna-ho a provar en uns segons.");
      return;
    }
    try {
      setConnectionStatus("Preparant exportacio...", "busy");
      await refreshFromSupabase();
      const activeAssignacions = state.assignacions.filter(
        (assignacio) => !String(assignacio.estat || "").toLowerCase().includes("cancel")
      );
      const rows = state.unitats.map((unitat) => {
        const unitAssignacions = activeAssignacions.filter(
          (assignacio) => String(assignacio.unitat_id) === String(unitat.id)
        );
        const clientNames = unitAssignacions
          .map((assignacio) => state.clients.find((client) => String(client.id) === String(assignacio.client_id))?.name)
          .filter(Boolean);
        return {
          "Tipus unitat": unitat.tipusUnitat || "",
          Numero: unitat.numero || unitat.label || "",
          Planta: unitat.planta || "",
          Tipus: unitat.tipus || "",
          m2: unitat.m2 ?? "",
          Preu: unitat.preu ?? "",
          Estat: unitat.estat || "",
          "Client assignat": clientNames.join(" / "),
          "Estat assignacio": unitAssignacions.map((assignacio) => assignacio.estat || "").filter(Boolean).join(" / "),
          Observacions: unitat.observacions || "",
        };
      });
      const sheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, "Unitats");
      XLSX.writeFile(workbook, "crm-aparcament-rector-unitats.xlsx");
      setConnectionStatus("Conectado a Supabase", "ok");
      showMessage("Exportacio d'unitats preparada.", "ok");
    } catch (error) {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'han pogut exportar les unitats: ${error.message}`, "error");
    }
  });
}

function enableLocalClientsWarning() {
  const legacyKey = "crm-aparcament-rector-v1";
  let autoUploading = false;

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function getLocalClients() {
    try {
      const data = JSON.parse(localStorage.getItem(legacyKey) || "{}");
      return Array.isArray(data.clients)
        ? data.clients.filter((client) => client && (client.name || client.phone || client.email))
        : [];
    } catch {
      return [];
    }
  }

  function isAlreadyOnline(client) {
    const key = `${normalize(client.name)}-${normalize(client.phone)}`;
    return state.clients.some((item) => `${normalize(item.name)}-${normalize(item.phone)}` === key);
  }

  function ensureStyles() {
    if (document.querySelector("#localSyncNoticeStyles")) return;
    const style = document.createElement("style");
    style.id = "localSyncNoticeStyles";
    style.textContent =
      ".local-sync-notice{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:14px 18px 0;padding:14px 16px;border:1px solid #bd4b42;background:#fff2f0;color:#7f211a;border-radius:8px;box-shadow:0 8px 24px rgba(127,33,26,.08)}.local-sync-notice strong,.local-sync-notice span{display:block}.local-sync-notice strong{margin-bottom:3px;font-size:15px}.local-sync-notice span{font-size:13px;font-weight:650}.local-sync-notice button{flex:0 0 auto;border-color:#7f211a;background:#7f211a;color:#fff}@media(max-width:720px){.local-sync-notice{align-items:stretch;flex-direction:column}.local-sync-notice button{width:100%}}";
    document.head.appendChild(style);
  }

  function removeNotice() {
    document.querySelector("#localSyncNotice")?.remove();
  }

  function showNotice(count) {
    ensureStyles();
    let notice = document.querySelector("#localSyncNotice");
    if (!notice) {
      notice = document.createElement("div");
      notice.id = "localSyncNotice";
      notice.className = "local-sync-notice";
      notice.innerHTML = `
        <div>
          <strong></strong>
          <span>Aquest ordinador te clients que encara no estan online. Si no es pugen, els altres dispositius no els veuran.</span>
        </div>
        <button type="button">Pujar-los a Supabase</button>
      `;
      notice.querySelector("button").addEventListener("click", async () => {
        if (typeof migrateLegacyClientsToSupabase === "function") {
          await migrateLegacyClientsToSupabase();
          await refreshFromSupabase();
          setTimeout(check, 500);
        }
      });
      document.querySelector(".topbar")?.insertAdjacentElement("afterend", notice);
    }
    notice.querySelector("strong").textContent = `${count} clients locals no compartits`;
  }

  async function uploadPendingClients(pending) {
    if (autoUploading || !pending.length || !state.supabaseReady || !supabaseClient) return;
    autoUploading = true;
    try {
      setConnectionStatus("Pujant clients locals...", "busy");
      for (const client of pending) {
        if (isAlreadyOnline(client)) continue;
        const saved = await saveClient(
          makeClient({
            name: client.name,
            phone: client.phone,
            email: client.email,
            interest: client.interest,
            status: client.status,
            priority: client.priority,
            notes: client.notes,
            createdAt: client.createdAt,
          })
        );
        state.clients.push(saved);
      }
      await refreshFromSupabase();
      removeNotice();
      showMessage("Clients locals pujats automaticament a Supabase.", "ok");
      setConnectionStatus("Conectado a Supabase", "ok");
    } catch (error) {
      showNotice(pending.length);
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'han pogut pujar automaticament els clients locals: ${error.message}`, "error");
    } finally {
      autoUploading = false;
    }
  }

  function check() {
    const pending = getLocalClients().filter((client) => !isAlreadyOnline(client));
    if (!pending.length) {
      removeNotice();
      return;
    }
    if (state.supabaseReady && supabaseClient) {
      uploadPendingClients(pending);
    } else {
      showNotice(pending.length);
    }
  }

  setTimeout(check, 2500);
  setInterval(check, 30000);
}

setTimeout(() => {
  forceUnitImportsAsCatalogueOnly();
  enableUnitatsExport();
  enableSharedRefreshFallback();
  enableLocalClientsWarning();
}, 0);
