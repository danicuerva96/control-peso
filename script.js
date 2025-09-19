const STORAGE_KEY = "controlPeso.entries";
const NUMBER_PRECISION = 1;
const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" });

const elements = {
  form: document.querySelector("#entry-form"),
  date: document.querySelector("#date"),
  weight: document.querySelector("#weight"),
  waist: document.querySelector("#waist"),
  chest: document.querySelector("#chest"),
  clearButton: document.querySelector("#clear-data"),
  chartCanvas: document.querySelector("#chart"),
};

if (!elements.form) {
  throw new Error("No se encontro el formulario principal.");
}

const entries = loadEntries();
const chart = initialiseChart(elements.chartCanvas);
refreshChart(chart, entries);

elements.form.addEventListener("submit", handleSubmit);
if (elements.clearButton) {
  elements.clearButton.addEventListener("click", handleClearAll);
}

window.addEventListener("storage", event => {
  if (event.key !== STORAGE_KEY) {
    return;
  }
  const updatedEntries = loadEntries();
  entries.splice(0, entries.length, ...updatedEntries);
  refreshChart(chart, entries);
});

function handleSubmit(event) {
  event.preventDefault();

  if (!elements.form.reportValidity()) {
    return;
  }

  const entry = createEntryFromForm();
  if (!entry) {
    return;
  }

  upsertEntry(entries, entry);
  persistEntries(entries);
  refreshChart(chart, entries);

  event.currentTarget.reset();
  elements.date?.focus();
}

function createEntryFromForm() {
  const dateValue = elements.date?.value ?? "";
  const weightValue = parseMetric(elements.weight?.value, { required: true });

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

function parseMetric(rawValue, { required = false } = {}) {
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
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normaliseStoredEntry)
      .filter(Boolean)
      .sort(compareByDate);
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
  const weight = parseMetric(item.weight, { required: true });

  if (!date || weight === null) {
    return null;
  }

  return {
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

function upsertEntry(list, entry) {
  const index = list.findIndex(item => item.date === entry.date);
  if (index >= 0) {
    list[index] = entry;
  } else {
    list.push(entry);
  }
  list.sort(compareByDate);
}

function compareByDate(a, b) {
  return a.date.localeCompare(b.date);
}

function initialiseChart(canvas) {
  if (!canvas) {
    return null;
  }

  if (typeof Chart === "undefined") {
    console.warn("Chart.js no esta disponible; se omite la visualizacion del grafico.");
    return null;
  }

  return new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Peso (kg)",
          data: [],
          borderColor: "#0d47a1",
          backgroundColor: "rgba(13, 71, 161, 0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
          pointHoverRadius: 6,
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
      plugins: {
        legend: {
          display: true,
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y ?? 0;
              const entry = entries[context.dataIndex];
              const waist = entry?.waist ? ` | Cintura: ${entry.waist} cm` : "";
              const chest = entry?.chest ? ` | Pecho: ${entry.chest} cm` : "";
              return `Peso: ${value} kg${waist}${chest}`;
            },
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Fecha",
          },
        },
        y: {
          title: {
            display: true,
            text: "Peso (kg)",
          },
          beginAtZero: false,
        },
      },
    },
  });
}

function refreshChart(instance, list) {
  if (!instance) {
    setClearButtonState(list.length > 0);
    return;
  }

  instance.data.labels = list.map(entry => formatChartLabel(entry.date));
  instance.data.datasets[0].data = list.map(entry => entry.weight);
  instance.update("none");
  setClearButtonState(list.length > 0);
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

  const confirmed = window.confirm("Seguro que quieres borrar todos los registros?");
  if (!confirmed) {
    return;
  }

  entries.splice(0, entries.length);
  persistEntries(entries);
  refreshChart(chart, entries);
}

function setClearButtonState(isEnabled) {
  if (!elements.clearButton) {
    return;
  }
  elements.clearButton.disabled = !isEnabled;
  elements.clearButton.setAttribute("aria-disabled", String(!isEnabled));
}


