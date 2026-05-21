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
