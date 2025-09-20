const STORAGE_KEY = "controlPeso.entries";
const NUMBER_PRECISION = 1;
const XLSX_MODULE_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm";
const EXCEL_FILE_PREFIX = "control-peso";
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

const SPANISH_MONTHS = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  sept: 9,
  sep: 9,
  setiembre: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};

const OPTIONAL_METRIC_FIELDS = [
  { key: "waist", label: "Cintura", unit: "cm", elementKey: "waist", tableClass: ".table-cell-waist" },
  { key: "chest", label: "Pecho", unit: "cm", elementKey: "chest", tableClass: ".table-cell-chest" },
  {
    key: "rightBicep",
    label: "Bíceps der.",
    unit: "cm",
    elementKey: "rightBicep",
    tableClass: ".table-cell-right-bicep",
  },
  {
    key: "leftBicep",
    label: "Bíceps izq.",
    unit: "cm",
    elementKey: "leftBicep",
    tableClass: ".table-cell-left-bicep",
  },
  { key: "glutes", label: "Glúteos", unit: "cm", elementKey: "glutes", tableClass: ".table-cell-glutes" },
  {
    key: "rightThigh",
    label: "Muslo der.",
    unit: "cm",
    elementKey: "rightThigh",
    tableClass: ".table-cell-right-thigh",
  },
  {
    key: "leftThigh",
    label: "Muslo izq.",
    unit: "cm",
    elementKey: "leftThigh",
    tableClass: ".table-cell-left-thigh",
  },
  {
    key: "rightCalf",
    label: "Gemelo der.",
    unit: "cm",
    elementKey: "rightCalf",
    tableClass: ".table-cell-right-calf",
  },
  {
    key: "leftCalf",
    label: "Gemelo izq.",
    unit: "cm",
    elementKey: "leftCalf",
    tableClass: ".table-cell-left-calf",
  },
];

const EXCEL_COLUMNS = [
  { key: "id", header: "ID", width: 26, exportable: false, importKeys: ["id"] },
  {
    key: "date",
    header: "Fecha",
    width: 20,
    required: true,
    importKeys: ["fecha", "date"],
    exportValue: entry => formatTableDate(entry.date),
  },
  {
    key: "weight",
    header: "Peso (kg)",
    width: 14,
    required: true,
    importKeys: ["peso", "peso kg", "peso (kg)", "weight"],
    exportValue: entry => entry.weight ?? "",
  },
  ...OPTIONAL_METRIC_FIELDS.map(field => ({
    key: field.key,
    header: `${field.label} (${field.unit})`,
    width: 16,
    importKeys: [
      field.label,
      `${field.label} (${field.unit})`,
      `${field.label} ${field.unit}`,
      field.elementKey,
    ],
    exportValue: entry => entry[field.key] ?? "",
  })),
];

const EXPORT_COLUMNS = EXCEL_COLUMNS.filter(column => column.exportable !== false).map(column => ({
  key: column.key,
  header: column.header,
  width: column.width ?? 16,
  value: column.exportValue ?? (entry => entry[column.key] ?? ""),
}));

const elements = {
  form: document.querySelector("#entry-form"),
  date: document.querySelector("#date"),
  weight: document.querySelector("#weight"),
  waist: document.querySelector("#waist"),
  chest: document.querySelector("#chest"),
  rightBicep: document.querySelector("#right-bicep"),
  leftBicep: document.querySelector("#left-bicep"),
  glutes: document.querySelector("#glutes"),
  rightThigh: document.querySelector("#right-thigh"),
  leftThigh: document.querySelector("#left-thigh"),
  rightCalf: document.querySelector("#right-calf"),
  leftCalf: document.querySelector("#left-calf"),
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
  rowTemplate: document.querySelector("#entry-row-template"),
  exportButton: document.querySelector("#export-excel"),
  importButton: document.querySelector("#import-excel"),
  importInput: document.querySelector("#import-excel-input"),
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
let xlsxModulePromise = null;

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
if (elements.exportButton) {
  elements.exportButton.addEventListener("click", handleExportToExcel);
}

if (elements.importButton && elements.importInput) {
  elements.importButton.addEventListener("click", () => {
    elements.importInput?.click();
  });
}
if (elements.importInput) {
  elements.importInput.addEventListener("change", handleImportFromExcel);
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
  for (const field of OPTIONAL_METRIC_FIELDS) {
    const input = elements[field.elementKey];
    if (!input) {
      continue;
    }
    const value = entry[field.key];
    input.value = value !== null && value !== undefined ? String(value) : "";
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

async function handleExportToExcel() {
  if (!entries.length) {
    window.alert("Necesitas al menos un registro para descargar el Excel.");
    return;
  }

  if (elements.exportButton) {
    elements.exportButton.disabled = true;
    elements.exportButton.setAttribute("aria-disabled", "true");
  }

  try {
    const xlsx = await loadXlsxModule();
    if (!xlsx) {
      throw new Error("No se pudo cargar la librería de Excel.");
    }

    const { utils } = xlsx;
    const writeFile = xlsx.writeFile ?? xlsx.writeFileXLSX;
    if (!utils || typeof utils.aoa_to_sheet !== "function" || typeof utils.book_new !== "function") {
      throw new Error("La librería de Excel no está disponible completamente.");
    }
    if (typeof writeFile !== "function") {
      throw new Error("No se pudo inicializar la descarga del archivo de Excel.");
    }

    const headerRow = EXPORT_COLUMNS.map(column => column.header);
    const dataRows = entries.map(entry => EXPORT_COLUMNS.map(column => column.value(entry)));
    const worksheet = utils.aoa_to_sheet([headerRow, ...dataRows]);
    worksheet["!cols"] = EXPORT_COLUMNS.map(column => ({ wch: column.width }));

    if (typeof utils.encode_range === "function") {
      worksheet["!autofilter"] = {
        ref: utils.encode_range({
          s: { c: 0, r: 0 },
          e: { c: EXPORT_COLUMNS.length - 1, r: entries.length },
        }),
      };
    }

    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, "Historial");

    const fileName = createExportFileName();
    writeFile(workbook, fileName, { compression: true });
  } catch (error) {
    console.error("No se pudo generar el archivo de Excel.", error);
    window.alert("No se pudo generar el archivo de Excel. Vuelve a intentarlo más tarde.");
  } finally {
    setExportButtonState(entries.length > 0);
  }
}

async function handleImportFromExcel(event) {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!input) {
    return;
  }

  const file = input.files?.[0] ?? null;
  input.value = "";

  if (!file) {
    return;
  }

  setImportButtonBusy(true);

  try {
    const xlsx = await loadXlsxModule();
    if (!xlsx || typeof xlsx.read !== "function") {
      throw new Error("No se pudo procesar el archivo de Excel.");
    }

    const { utils } = xlsx;
    if (!utils || typeof utils.sheet_to_json !== "function") {
      throw new Error("La librería de Excel no está disponible completamente.");
    }

    const fileBuffer = await file.arrayBuffer();
    const workbook = xlsx.read(fileBuffer, { type: "array", cellDates: true, dense: true });
    const [firstSheetName] = workbook.SheetNames ?? [];
    if (!firstSheetName) {
      throw new Error("El archivo de Excel no contiene hojas para importar.");
    }

    const worksheet = workbook.Sheets?.[firstSheetName];
    if (!worksheet) {
      throw new Error("No se pudo leer la primera hoja del archivo de Excel.");
    }

    const rows = utils.sheet_to_json(worksheet, {
      header: 1,
      raw: true,
      blankrows: false,
      defval: null,
    });

    const { entries: importedEntries, skippedRows, missingRequiredColumns } = parseImportedRows(rows);

    if (missingRequiredColumns.length) {
      throw new Error(
        `El archivo debe incluir las columnas obligatorias: ${missingRequiredColumns.join(", ")}.`,
      );
    }

    if (!importedEntries.length) {
      if (skippedRows.length) {
        throw new Error("No se encontraron registros válidos en el archivo.");
      }
      throw new Error("El archivo no contiene registros para importar.");
    }

    const mergeResult = mergeImportedEntries(entries, importedEntries);

    if (mergeResult.added || mergeResult.updated) {
      persistEntries(entries);
      refreshAll(entries);
    }

    const summary = buildImportSummaryMessage(mergeResult, skippedRows);
    window.alert(summary);
  } catch (error) {
    console.error("No se pudo importar el archivo de Excel.", error);
    const message = error instanceof Error && error.message
      ? error.message
      : "No se pudo importar el archivo de Excel. Verifica el formato e inténtalo nuevamente.";
    window.alert(message);
  } finally {
    setImportButtonBusy(false);
  }
}

function setImportButtonBusy(isBusy) {
  if (!elements.importButton) {
    return;
  }
  elements.importButton.disabled = Boolean(isBusy);
  elements.importButton.setAttribute("aria-disabled", String(Boolean(isBusy)));
}

function loadXlsxModule() {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import(XLSX_MODULE_URL).catch(error => {
      xlsxModulePromise = null;
      throw error;
    });
  }

  return xlsxModulePromise;
}

function createEntryFromForm() {
  const dateValue = elements.date?.value ?? "";
  const weightValue = parseMetric(elements.weight?.value);

  if (!dateValue || weightValue === null) {
    return null;
  }

  const entry = {
    date: dateValue,
    weight: weightValue,
  };

  for (const field of OPTIONAL_METRIC_FIELDS) {
    entry[field.key] = parseMetric(elements[field.elementKey]?.value);
  }

  return entry;
}

function parseImportedRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      entries: [],
      skippedRows: [],
      missingRequiredColumns: EXCEL_COLUMNS.filter(column => column.required).map(
        column => column.header,
      ),
    };
  }

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const columnMap = mapImportColumns(headerRow);

  const missingRequiredColumns = EXCEL_COLUMNS.filter(
    column => column.required && (columnMap[column.key] === undefined || columnMap[column.key] < 0),
  ).map(column => column.header);

  const dataRows = rows.slice(1);
  const entriesToImport = [];
  const skippedRows = [];

  dataRows.forEach((row, index) => {
    if (!Array.isArray(row) || isRowEmpty(row)) {
      return;
    }

    const excelRowNumber = index + 2;
    const dateIndex = columnMap.date ?? -1;
    const weightIndex = columnMap.weight ?? -1;

    const rawDate = dateIndex >= 0 ? row[dateIndex] : undefined;
    const rawWeight = weightIndex >= 0 ? row[weightIndex] : undefined;

    const parsedDate = parseExcelDateCell(rawDate);
    const parsedWeight = parseImportedMetric(rawWeight);

    if (!parsedDate || parsedWeight === null) {
      skippedRows.push(excelRowNumber);
      return;
    }

    const entry = {
      date: parsedDate,
      weight: parsedWeight,
    };

    const idIndex = columnMap.id ?? -1;
    if (idIndex >= 0) {
      const parsedId = parseImportedId(row[idIndex]);
      if (parsedId) {
        entry.id = parsedId;
      }
    }

    for (const field of OPTIONAL_METRIC_FIELDS) {
      const columnIndex = columnMap[field.key];
      if (columnIndex === undefined || columnIndex < 0) {
        entry[field.key] = undefined;
        continue;
      }
      entry[field.key] = parseImportedMetric(row[columnIndex]);
    }

    entriesToImport.push(entry);
  });

  return {
    entries: entriesToImport,
    skippedRows,
    missingRequiredColumns,
  };
}

function mapImportColumns(headerRow) {
  const normalisedHeaders = Array.isArray(headerRow)
    ? headerRow.map(value => normaliseHeaderKey(value))
    : [];

  const columnMap = {};

  for (const column of EXCEL_COLUMNS) {
    const possibleKeys = getColumnImportKeys(column);
    const index = normalisedHeaders.findIndex(header => possibleKeys.includes(header));
    columnMap[column.key] = index;
  }

  return columnMap;
}

function getColumnImportKeys(column) {
  const rawKeys = [column.header, ...(column.importKeys ?? [])];
  const uniqueKeys = Array.from(new Set(rawKeys));
  return uniqueKeys
    .map(value => normaliseHeaderKey(value))
    .filter(value => value.length > 0);
}

function normaliseHeaderKey(value) {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseExcelDateCell(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return null;
    }
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return convertExcelSerialToIsoDate(value);
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return null;
  }

  const isoMatch = stringValue.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/);
  if (isoMatch) {
    const [year, month, day] = stringValue.split(/[\/-]/).map(part => Number.parseInt(part, 10));
    return createIsoDate(year, month, day);
  }

  const europeanMatch = stringValue.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/);
  if (europeanMatch) {
    const [day, month, year] = stringValue.split(/[\/-]/).map(part => Number.parseInt(part, 10));
    return createIsoDate(year, month, day);
  }

  const normalisedText = stringValue
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();

  const textualMatch = normalisedText.match(/^([0-9]{1,2})\s*(?:de\s+)?([a-z]+)\s*(?:de\s+)?([0-9]{4})$/);
  if (textualMatch) {
    const day = Number.parseInt(textualMatch[1], 10);
    const monthName = textualMatch[2];
    const year = Number.parseInt(textualMatch[3], 10);
    const month = SPANISH_MONTHS[monthName];
    if (month) {
      return createIsoDate(year, month, day);
    }
  }

  if (/^\d+(?:\.\d+)?$/.test(normalisedText)) {
    const numericValue = Number.parseFloat(normalisedText);
    if (Number.isFinite(numericValue)) {
      const serialDate = convertExcelSerialToIsoDate(numericValue);
      if (serialDate) {
        return serialDate;
      }
    }
  }

  const timestamp = Date.parse(stringValue);
  if (!Number.isNaN(timestamp)) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  return null;
}

function convertExcelSerialToIsoDate(serial) {
  if (!Number.isFinite(serial)) {
    return null;
  }

  let adjustedSerial = serial;
  if (adjustedSerial >= 60) {
    adjustedSerial -= 1;
  }

  const milliseconds = Math.round(adjustedSerial * 86400000);
  const excelEpoch = Date.UTC(1899, 11, 30);
  const date = new Date(excelEpoch + milliseconds);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function createIsoDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parseImportedMetric(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return parseMetric(value);
  }

  if (value instanceof Date) {
    return null;
  }

  let normalised = String(value).trim();
  if (!normalised) {
    return null;
  }

  normalised = normalised.replace(/[^0-9,.-]+/g, "");
  if (!normalised) {
    return null;
  }

  normalised = normalised.replace(/,/g, ".");

  const parts = normalised.split(".");
  if (parts.length > 2) {
    const decimalPart = parts.pop();
    normalised = parts.join("") + "." + decimalPart;
  }

  return parseMetric(normalised);
}

function parseImportedId(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function isRowEmpty(row) {
  return row.every(cell => {
    if (cell === undefined || cell === null) {
      return true;
    }
    if (typeof cell === "string") {
      return cell.trim() === "";
    }
    return false;
  });
}

function mergeImportedEntries(existingEntries, importedEntries) {
  const indexById = new Map();
  const indexByDate = new Map();

  existingEntries.forEach((entry, index) => {
    indexById.set(entry.id, index);
    if (!indexByDate.has(entry.date)) {
      indexByDate.set(entry.date, index);
    }
  });

  let added = 0;
  let updated = 0;

  for (const incoming of importedEntries) {
    let targetIndex = -1;

    if (incoming.id && indexById.has(incoming.id)) {
      targetIndex = indexById.get(incoming.id);
    } else if (indexByDate.has(incoming.date)) {
      targetIndex = indexByDate.get(incoming.date);
    }

    if (targetIndex >= 0) {
      const currentEntry = existingEntries[targetIndex];
      const nextEntry = { ...currentEntry };
      let hasChanges = false;

      if (currentEntry.date !== incoming.date) {
        nextEntry.date = incoming.date;
        hasChanges = true;
      }

      if (currentEntry.weight !== incoming.weight) {
        nextEntry.weight = incoming.weight;
        hasChanges = true;
      }

      for (const field of OPTIONAL_METRIC_FIELDS) {
        if (incoming[field.key] !== undefined) {
          const incomingValue = incoming[field.key] ?? null;
          const currentValue = currentEntry[field.key] ?? null;
          if (!metricsAreEqual(currentValue, incomingValue)) {
            nextEntry[field.key] = incomingValue;
            hasChanges = true;
          }
        }
      }

      if (hasChanges) {
        existingEntries[targetIndex] = { ...nextEntry, id: currentEntry.id };
        updated += 1;
      }

      const updatedEntry = existingEntries[targetIndex];
      if (currentEntry.date !== updatedEntry.date) {
        if (indexByDate.get(currentEntry.date) === targetIndex) {
          indexByDate.delete(currentEntry.date);
        }
        if (!indexByDate.has(updatedEntry.date)) {
          indexByDate.set(updatedEntry.date, targetIndex);
        }
      }
    } else {
      const storedEntry = createStoredEntryFromImport(incoming);
      existingEntries.push(storedEntry);
      const newIndex = existingEntries.length - 1;
      indexById.set(storedEntry.id, newIndex);
      if (!indexByDate.has(storedEntry.date)) {
        indexByDate.set(storedEntry.date, newIndex);
      }
      added += 1;
    }
  }

  if (added || updated) {
    existingEntries.sort(compareEntries);
  }

  return { added, updated };
}

function metricsAreEqual(a, b) {
  return (a ?? null) === (b ?? null);
}

function createStoredEntryFromImport(incoming) {
  const entryId =
    typeof incoming.id === "string" && incoming.id.length ? incoming.id : generateEntryId();

  const storedEntry = {
    id: entryId,
    date: incoming.date,
    weight: incoming.weight,
  };

  for (const field of OPTIONAL_METRIC_FIELDS) {
    const value = incoming[field.key];
    storedEntry[field.key] = value ?? null;
  }

  return storedEntry;
}

function buildImportSummaryMessage(mergeResult, skippedRows) {
  const added = mergeResult?.added ?? 0;
  const updated = mergeResult?.updated ?? 0;
  const parts = [];

  if (added > 0) {
    parts.push(`${added} ${added === 1 ? "registro nuevo" : "registros nuevos"}`);
  }

  if (updated > 0) {
    parts.push(`${updated} ${updated === 1 ? "registro actualizado" : "registros actualizados"}`);
  }

  let message = parts.length
    ? `Importación completada: ${parts.join(" y ")}.`
    : "No se encontraron registros nuevos para importar.";

  if (skippedRows.length) {
    const skippedLabel = skippedRows.length === 1 ? "fila" : "filas";
    message += `\nSe omitieron ${skippedRows.length} ${skippedLabel} por datos incompletos (${skippedRows.join(", ")}).`;
  }

  return message;
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
    ...Object.fromEntries(
      OPTIONAL_METRIC_FIELDS.map(field => [field.key, parseMetric(item[field.key] ?? null)]),
    ),
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
            title(context) {
              const entry = entries[context[0]?.dataIndex ?? 0];
              return entry ? formatTableDate(entry.date) : context[0]?.label;
            },
            label(context) {
              const value = context.parsed.y ?? 0;
              const entry = entries[context.dataIndex];
              const extraMetrics = OPTIONAL_METRIC_FIELDS.map(field => {
                const metricValue = entry?.[field.key];
                return metricValue ? ` | ${field.label}: ${formatMetric(metricValue, field.unit)}` : "";
              }).join("");
              return `Peso: ${formatMetric(value, "kg")}${extraMetrics}`;
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
  setExportButtonState(list.length > 0);
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
    const row = createTableRow(entry);
    fragment.appendChild(row);
  }

  body.appendChild(fragment);
}

function createTableRow(entry) {
  const friendlyDate = formatTableDate(entry.date);

  if (elements.rowTemplate?.content) {
    const templateFragment = elements.rowTemplate.content.cloneNode(true);
    const row = templateFragment.querySelector("tr");
    if (row) {
      row.dataset.entryId = entry.id;
      row.dataset.date = entry.date;
      row.setAttribute("aria-selected", "false");

      const dateCell = row.querySelector(".table-cell-date");
      if (dateCell) {
        dateCell.textContent = friendlyDate;
      }
      const weightCell = row.querySelector(".table-cell-weight");
      if (weightCell) {
        weightCell.textContent = formatMetric(entry.weight, "kg");
      }
      for (const field of OPTIONAL_METRIC_FIELDS) {
        const cell = row.querySelector(field.tableClass);
        if (cell) {
          cell.textContent = formatOptionalMetric(entry[field.key], field.unit);
        }
      }

      const editButton = row.querySelector('button[data-action="edit"]');
      if (editButton) {
        editButton.dataset.entryId = entry.id;
        const editLabel = `Editar registro del ${friendlyDate}`;
        editButton.setAttribute("aria-label", editLabel);
        editButton.title = editLabel;
      }

      const deleteButton = row.querySelector('button[data-action="delete"]');
      if (deleteButton) {
        deleteButton.dataset.entryId = entry.id;
        const deleteLabel = `Eliminar registro del ${friendlyDate}`;
        deleteButton.setAttribute("aria-label", deleteLabel);
        deleteButton.title = deleteLabel;
      }

      return row;
    }
  }

  return createManualTableRow(entry, friendlyDate);
}

function createManualTableRow(entry, friendlyDate) {
  const row = document.createElement("tr");
  row.dataset.entryId = entry.id;
  row.dataset.date = entry.date;
  row.setAttribute("aria-selected", "false");

  const dateCell = createTableCell(friendlyDate);
  const weightCell = createTableCell(formatMetric(entry.weight, "kg"));
  const metricCells = OPTIONAL_METRIC_FIELDS.map(field =>
    createTableCell(formatOptionalMetric(entry[field.key], field.unit)),
  );
  const actionsCell = createTableActionsCell(entry.id, friendlyDate);

  row.append(dateCell, weightCell, ...metricCells, actionsCell);
  return row;
}

function createTableCell(content, className) {
  const cell = document.createElement("td");
  if (className) {
    cell.className = className;
  }
  cell.textContent = content;
  return cell;
}

function createTableActionsCell(entryId, friendlyDate) {
  const cell = document.createElement("td");
  cell.className = "table-actions-cell";

  const actions = document.createElement("div");
  actions.className = "table-actions";

  const editButton = createTableActionButton(
    "edit",
    entryId,
    "✏️",
    "Editar",
    `Editar registro del ${friendlyDate}`,
  );
  const deleteButton = createTableActionButton(
    "delete",
    entryId,
    "🗑️",
    "Eliminar",
    `Eliminar registro del ${friendlyDate}`,
  );
  deleteButton.classList.add("danger");

  actions.append(editButton, deleteButton);
  cell.appendChild(actions);
  return cell;
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

function createExportFileName() {
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${EXCEL_FILE_PREFIX}-registros-${year}${month}${day}.xlsx`;
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

function setExportButtonState(isEnabled) {
  if (!elements.exportButton) {
    return;
  }
  elements.exportButton.disabled = !isEnabled;
  elements.exportButton.setAttribute("aria-disabled", String(!isEnabled));
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
