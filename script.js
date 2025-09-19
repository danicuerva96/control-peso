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
  clearButton: document.querySelector("#clear-data"),
  chartCanvas: document.querySelector("#chart"),
  tableBody: document.querySelector("#entries-table-body"),
  tableEmptyState: document.querySelector("#entries-empty-state"),
};

if (!elements.form) {
  throw new Error("No se encontro el formulario principal.");
}

const entries = loadEntries();
const chart = initialiseChart(elements.chartCanvas);
refreshAll(entries);

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
  refreshAll(entries);
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
  refreshAll(entries);

  event.currentTarget.reset();
  elements.date?.focus();
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
  const weight = parseMetric(item.weight);

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
    return;
  }

  emptyState.classList.remove("is-visible");
  const fragment = document.createDocumentFragment();

  for (const entry of list) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${formatTableDate(entry.date)}</td>
      <td>${formatMetric(entry.weight, "kg")}</td>
      <td>${formatOptionalMetric(entry.waist, "cm")}</td>
      <td>${formatOptionalMetric(entry.chest, "cm")}</td>
    `;
    fragment.appendChild(row);
  }

  body.appendChild(fragment);
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

  const confirmed = window.confirm("Seguro que quieres borrar todos los registros?");
  if (!confirmed) {
    return;
  }

  entries.splice(0, entries.length);
  persistEntries(entries);
  refreshAll(entries);
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
