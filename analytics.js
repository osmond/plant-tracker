const ctx = document.getElementById('et0Chart').getContext('2d');
let et0Chart;

function setDefaultDatesToCurrentWeek() {
  const today = new Date();
  const day = today.getDay(); // 0 = Sunday
  const start = new Date(today);
  start.setDate(today.getDate() - ((day + 6) % 7));
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const toISO = d => d.toISOString().split('T')[0];
  const startInput = document.getElementById('startDate');
  const endInput = document.getElementById('endDate');
  if (startInput && !startInput.value) startInput.value = toISO(start);
  if (endInput && !endInput.value) endInput.value = toISO(end);
}

const backLink = document.getElementById('backLink');
setDefaultDatesToCurrentWeek();

function drawChart(data) {
  const labels = data.map(r => r.date);
  const et0 = data.map(r => parseFloat(r.et0_mm));
  const water = data.map(r => parseFloat(r.water_ml));
  if (et0Chart) et0Chart.destroy();
  et0Chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'ET₀ (mm)',
          data: et0,
          yAxisID: 'y1',
          borderColor: '#4CAF50',
          fill: false,
        },
        {
          label: 'Water (mL)',
          data: water,
          yAxisID: 'y2',
          borderColor: '#2196F3',
          fill: true,
          backgroundColor: 'rgba(33,150,243,0.2)'
        }
      ]
    },
    options: {
      scales: {
        y1: { type: 'linear', position: 'left' },
        y2: { type: 'linear', position: 'right' }
      },
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom' } }
    }
  });
}

function drawHeatmap(data) {
  const container = document.getElementById('heatmap');
  container.innerHTML = '';
  if (data.length === 0) return;
  const maxEt0 = Math.max(...data.map(r => parseFloat(r.et0_mm)));
  data.forEach((row, idx) => {
    const cell = document.createElement('div');
    const pct = parseFloat(row.et0_mm) / maxEt0;
    const hue = 120 - (pct * 120);
    cell.style.cssText = `width:12px;height:12px;margin:1px;background:hsl(${hue},60%,50%);display:inline-block;`;
    container.appendChild(cell);
    if ((idx + 1) % 7 === 0) container.appendChild(document.createElement('br'));
  });
}

function fillTable(data) {
  const tbl = document.getElementById('dataTable');
  tbl.innerHTML = '';
  if (data.length === 0) return;
  const thead = document.createElement('thead');
  thead.className = 'bg-gray-50';
  thead.innerHTML =
    '<tr><th class="px-3 py-2 text-left">Date</th><th class="px-3 py-2 text-left">ET₀ (mm)</th><th class="px-3 py-2 text-left">Water (mL)</th></tr>';
  tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  data.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td class="px-3 py-2 border-b border-gray-200">${r.date}</td>` +
      `<td class="px-3 py-2 border-b border-gray-200">${r.et0_mm}</td>` +
      `<td class="px-3 py-2 border-b border-gray-200">${r.water_ml}</td>`;
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
}

async function loadTimeseries() {
  const plantId = document.getElementById('plantSelect').value;
  if (!plantId) return;
  const start = document.getElementById('startDate').value;
  const end = document.getElementById('endDate').value;
  let days = 30;
  if (start && end) {
    const s = new Date(start);
    const e = new Date(end);
    days = Math.max(1, Math.ceil((e - s) / 86400000) + 1);
  }
  const res = await fetch(`api/get_et0_timeseries.php?plant_id=${plantId}&days=${days}`);
  if (!res.ok) return;
  const data = await res.json();
  drawChart(data);
  drawHeatmap(data);
  fillTable(data);
}

async function loadPlants() {
  const res = await fetch('api/get_plants.php');
  if (!res.ok) return;
  const plants = await res.json();
  const sel = document.getElementById('plantSelect');
  plants.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    sel.appendChild(opt);
  });
}

document.getElementById('refresh').addEventListener('click', loadTimeseries);
loadPlants();
