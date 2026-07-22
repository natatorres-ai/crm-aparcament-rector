// Persists the last-contact date in Supabase instead of keeping it only in memory.
(function installLastContactPersistence() {
  let lastContactColumnReady = false;
  let warningShown = false;

  function dateForInput(value) {
    return value ? String(value).slice(0, 10) : "";
  }

  async function detectLastContactColumn() {
    if (!supabaseClient) return false;
    const { error } = await supabaseClient.from("clients").select("id,data_ultim_contacte").limit(1);
    lastContactColumnReady = !error;
    if (error && !warningShown) {
      warningShown = true;
      showMessage("Falta activar el camp 'Data ultim contacte' a Supabase. Consulta la migracio inclosa al repositori.", "warning");
    }
    return lastContactColumnReady;
  }

  // Other compatibility fixes replace the save mapping shortly after page load.
  // Install this wrapper afterwards so the date is always included in the final save.
  setTimeout(() => {
    const previousFromDb = mapClientFromDb;
    const previousToDb = mapClientToDb;

    mapClientFromDb = function mapClientWithLastContact(row) {
      const client = previousFromDb(row);
      client.lastContact = dateForInput(row.data_ultim_contacte);
      return client;
    };

    mapClientToDb = function mapClientWithLastContact(client) {
      const payload = previousToDb(client);
      if (lastContactColumnReady) {
        payload.data_ultim_contacte = client.lastContact || null;
      }
      return payload;
    };

    detectLastContactColumn().then(() => refreshFromSupabase()).catch((error) => {
      showMessage(`No s'ha pogut preparar la data de contacte: ${error.message}`, "warning");
    });
  }, 120);
})();

