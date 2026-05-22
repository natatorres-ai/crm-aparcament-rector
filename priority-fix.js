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

if (typeof refreshFromSupabase === "function") {
  setTimeout(() => {
    refreshFromSupabase().catch((error) => {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'ha pogut recarregar Supabase: ${error.message}`);
    });
  }, 0);
}
