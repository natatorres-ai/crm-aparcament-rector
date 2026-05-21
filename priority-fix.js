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

if (typeof refreshFromSupabase === "function") {
  setTimeout(() => {
    refreshFromSupabase().catch((error) => {
      setConnectionStatus("Error de conexion", "error");
      showMessage(`No s'ha pogut recarregar Supabase: ${error.message}`);
    });
  }, 0);
}
