const ctx = document.getElementById('chart').getContext('2d');
let data = JSON.parse(localStorage.getItem("entries")) || [];

const chart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: data.map(d => d.date),
    datasets: [{
      label: 'Peso (kg)',
      data: data.map(d => d.weight),
      borderColor: 'blue',
      fill: false
    }]
  }
});

document.getElementById("form").addEventListener("submit", e => {
  e.preventDefault();
  const date = document.getElementById("date").value;
  const weight = parseFloat(document.getElementById("weight").value);
  const waist = parseFloat(document.getElementById("waist").value) || null;
  const chest = parseFloat(document.getElementById("chest").value) || null;

  data.push({date, weight, waist, chest});
  localStorage.setItem("entries", JSON.stringify(data));

  chart.data.labels.push(date);
  chart.data.datasets[0].data.push(weight);
  chart.update();

  e.target.reset();
});
