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
  const legacyClients = getLegacyClients();
  const pendingClients = legacyClients.filter((client) => !hasClientAlready(client));

  if (!pendingClients.length) {
    alert("No he trobat clients locals pendents de migrar en aquest navegador.");
    return;
  }

  const ok = confirm(
    `He trobat ${pendingClients.length} clients guardats localment en aquest navegador. Vols pujar-los ara a Supabase?`
  );
  if (!ok) return;

  migrationRunning = true;
  try {
    setConnectionStatus("Guardando...", "busy");
    for (const client of pendingClients) {
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
  const legacyClients = getLegacyClients();
  if (!legacyClients.length) return;
  const pendingClients = legacyClients.filter((client) => !hasClientAlready(client));
  if (!pendingClients.length) return;

  showMessage(
    `Aquest navegador te ${pendingClients.length} clients antics guardats localment. Clica "Migrar dades locals" per pujar-los a Supabase.`,
    "warning"
  );
}

addMigrationButton();
setTimeout(suggestMigrationIfNeeded, 1800);

function ensureUnitatsPanel() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || document.querySelector("#unitatsList")) return;

  const panel = document.createElement("section");
  panel.className = "panel";
  panel.innerHTML = `
    <div class="panel-heading-row">
      <h2>Unitats</h2>
      <button id="refreshUnitats" type="button">Refrescar</button>
    </div>
    <div class="unit-summary" id="unitatsSummary">0 unitats carregades</div>
    <div class="unit-list" id="unitatsList"></div>
  `;
  sidebar.appendChild(panel);
  els.refreshUnitats = document.querySelector("#refreshUnitats");
  els.unitatsSummary = document.querySelector("#unitatsSummary");
  els.unitatsList = document.querySelector("#unitatsList");
}

function ensureUnitatsStyles() {
  if (document.querySelector("#unitatsStyles")) return;
  const style = document.createElement("style");
  style.id = "unitatsStyles";
  style.textContent = `
    .app-message[data-type="ok"]{border-color:#78a58f;background:#eef7f2;color:#245b4f}
    .app-message[data-type="warning"]{border-color:#c8aa75;background:#fff8e9;color:#704f15}
    .panel-heading-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
    .panel-heading-row h2{margin-bottom:0}
    .panel-heading-row button{min-height:34px;padding:7px 10px;font-size:13px}
    .unit-summary{margin:10px 0;color:var(--muted);font-size:13px;font-weight:750}
    .unit-list{display:grid;gap:8px;max-height:360px;overflow:auto}
    .unit-item{display:grid;gap:4px;padding:10px;border:1px solid var(--line);border-radius:6px;background:#f8faf7}
    .unit-item strong{overflow-wrap:anywhere}
    .unit-item span{color:var(--muted);font-size:12px;line-height:1.35}
  `;
  document.head.appendChild(style);
}

mapUnitatFromDb = function mapUnitatFromDb(row) {
  const label = [row.numero, row.planta ? `planta ${row.planta}` : "", row.tipus || row.tipus_unitat]
    .filter(Boolean)
    .join(" - ");
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

mapUnitatToDb = function mapUnitatToDb(unitat) {
  return {
    tipus_unitat: unitat.tipusUnitat || unitat.tipus || "Placa",
    numero: unitat.numero || unitat.label || "",
    planta: unitat.planta || "",
    tipus: unitat.tipus || "",
    preu: unitat.preu === "" ? null : Number(unitat.preu) || null,
    estat: unitat.estat || "Disponible",
    observacions: unitat.observacions || "",
    m2: unitat.m2 === "" ? null : Number(unitat.m2) || null,
    updated_at: new Date().toISOString(),
  };
};

cacheData = function cacheData() {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify({
      clients: state.clients,
      assignacions: state.assignacions,
      cachedAt: new Date().toISOString(),
    })
  );
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

const originalRenderUnitList = renderUnitList;
renderUnitList = function renderUnitList() {
  originalRenderUnitList();
  renderUnitatsPanel();
};

function renderUnitatsPanel() {
  ensureUnitatsPanel();
  if (!els.unitatsSummary || !els.unitatsList) return;

  const total = state.unitats.length;
  const places = state.unitats.filter((unitat) => normalizeKey(unitat.tipusUnitat || unitat.tipus).includes("plac")).length;
  const trasters = state.unitats.filter((unitat) => normalizeKey(unitat.tipusUnitat || unitat.tipus).includes("traster")).length;
  els.unitatsSummary.textContent = `${total} unitats carregades - ${places} places - ${trasters} trasters`;

  els.unitatsList.innerHTML = state.unitats
    .map((unitat) => {
      const title = [unitat.tipusUnitat || "Unitat", unitat.numero ? `num. ${unitat.numero}` : ""]
        .filter(Boolean)
        .join(" ");
      const details = [
        unitat.planta ? `Planta ${unitat.planta}` : "",
        unitat.tipus || "",
        unitat.estat ? `Estat: ${unitat.estat}` : "",
        unitat.preu !== "" && unitat.preu !== null ? `Preu: ${unitat.preu}` : "",
        unitat.m2 !== "" && unitat.m2 !== null ? `${unitat.m2} m2` : "",
      ].filter(Boolean);
      return `
        <div class="unit-item">
          <strong>${escapeHtml(title || unitat.label)}</strong>
          <span>${escapeHtml(details.join(" - ") || "Sense detall")}</span>
        </div>
      `;
    })
    .join("");
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

ensureUnitatsStyles();
ensureUnitatsPanel();
els.refreshUnitats?.addEventListener("click", refreshUnitatsFromSupabase);
state.unitats = [];
setTimeout(refreshUnitatsFromSupabase, 0);
