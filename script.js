const STORAGE_KEY = "controlPeso.entries";
const NUMBER_PRECISION = 1;
const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" });
const tableDateFormatter = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});
const numberFormatter = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: NUMBER_PRECISION,
  maximumFractionDigits: NUMBER_PRECISION,
});

const elements = {
  form: document.querySelector("#entry-form"),
  date: document.querySelector("#date"),
  weight: document.querySelector("#weight"),
  waist: document.querySelector("#waist"),
  chest: document.querySelector("#chest"),
  submitButton: document.querySelector("#save-entry"),
  submitButtonIcon: document.querySelector("#save-entry-icon"),
  submitButtonLabel: document.querySelector("#save-entry-label"),
  cancelEditButton: document.querySelector("#cancel-edit"),
  editingBanner: document.querySelector("#form-editing-banner"),
  editingBannerDate: document.querySelector("#form-editing-date"),
  clearButton: document.querySelector("#clear-data"),
  chartCanvas: document.querySelector("#chart"),
  tableBody: document.querySelector("#entries-table-body"),
  tableEmptyState: document.querySelector("#entries-empty-state"),
};

if (!elements.form) {
  throw new Error("No se encontro el formulario principal.");
}

const defaultSubmitLabel = elements.submitButtonLabel?.textContent ?? "Guardar registro";
const defaultSubmitIcon = elements.submitButtonIcon?.textContent ?? "💾";
const editingSubmitLabel = "Actualizar registro";
const editingSubmitIcon = "✏️";

let editingEntryId = null;
let editingEntryOriginalDate = null;

const entries = loadEntries();
const chart = initialiseChart(elements.chartCanvas);
refreshAll(entries);

elements.form.addEventListener("submit", handleSubmit);
if (elements.clearButton) {
  elements.clearButton.addEventListener("click", handleClearAll);
}
if (elements.cancelEditButton) {
  elements.cancelEditButton.addEventListener("click", handleCancelEdit);
}
if (elements.tableBody) {
  elements.tableBody.addEventListener("click", handleTableClick);
}
if (elements.date) {
  elements.date.addEventListener("input", () => {
    if (!editingEntryId) {
      return;
    }
    const currentValue = elements.date.value;
    if (currentValue && !Number.isNaN(Date.parse(currentValue))) {
      editingEntryOriginalDate = currentValue;
    }
    updateEditingBannerDate(currentValue || editingEntryOriginalDate);
  });
}

window.addEventListener("storage", event => {
  if (event.key !== STORAGE_KEY) {
    return;
  }
  const updatedEntries = loadEntries();
  entries.splice(0, entries.length, ...updatedEntries);
  refreshAll(entries);
  if (editingEntryId) {
    const activeEntry = findEntryById(entries, editingEntryId);
    if (!activeEntry) {
      resetFormState({ focus: false });
    } else {
      editingEntryOriginalDate = activeEntry.date;
      updateEditingBannerDate(elements.date?.value || activeEntry.date);
      if (elements.tableBody) {
        const rows = elements.tableBody.querySelectorAll("tr[data-entry-id]");
        rows.forEach(row => {
          const isTarget = row.dataset.entryId === editingEntryId;
          row.classList.toggle("is-active", isTarget);
          row.setAttribute("aria-selected", String(isTarget));
        });
      }
    }
  }
});

function handleSubmit(event) {
  event.preventDefault();

  if (!elements.form.reportValidity()) {
    return;
  }

  const entryData = createEntryFromForm();
  if (!entryData) {
    return;
  }

  const entry = editingEntryId
    ? { ...entryData, id: editingEntryId }
    : { ...entryData, id: generateEntryId() };

  upsertEntry(entries, entry);
  persistEntries(entries);
  refreshAll(entries);
  resetFormState();
}

function handleTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button || !elements.tableBody?.contains(button)) {
    return;
  }

  const { action, entryId } = button.dataset;
  if (!action || !entryId) {
    return;
  }

  if (action === "edit") {
    startEditingEntry(entryId);
  } else if (action === "delete") {
    handleDeleteEntry(entryId);
  }
}

function handleCancelEdit() {
  resetFormState();
}

function startEditingEntry(entryId) {
  const entry = findEntryById(entries, entryId);
  if (!entry) {
    return;
  }

  fillFormWithEntry(entry);
  setEditingState(entry);

  if (typeof elements.form?.scrollIntoView === "function") {
    elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  elements.date?.focus();
}

function fillFormWithEntry(entry) {
  if (elements.date) {
    elements.date.value = entry.date;
  }
  if (elements.weight) {
    elements.weight.value = entry.weight !== null && entry.weight !== undefined ? String(entry.weight) : "";
  }
  if (elements.waist) {
    elements.waist.value = entry.waist !== null && entry.waist !== undefined ? String(entry.waist) : "";
  }
  if (elements.chest) {
    elements.chest.value = entry.chest !== null && entry.chest !== undefined ? String(entry.chest) : "";
  }
}

function resetFormState({ focus = true } = {}) {
  if (!elements.form) {
    return;
  }

  elements.form.reset();
  setEditingState(null);
  if (focus) {
    elements.date?.focus();
  }
}

function setEditingState(entry) {
  const isEditing = Boolean(entry);
  editingEntryId = entry?.id ?? null;
  editingEntryOriginalDate = entry?.date ?? null;

  elements.form?.classList.toggle("is-editing", isEditing);
  if (elements.cancelEditButton) {
    elements.cancelEditButton.hidden = !isEditing;
  }
  if (elements.editingBanner) {
    elements.editingBanner.hidden = !isEditing;
  }
  if (elements.editingBannerDate) {
    if (isEditing) {
      updateEditingBannerDate(entry.date);
    } else {
      elements.editingBannerDate.textContent = "";
      elements.editingBannerDate.removeAttribute("datetime");
    }
  }
  if (elements.tableBody) {
    const rows = elements.tableBody.querySelectorAll("tr[data-entry-id]");
    rows.forEach(row => {
      const isTarget = isEditing && row.dataset.entryId === entry.id;
      row.classList.toggle("is-active", isTarget);
      row.setAttribute("aria-selected", String(isTarget));
    });
  }
  if (elements.submitButtonLabel) {
    elements.submitButtonLabel.textContent = isEditing ? editingSubmitLabel : defaultSubmitLabel;
  }
  if (elements.submitButtonIcon) {
    elements.submitButtonIcon.textContent = isEditing ? editingSubmitIcon : defaultSubmitIcon;
  }
}

function handleDeleteEntry(entryId) {
  const entry = findEntryById(entries, entryId);
  if (!entry) {
    return;
  }

  const friendlyDate = formatTableDate(entry.date);
  const confirmed = window.confirm(`¿Seguro que quieres eliminar el registro del ${friendlyDate}?`);
  if (!confirmed) {
    return;
  }

  const removed = removeEntryById(entries, entryId);
  if (!removed) {
    return;
  }

  persistEntries(entries);
  refreshAll(entries);

  if (editingEntryId === entryId) {
    resetFormState();
  }
}

function createEntryFromForm() {
  const dateValue = elements.date?.value ?? "";
  const weightValue = parseMetric(elements.weight?.value);

  if (!dateValue || weightValue === null) {
    return null;
  }

  return {
    date: dateValue,
    weight: weightValue,
    waist: parseMetric(elements.waist?.value),
    chest: parseMetric(elements.chest?.value),
  };
}

function parseMetric(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === "") {
    return null;
  }

  const numericValue = Number.parseFloat(rawValue);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return Number(numericValue.toFixed(NUMBER_PRECISION));
}

function loadEntries() {
  let needsMigration = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const normalised = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || typeof item.id !== "string" || item.id.length === 0) {
        needsMigration = true;
      }
      const entry = normaliseStoredEntry(item);
      if (entry) {
        normalised.push(entry);
      }
    }

    normalised.sort(compareEntries);

    if (needsMigration && normalised.length) {
      persistEntries(normalised);
    }

    return normalised;
  } catch (error) {
    console.warn("No se pudieron leer los registros almacenados.", error);
    return [];
  }
}

function normaliseStoredEntry(item) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const date = typeof item.date === "string" ? item.date : null;
  const weight = parseMetric(item.weight);

  if (!date || weight === null) {
    return null;
  }

  return {
    id: typeof item.id === "string" && item.id.length ? item.id : generateEntryId(),
    date,
    weight,
    waist: parseMetric(item.waist ?? null),
    chest: parseMetric(item.chest ?? null),
  };
}

function persistEntries(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (error) {
    console.error("No se pudieron guardar los registros.", error);
  }
}

function removeEntryById(list, entryId) {
  const index = list.findIndex(item => item.id === entryId);
  if (index < 0) {
    return false;
  }
  list.splice(index, 1);
  return true;
}

function upsertEntry(list, entry) {
  const index = list.findIndex(item => item.id === entry.id);
  if (index >= 0) {
    list[index] = { ...entry };
  } else {
    list.push({ ...entry });
  }
  list.sort(compareEntries);
}

function compareEntries(a, b) {
  const dateComparison = a.date.localeCompare(b.date);
  if (dateComparison !== 0) {
    return dateComparison;
  }
  return a.id.localeCompare(b.id);
}

function findEntryById(list, entryId) {
  return list.find(item => item.id === entryId) ?? null;
}

function generateEntryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `entry-${Date.now().toString(36)}-${random}`;
}

function updateEditingBannerDate(dateValue) {
  if (!elements.editingBannerDate) {
    return;
  }
  const hasValidDate = dateValue && !Number.isNaN(Date.parse(dateValue));
  const effectiveDate = hasValidDate ? dateValue : editingEntryOriginalDate;
  if (!effectiveDate) {
    elements.editingBannerDate.textContent = "";
    elements.editingBannerDate.removeAttribute("datetime");
    return;
  }
  elements.editingBannerDate.textContent = formatTableDate(effectiveDate);
  elements.editingBannerDate.dateTime = effectiveDate;
}

function initialiseChart(canvas) {
  if (!canvas) {
    return null;
  }

  if (typeof Chart === "undefined") {
    console.warn("Chart.js no esta disponible; se omite la visualizacion del grafico.");
    return null;
  }

  const ctx = canvas.getContext("2d");
  const accent = "#2563eb";
  const accentDark = "#1d4ed8";

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Peso (kg)",
          data: [],
          borderColor(context) {
            const { chart } = context;
            return createLineGradient(chart) ?? accent;
          },
          backgroundColor(context) {
            const { chart } = context;
            return createFillGradient(chart) ?? "rgba(37, 99, 235, 0.16)";
          },
          fill: true,
          tension: 0.38,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: accentDark,
          pointBorderWidth: 2,
          borderWidth: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      layout: {
        padding: {
          left: 8,
          right: 18,
          top: 12,
          bottom: 12,
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            usePointStyle: true,
            padding: 20,
            color: "#1e293b",
            font: {
              weight: "600",
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          titleFont: {
            size: 13,
            weight: "600",
          },
          bodyFont: {
            size: 13,
          },
          padding: 12,
          displayColors: false,
          callbacks: {
            label(context) {
              const value = context.parsed.y ?? 0;
              const entry = entries[context.dataIndex];
              const waist = entry?.waist ? ` | Cintura: ${formatMetric(entry.waist, "cm")}` : "";
              const chest = entry?.chest ? ` | Pecho: ${formatMetric(entry.chest, "cm")}` : "";
              return `Peso: ${formatMetric(value, "kg")}${waist}${chest}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            display: false,
          },
          ticks: {
            color: "#475569",
            font: {
              weight: "600",
            },
          },
        },
        y: {
          beginAtZero: false,
          grid: {
            color: "rgba(148, 163, 184, 0.3)",
            drawBorder: false,
          },
          ticks: {
            color: "#475569",
            padding: 8,
          },
        },
      },
      animations: {
        tension: {
          duration: 800,
          easing: "easeOutQuad",
        },
      },
    },
    plugins: [createShadowPlugin(accentDark)],
  });
}

function refreshChart(instance, list) {
  if (!instance) {
    return;
  }

  instance.data.labels = list.map(entry => formatChartLabel(entry.date));
  instance.data.datasets[0].data = list.map(entry => entry.weight);
  instance.update();
}

function refreshAll(list) {
  refreshChart(chart, list);
  renderTable(list);
  setClearButtonState(list.length > 0);
  if (editingEntryId && elements.tableBody) {
    const rows = elements.tableBody.querySelectorAll("tr[data-entry-id]");
    rows.forEach(row => {
      const isTarget = row.dataset.entryId === editingEntryId;
      row.classList.toggle("is-active", isTarget);
      row.setAttribute("aria-selected", String(isTarget));
    });
  }
}

function renderTable(list) {
  const body = elements.tableBody;
  const emptyState = elements.tableEmptyState;
  if (!body || !emptyState) {
    return;
  }

  body.textContent = "";

  if (!list.length) {
    emptyState.classList.add("is-visible");
    emptyState.setAttribute("aria-hidden", "false");
    return;
  }

  emptyState.classList.remove("is-visible");
  emptyState.setAttribute("aria-hidden", "true");
  const fragment = document.createDocumentFragment();

  for (const entry of list) {
    const row = document.createElement("tr");
    row.dataset.entryId = entry.id;
    row.dataset.date = entry.date;
    row.setAttribute("aria-selected", "false");
    const displayDate = formatTableDate(entry.date);
    row.innerHTML = `
      <td>${displayDate}</td>
      <td>${formatMetric(entry.weight, "kg")}</td>
      <td>${formatOptionalMetric(entry.waist, "cm")}</td>
      <td>${formatOptionalMetric(entry.chest, "cm")}</td>
    `;
    const actionsCell = document.createElement("td");
    actionsCell.className = "table-actions-cell";
    const actions = document.createElement("div");
    actions.className = "table-actions";
    const friendlyDate = displayDate;
    const editButton = createTableActionButton(
      "edit",
      entry.id,
      "✏️",
      "Editar",
      `Editar registro del ${friendlyDate}`,
    );
    const deleteButton = createTableActionButton(
      "delete",
      entry.id,
      "🗑️",
      "Eliminar",
      `Eliminar registro del ${friendlyDate}`,
    );
    deleteButton.classList.add("danger");
    actions.append(editButton, deleteButton);
    actionsCell.appendChild(actions);
    row.appendChild(actionsCell);
    fragment.appendChild(row);
  }

  body.appendChild(fragment);
}

function createTableActionButton(action, entryId, icon, label, ariaLabel) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "table-action with-icon";
  button.dataset.action = action;
  button.dataset.entryId = entryId;
  if (ariaLabel) {
    button.setAttribute("aria-label", ariaLabel);
    button.title = ariaLabel;
  }

  const iconSpan = document.createElement("span");
  iconSpan.className = "button-icon";
  iconSpan.setAttribute("aria-hidden", "true");
  iconSpan.textContent = icon;

  const labelSpan = document.createElement("span");
  labelSpan.textContent = label;

  button.append(iconSpan, labelSpan);
  return button;
}

function formatOptionalMetric(value, unit) {
  if (value === null || value === undefined) {
    return "—";
  }
  return formatMetric(value, unit);
}

function formatMetric(value, unit) {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return `${value} ${unit}`;
  }
  return `${numberFormatter.format(numericValue)} ${unit}`;
}

function formatTableDate(isoDate) {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) {
    return isoDate;
  }
  return tableDateFormatter.format(parsed);
}

function formatChartLabel(isoDate) {
  const parsed = parseIsoDate(isoDate);
  return parsed ? dateFormatter.format(parsed) : isoDate;
}

function parseIsoDate(value) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp);
}

function handleClearAll() {
  if (!entries.length) {
    return;
  }

  const confirmed = window.confirm("¿Seguro que quieres borrar todos los registros?");
  if (!confirmed) {
    return;
  }

  entries.splice(0, entries.length);
  persistEntries(entries);
  refreshAll(entries);
  resetFormState();
}

function setClearButtonState(isEnabled) {
  if (!elements.clearButton) {
    return;
  }
  elements.clearButton.disabled = !isEnabled;
  elements.clearButton.setAttribute("aria-disabled", String(!isEnabled));
}

function createShadowPlugin(color) {
  return {
    id: "lineShadow",
    beforeDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
    },
    afterDatasetsDraw(chart) {
      chart.ctx.restore();
    },
  };
}

function createLineGradient(chart) {
  const { ctx, chartArea } = chart;
  if (!chartArea) {
    return null;
  }

  const gradient = ctx.createLinearGradient(chartArea.left, chartArea.bottom, chartArea.right, chartArea.top);
  gradient.addColorStop(0, "#2563eb");
  gradient.addColorStop(1, "#9333ea");
  return gradient;
}

function createFillGradient(chart) {
  const { ctx, chartArea } = chart;
  if (!chartArea) {
    return null;
  }

  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgba(147, 197, 253, 0.45)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0.05)");
  return gradient;
}
