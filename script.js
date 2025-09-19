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
  const accentBright = "#60a5fa";

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
            return createFillGradient(chart) ?? "rgba(37, 99, 235, 0.18)";
          },
          fill: true,
          tension: 0.46,
          borderWidth: 3,
          borderCapStyle: "round",
          borderJoinStyle: "round",
          clip: 12,
          pointRadius(context) {
            const points = context.chart?.data?.datasets?.[context.datasetIndex]?.data ?? [];
            return context.dataIndex === points.length - 1 ? 6 : 4.5;
          },
          pointHoverRadius: 8,
          pointBackgroundColor(context) {
            const points = context.chart?.data?.datasets?.[context.datasetIndex]?.data ?? [];
            const isLastPoint = context.dataIndex === points.length - 1;
            return isLastPoint ? accentDark : "#ffffff";
          },
          pointBorderColor(context) {
            const points = context.chart?.data?.datasets?.[context.datasetIndex]?.data ?? [];
            const isLastPoint = context.dataIndex === points.length - 1;
            return isLastPoint ? accentBright : accentDark;
          },
          pointBorderWidth(context) {
            const points = context.chart?.data?.datasets?.[context.datasetIndex]?.data ?? [];
            return context.dataIndex === points.length - 1 ? 3 : 2;
          },
          pointHoverBackgroundColor: accentDark,
          pointHoverBorderColor: "#ffffff",
          pointHoverBorderWidth: 2,
          pointHitRadius: 14,
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
          left: 12,
          right: 20,
          top: 16,
          bottom: 16,
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            usePointStyle: true,
            padding: 18,
            boxWidth: 12,
            boxHeight: 12,
            color: "#1e293b",
            font: {
              size: 13,
              weight: "600",
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.92)",
          borderColor: "rgba(59, 130, 246, 0.4)",
          borderWidth: 1,
          titleFont: {
            size: 13,
            weight: "600",
          },
          bodyFont: {
            size: 13,
          },
          titleColor: "#bfdbfe",
          bodyColor: "#e2e8f0",
          padding: 14,
          displayColors: false,
          cornerRadius: 12,
          caretPadding: 8,
          caretSize: 7,
          callbacks: {
            title(context) {
              const entry = entries[context[0]?.dataIndex ?? 0];
              return entry ? formatTableDate(entry.date) : context[0]?.label;
            },
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
          border: {
            display: false,
          },
          grid: {
            color: "rgba(148, 163, 184, 0.14)",
            drawBorder: false,
            drawTicks: false,
            borderDash: [6, 6],
          },
          ticks: {
            color: "#475569",
            font: {
              weight: "600",
            },
            padding: 10,
            maxRotation: 0,
            autoSkipPadding: 18,
          },
        },
        y: {
          beginAtZero: false,
          grace: "6%",
          border: {
            display: false,
          },
          grid: {
            color: "rgba(148, 163, 184, 0.18)",
            drawBorder: false,
            drawTicks: false,
            borderDash: [4, 6],
          },
          ticks: {
            color: "#475569",
            padding: 10,
            font: {
              weight: "600",
            },
            callback(value) {
              const numericValue = typeof value === "number" ? value : Number(value);
              return Number.isFinite(numericValue) ? numberFormatter.format(numericValue) : value;
            },
          },
        },
      },
      animations: {
        tension: {
          duration: 800,
          easing: "easeOutQuad",
        },
        radius: {
          duration: 200,
          easing: "easeOutQuad",
        },
      },
    },
    plugins: [createBackgroundPlugin(), createShadowPlugin(accentDark)],
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

function createBackgroundPlugin() {
  return {
    id: "gradientBackground",
    beforeDraw(chart) {
      const { ctx, chartArea } = chart;
      if (!chartArea) {
        return;
      }

      const { left, right, top, bottom } = chartArea;
      const width = right - left;
      const height = bottom - top;

      ctx.save();
      const gradient = ctx.createLinearGradient(0, bottom, 0, top);
      gradient.addColorStop(0, "rgba(37, 99, 235, 0.05)");
      gradient.addColorStop(0.6, "rgba(96, 165, 250, 0.08)");
      gradient.addColorStop(1, "rgba(59, 130, 246, 0.16)");

      ctx.fillStyle = gradient;
      ctx.fillRect(left, top, width, height);

      const radial = ctx.createRadialGradient(right, top, 0, right, top, width);
      radial.addColorStop(0, "rgba(168, 85, 247, 0.18)");
      radial.addColorStop(1, "rgba(168, 85, 247, 0)");
      ctx.fillStyle = radial;
      ctx.fillRect(left, top, width, height);

      ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
      ctx.lineWidth = 1;
      ctx.strokeRect(left, top, width, height);
      ctx.restore();
    },
  };
}

function createShadowPlugin(color) {
  return {
    id: "lineShadow",
    beforeDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 7;
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
  gradient.addColorStop(0.5, "#3b82f6");
  gradient.addColorStop(1, "#7c3aed");
  return gradient;
}

function createFillGradient(chart) {
  const { ctx, chartArea } = chart;
  if (!chartArea) {
    return null;
  }

  const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.28)");
  gradient.addColorStop(0.55, "rgba(37, 99, 235, 0.16)");
  gradient.addColorStop(1, "rgba(37, 99, 235, 0.02)");
  return gradient;
}
