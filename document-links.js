const CRM_RESERVA_URL = "https://generacion-docreserva-pkrector-codex.netlify.app/";
const CRM_CONTRACTE_URL = "https://generacioncontratopkrector.pages.dev/";

function crmDocNormalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function crmDocParamSet(client, unitat) {
  const params = new URLSearchParams();
  const add = (key, value) => {
    if (value !== undefined && value !== null && value !== "") params.set(key, value);
  };
  add("clientName", client?.name);
  add("nom", client?.name);
  add("telefon", client?.phone);
  add("phone", client?.phone);
  add("email", client?.email);
  add("interest", client?.interest);
  add("numero", unitat?.label || unitat?.numero);
  add("numero_placa", unitat?.label || unitat?.numero);
  add("spaceNumber", unitat?.label || unitat?.numero);
  add("planta", unitat?.planta);
  add("spaceFloor", unitat?.planta);
  add("tipus", unitat?.tipus || unitat?.detail);
  add("unitType", unitat?.tipus || unitat?.detail);
  add("tipus_unitat", unitat?.tipusUnitat || unitat?.tipus_unitat);
  add("tipusUnitat", unitat?.tipusUnitat || unitat?.tipus_unitat);
  add("preu", unitat?.preu);
  add("spacePrice", unitat?.preu);
  add("import_mensual", unitat?.preu);
  return params;
}

function crmDocUrl(baseUrl, client, unitat) {
  const params = crmDocParamSet(client, unitat);
  return `${baseUrl}?${params.toString()}`;
}

function crmDocUnitFromAssignment(unit) {
  const full = state.unitats.find((item) => String(item.id) === String(unit.unitatId));
  return {
    ...unit,
    ...full,
    label: unit.label || full?.label || full?.numero || "",
    numero: full?.numero || unit.label || "",
    planta: full?.planta || "",
    tipus: full?.tipus || unit.detail || "",
    tipusUnitat: full?.tipusUnitat || full?.tipus_unitat || "",
    preu: full?.preu ?? "",
  };
}

function crmDocButton(label, url) {
  return `<a class="doc-action-button" href="${url}" target="_blank" rel="noopener">${label}</a>`;
}

function crmDocActionsHtml(client, unit) {
  const unitat = crmDocUnitFromAssignment(unit);
  const reserva = crmDocUrl(CRM_RESERVA_URL, client, unitat);
  const contracte = crmDocUrl(CRM_CONTRACTE_URL, client, unitat);
  const detail = [unitat.planta ? `planta ${unitat.planta}` : "", unitat.tipus, unitat.preu ? `${unitat.preu} €` : ""]
    .filter(Boolean)
    .join(" · ");
  return `
    <div class="doc-unit-row">
      <div>
        <strong>${escapeHtml(unitat.label || "Unitat")}</strong>
        <small>${escapeHtml(detail || unitat.detail || "")}</small>
      </div>
      <div class="doc-action-buttons">
        ${crmDocButton("Reserva", reserva)}
        ${crmDocButton("Contracte", contracte)}
      </div>
    </div>
  `;
}

function crmEnsureDocStyles() {
  if (document.querySelector("#crmDocumentLinksStyles")) return;
  const style = document.createElement("style");
  style.id = "crmDocumentLinksStyles";
  style.textContent = `
    .doc-actions-panel{grid-column:1 / -1;border:1px solid var(--line);border-radius:8px;background:#fbfcfb;padding:12px;display:grid;gap:10px}
    .doc-actions-panel h3{margin:0;font-size:15px}
    .doc-unit-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff}
    .doc-unit-row small{display:block;margin-top:3px;color:var(--muted);font-size:12px}
    .doc-action-buttons{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .doc-action-button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 10px;border:1px solid var(--accent);border-radius:6px;color:var(--accent);background:#fff;text-decoration:none;font-weight:750;font-size:13px}
    .doc-action-button:hover{background:var(--accent-soft)}
    @media (max-width:760px){.doc-unit-row{align-items:flex-start;flex-direction:column}.doc-action-buttons{justify-content:flex-start}}
  `;
  document.head.appendChild(style);
}

function crmRenderDocumentLinks(clientId) {
  crmEnsureDocStyles();
  const formGrid = document.querySelector("#clientForm .form-grid");
  if (!formGrid) return;
  let panel = document.querySelector("#documentActionsPanel");
  if (!panel) {
    panel = document.createElement("section");
    panel.id = "documentActionsPanel";
    panel.className = "doc-actions-panel";
    formGrid.insertAdjacentElement("afterend", panel);
  }
  const client = state.clients.find((item) => String(item.id) === String(clientId));
  const units = client?.assignedUnits || [];
  if (!client || !units.length) {
    panel.innerHTML = `<h3>Documents</h3><div class="empty">Assigna una plaça o traster per generar documents.</div>`;
    return;
  }
  panel.innerHTML = `<h3>Documents</h3>${units.map((unit) => crmDocActionsHtml(client, unit)).join("")}`;
}

function crmInstallDocumentLinks() {
  if (window.__crmDocumentLinksInstalled) return;
  window.__crmDocumentLinksInstalled = true;
  const previousOpenClient = typeof openClient === "function" ? openClient : null;
  if (previousOpenClient) {
    openClient = function openClientWithDocumentLinks(id) {
      previousOpenClient(id);
      setTimeout(() => crmRenderDocumentLinks(id), 0);
    };
  }
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (target?.matches?.("#saveClient")) {
      const id = state.selectedId;
      setTimeout(() => crmRenderDocumentLinks(id), 500);
    }
  });
}

setTimeout(crmInstallDocumentLinks, 120);
