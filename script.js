let editingPlantId = null;
let lastDeletedPlant = null;
let deleteTimer = null;

let currentFormStep = 1;

// track weather info so the summary can include current conditions
let currentWeather = null;
let currentWeatherIcon = null;
let currentWeatherDesc = null;

// public OpenWeather API key provided by user
const WEATHER_API_KEY = '2aa3ade8428368a141f7951420570c16';

// number of milliliters in one US fluid ounce
const ML_PER_US_FL_OUNCE = 29.5735;

// starting date for the calendar view
let calendarStartDate = new Date();
calendarStartDate.setHours(0, 0, 0, 0);

// map room names to generated colors so tags remain consistent
const roomColors = {};
function colorForRoom(room) {
  if (!room) return 'var(--color-accent)';
  if (!roomColors[room]) {
    let hash = 0;
    for (let i = 0; i < room.length; i++) {
      hash = room.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    // use a darker lightness so the white tag text stays readable
    roomColors[room] = `hsl(${hue}, 60%, 45%)`;
  }
  return roomColors[room];
}

function borderColorForRoom(room) {
  if (!room) return 'var(--color-accent)';
  let hash = 0;
  for (let i = 0; i < room.length; i++) {
    hash = room.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  // slightly darker than the fill color
  return `hsl(${hue}, 60%, 35%)`;
}

function parseWaterAmount(value) {
  let amt = parseFloat(value);
  if (isNaN(amt)) return NaN;
  if (/ml/i.test(value)) {
    return amt;
  }
  // assume ounces if units are omitted or specified as oz
  return amt * ML_PER_US_FL_OUNCE;
}

function formatWaterAmount(ml) {
  const ounces = ml / ML_PER_US_FL_OUNCE;
  const mlDisplay = Math.round(ml);
  const ozDisplay = ounces.toFixed(1).replace(/\.0$/, '');
  return `<span class="oz-line">${ozDisplay}oz</span>` +
         `<span class="ml-line">(${mlDisplay} ml)</span>`;
}

const ICONS = {
  trash: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  water: '<svg class="icon icon-water" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',

  fert: '<svg class="icon icon-sprout" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" fill="currentColor"><path d="M512 32c0 113.6-84.6 207.5-194.2 222c-7.1-53.4-30.6-101.6-65.3-139.3C290.8 46.3 364 0 448 0l32 0c17.7 0 32 14.3 32 32zM0 96C0 78.3 14.3 64 32 64l32 0c123.7 0 224 100.3 224 224l0 32 0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160C100.3 320 0 219.7 0 96z"/></svg>',
  plant: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.4 1.7c.217.289.65.84 1.725 1.274 1.093.44 2.885.774 5.834.528 2.02-.168 3.431.51 4.326 1.556C14.161 6.082 14.5 7.41 14.5 8.5q0 .344-.027.734C13.387 8.252 11.877 7.76 10.39 7.5c-2.016-.288-4.188-.445-5.59-2.045-.142-.162-.402-.102-.379.112.108.985 1.104 1.82 1.844 2.308 2.37 1.566 5.772-.118 7.6 3.071.505.8 1.374 2.7 1.75 4.292.07.298-.066.611-.354.715a.7.7 0 0 1-.161.042 1 1 0 0 1-1.08-.794c-.13-.97-.396-1.913-.868-2.77C12.173 13.386 10.565 14 8 14c-1.854 0-3.32-.544-4.45-1.435-1.124-.887-1.889-2.095-2.39-3.383-1-2.562-1-5.536-.65-7.28L.73.806z"/></svg>',

  plus: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  cancel: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  undo: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  check: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  ,photo: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
  ,sun: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
  ,search: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
  ,calendar: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
};

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  clearTimeout(toast.hideTimeout);
  toast.hideTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// --- filter preference helpers ---
function saveFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('due-filter');
  if (rf) localStorage.setItem('roomFilter', rf.value);
  if (sf) localStorage.setItem('sortPref', sf.value);
  if (df) localStorage.setItem('dueFilter', df.value);
}

function loadFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('due-filter');
  const rVal = localStorage.getItem('roomFilter');
  const sVal = localStorage.getItem('sortPref');
  const dVal = localStorage.getItem('dueFilter');
  if (rf && rVal !== null) rf.value = rVal;
  if (sf && sVal !== null) sf.value = sVal;
  if (df && dVal !== null) df.value = dVal;
}

function clearFilterPrefs() {
  localStorage.removeItem('roomFilter');
  localStorage.removeItem('sortPref');
  localStorage.removeItem('dueFilter');
}

// expose so it can be called externally
window.clearFilterPrefs = clearFilterPrefs;

// --- validation, date math, due-date helpers ---
function validateForm(form) {
  let valid = true;
  document.querySelectorAll('.error').forEach(el => el.textContent = '');

  const requiredFields = ['name', 'species', 'watering_frequency'];
  requiredFields.forEach(field => {
    const input = form.querySelector(`[name="${field}"]`);
    if (!input.value.trim()) {
      const errorDiv = document.getElementById(`${field}-error`);
      if (errorDiv) errorDiv.textContent = 'This field is required.';
      valid = false;
    }
  });

  // additional constraints
  const species = form.querySelector('[name="species"]');
  if (species && species.value.trim() &&
      !/^[A-Za-z0-9\s-]{1,100}$/.test(species.value.trim())) {
    document.getElementById('species-error').textContent =
      'Invalid characters or too long.';
    valid = false;
  }

  const room = form.querySelector('[name="room"]');
  if (room && room.value.trim() &&
      !/^[A-Za-z0-9\s-]{1,50}$/.test(room.value.trim())) {
    document.getElementById('room-error').textContent =
      'Invalid characters or too long.';
    valid = false;
  }

  const waterFreq = form.querySelector('[name="watering_frequency"]');
  if (waterFreq) {
    const n = parseInt(waterFreq.value, 10);
    if (isNaN(n) || n < 1 || n > 365) {
      document.getElementById('watering_frequency-error').textContent =
        'Enter a value between 1 and 365.';
      valid = false;
    }
  }

  const waterAmtField = form.water_amount;
  if (waterAmtField) {
    const amt = parseWaterAmount(waterAmtField.value);
    if (waterAmtField.value.trim() === '' || isNaN(amt) || amt <= 0) {
      const errorDiv = document.getElementById('water_amount-error');
      if (errorDiv) errorDiv.textContent = 'Enter a positive number.';
      valid = false;
    }
  }

  return valid;
}

function validateCurrentStep(step) {
  const form = document.getElementById('plant-form');
  if (!form) return false;
  let valid = true;
  document.querySelectorAll('.error').forEach(el => el.textContent = '');
  const stepEl = form.querySelector(`.form-step[data-step="${step}"]`);
  if (!stepEl) return true;
  stepEl.querySelectorAll('input').forEach(inp => {
    if (inp.name === 'watering_frequency' || inp.name === 'water_amount') return; // skip step2 fields in step1
    if (inp.required && !inp.value.trim()) {
      const err = document.getElementById(`${inp.name}-error`);
      if (err) err.textContent = 'This field is required.';
      valid = false;
    }
  });
  return valid;
}

function parseLocalDate(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(date);
}

function addDays(date, days) {
  const d = parseLocalDate(date);
  const incr = parseInt(days, 10);
  if (!isNaN(incr)) {
    d.setDate(d.getDate() + incr);
  }
  return d;
}

function formatDateShort(dateStr) {
  if (!dateStr) return 'never';
  const d = parseLocalDate(dateStr);
  if (isNaN(d)) return dateStr;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayToFormat = new Date(d);
  dayToFormat.setHours(0, 0, 0, 0);
  const diff = Math.round((dayToFormat - today) / 86400000);
  if (diff === 0) return 'today';
  if (diff === -1) return 'yesterday';
  if (diff === 1) return 'tomorrow';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getSoonestDueDate(plant) {
  const waterDate = plant.last_watered
    ? addDays(parseLocalDate(plant.last_watered), plant.watering_frequency)
    : null;
  const fertDate = plant.last_fertilized && plant.fertilizing_frequency
    ? addDays(parseLocalDate(plant.last_fertilized), plant.fertilizing_frequency)
    : null;

  if (waterDate && fertDate) return waterDate < fertDate ? waterDate : fertDate;
  return waterDate || fertDate || new Date(8640000000000000);
}

function needsWatering(plant, today = new Date()) {
  if (!plant.last_watered) return true;
  const next = addDays(parseLocalDate(plant.last_watered), plant.watering_frequency);
  return next <= today;
}

function needsFertilizing(plant, today = new Date()) {
  if (!plant.fertilizing_frequency) return false;
  if (!plant.last_fertilized) return true;
  const next = addDays(parseLocalDate(plant.last_fertilized), plant.fertilizing_frequency);
  return next <= today;
}

function waterOverdueDays(plant, today = new Date()) {
  if (!plant.last_watered) return Infinity;
  const next = addDays(parseLocalDate(plant.last_watered), plant.watering_frequency);
  const diffMs = today - next;
  return Math.floor(diffMs / 86400000);
}

// --- calendar helpers ---
function getNextWaterDate(plant) {
  if (!plant.last_watered) return new Date();
  return addDays(parseLocalDate(plant.last_watered), plant.watering_frequency);
}

function getNextFertDate(plant) {
  if (!plant.fertilizing_frequency) return null;
  if (!plant.last_fertilized) return new Date();
  return addDays(parseLocalDate(plant.last_fertilized), plant.fertilizing_frequency);
}

async function loadCalendar() {
  const res = await fetch('api/get_plants.php');
  const plants = await res.json();
  const container = document.getElementById('calendar');
  if (!container) return;
  const daysToShow = 7;
  const start = new Date(calendarStartDate);
  start.setHours(0,0,0,0);
  container.innerHTML = '';

  const dayEls = [];
  for (let i=0;i<daysToShow;i++) {
    const d = addDays(start,i);
    const dayEl = document.createElement('div');
    dayEl.classList.add('cal-day');
    dayEl.dataset.date = d.toISOString().split('T')[0];
    dayEl.innerHTML = `<div class="cal-day-header">${d.toLocaleDateString(undefined,{weekday:'short',month:'numeric',day:'numeric'})}</div>`;
    dayEl.addEventListener('dragover',e=>e.preventDefault());
    dayEl.addEventListener('drop',e=>handleDrop(e, dayEl.dataset.date, plants));
    container.appendChild(dayEl);
    dayEls.push(dayEl);
  }

  function addEvent(plant,type,date) {
    const dateStr = date.toISOString().split('T')[0];
    const dayEl = container.querySelector(`.cal-day[data-date="${dateStr}"]`);
    if (!dayEl) return;
    const ev = document.createElement('div');
    ev.classList.add('cal-event', type === 'water' ? 'water-due' : 'fert-due');
    ev.innerHTML =
      (type === 'water' ? ICONS.water : ICONS.fert) + ' ' + plant.name;
    ev.draggable = true;
    ev.dataset.id = plant.id;
    ev.dataset.type = type;
    ev.dataset.date = dateStr;
    ev.addEventListener('dragstart',e=>{
      e.dataTransfer.setData('text/plain', JSON.stringify({id:plant.id,type,date:dateStr}));
    });
    dayEl.appendChild(ev);
  }

  plants.forEach(p=>{
    const w = getNextWaterDate(p);
    addEvent(p,'water',w);
    const f = getNextFertDate(p);
    if (f) addEvent(p,'fert',f);
  });

  loadHeatmap(plants);
}

async function loadHeatmap(plantsData) {
  const plants = plantsData || (await (await fetch('api/get_plants.php')).json());
  const container = document.getElementById('heatmap');
  if (!container) return;
  const days = 28;
  const start = new Date();
  start.setHours(0,0,0,0);
  const counts = new Array(days).fill(0);
  plants.forEach(p => {
    const w = getNextWaterDate(p);
    let diff = Math.floor((w - start) / 86400000);
    if (diff >= 0 && diff < days) counts[diff]++;
    const f = getNextFertDate(p);
    if (f) {
      diff = Math.floor((f - start) / 86400000);
      if (diff >= 0 && diff < days) counts[diff]++;
    }
  });
  container.innerHTML = '';
  for (let i=0;i<days;i++) {
    const cell = document.createElement('div');
    cell.classList.add('heat-cell');
    const level = counts[i] >= 3 ? 3 : counts[i];
    cell.classList.add(`level-${level}`);
    const date = addDays(start,i);
    cell.title = `${date.toLocaleDateString()} - ${counts[i]} task${counts[i]!==1?'s':''}`;
    container.appendChild(cell);
  }
}

async function handleDrop(e,newDate,plants) {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
  const plant = plants.find(p=>p.id==data.id);
  if (!plant) return;
  const drop = parseLocalDate(newDate);
  if (data.type==='water') {
    const newLast = addDays(drop,-plant.watering_frequency).toISOString().split('T')[0];
    await updatePlantInline(plant,'last_watered',newLast);
    plant.last_watered = newLast;
  } else {
    const newLast = addDays(drop,-plant.fertilizing_frequency).toISOString().split('T')[0];
    await updatePlantInline(plant,'last_fertilized',newLast);
    plant.last_fertilized = newLast;
  }
  loadCalendar();
  loadPlants();
}

// --- mark watered/fertilized / snooze ---
async function markAction(id, type, days = 0) {
  window.lastUpdatedPlantId = id;
  try {
    const resp = await fetch(`api/mark_${type}.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id=${id}&snooze_days=${days}`
    });
    if (!resp.ok) {
      throw new Error(`Request failed with status ${resp.status}`);
    }
    loadPlants();
    loadCalendar();
  } catch (err) {
    console.error('Failed to mark action:', err);
    showToast('Failed to update plant. Please try again.', true);
  }
}

// --- undo-delete snackbar ---
function showUndoBanner(plant) {
  lastDeletedPlant = plant;
  const banner = document.getElementById('undo-banner');
  banner.classList.add('show');
  clearTimeout(deleteTimer);
  deleteTimer = setTimeout(async () => {
    await fetch('api/delete_plant.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id=${plant.id}`
    });
    banner.classList.remove('show');
    lastDeletedPlant = null;
    loadPlants();
    loadCalendar();
  }, 5000);
}

// --- inline update helper ---
async function updatePlantInline(plant, field, newValue) {
  const data = new FormData();
  // send full payload to match existing PHP
  data.append('id', plant.id);
  data.append('name', plant.name);
  data.append('species', plant.species);
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('water_amount', plant.water_amount);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');
  data.append('photo_url', plant.photo_url || '');

  data.set(field, newValue);

  const resp = await fetch('api/update_plant.php', {
    method: 'POST',
    body: data
  });
  if (!resp.ok) {
    let msg = 'Failed to save change';
    try {
      const err = await resp.json();
      if (err && err.error) msg = err.error;
    } catch (e) {}
    showToast(msg, true);
  } else {
    loadPlants();
    loadCalendar();
  }
}

async function updatePlantPhoto(plant, file) {
  const data = new FormData();
  data.append('id', plant.id);
  data.append('name', plant.name);
  data.append('species', plant.species);
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('water_amount', plant.water_amount);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');
  data.append('photo', file);

  const resp = await fetch('api/update_plant.php', { method: 'POST', body: data });
  if (!resp.ok) {
    showToast('Failed to update photo', true);
  } else {
    window.lastUpdatedPlantId = plant.id;
    loadPlants();
  }
}

// --- weather helper ---
function fetchWeather() {
  const addWeather = (temp, desc, icon) => {
    currentWeather = `${temp}°F ${desc}`;
    currentWeatherIcon = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    currentWeatherDesc = desc;
    const titleIcon = document.getElementById('title-weather-icon');
    if (titleIcon) {
      titleIcon.src = currentWeatherIcon;
      titleIcon.alt = currentWeatherDesc;
      titleIcon.style.display = '';
    }
    loadPlants();
  };

  const fetchByCoords = async (lat, lon) => {
    try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${WEATHER_API_KEY}`);
      if (!res.ok) return;
      const data = await res.json();
      addWeather(Math.round(data.main.temp), data.weather[0].main, data.weather[0].icon);
    } catch (e) {
      console.error('Weather fetch failed', e);
    }
  };

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      pos => fetchByCoords(pos.coords.latitude, pos.coords.longitude),
      () => fetchByCoords(40.71, -74.01)
    );
  } else {
    fetchByCoords(40.71, -74.01);
  }
}

// --- full-form populate & reset for edit ---
function populateForm(plant) {
  const form = document.getElementById('plant-form');
  form.name.value = plant.name;
  form.species.value = plant.species;
  form.watering_frequency.value = plant.watering_frequency;
  if (form.water_amount) {
    form.water_amount.value = plant.water_amount;
  }
  form.fertilizing_frequency.value = plant.fertilizing_frequency;
  form.room.value = plant.room;
  form.last_watered.value = plant.last_watered;
  form.last_fertilized.value = plant.last_fertilized;
  editingPlantId = plant.id;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.innerHTML = ICONS.check + '<span class="visually-hidden">Update Plant</span>';
  document.getElementById('cancel-edit').style.display = 'inline-block';
  showFormStep(1);
}

function resetForm() {
  const form = document.getElementById('plant-form');
  form.reset();
  if (form.water_amount) form.water_amount.value = '';
  editingPlantId = null;
  form.querySelector('button[type="submit"]').innerHTML = ICONS.plus + '<span class="visually-hidden">Add Plant</span>';
  document.getElementById('cancel-edit').style.display = 'none';
  document.getElementById('search-input').value = '';
  form.style.display = 'none';
  const btn = document.getElementById('show-add-form');
  if (btn) btn.style.display = 'inline-block';
  showFormStep(1);
}

function showFormStep(step) {
  const form = document.getElementById('plant-form');
  if (!form) return;
  const steps = form.querySelectorAll('.form-step');
  currentFormStep = Math.max(1, Math.min(step, steps.length));
  steps.forEach((el, idx) => {
    if (idx === currentFormStep - 1) el.classList.remove('hidden');
    else el.classList.add('hidden');
  });
  const progress = document.getElementById('form-progress');
  if (progress) progress.textContent = `Step ${currentFormStep} of ${steps.length}`;
  const prev = document.getElementById('prev-step');
  const next = document.getElementById('next-step');
  const submit = document.getElementById('submit-btn');
  if (prev) prev.style.display = currentFormStep === 1 ? 'none' : 'inline-block';
  if (next) next.style.display = currentFormStep === steps.length ? 'none' : 'inline-block';
  if (submit) submit.style.display = currentFormStep === steps.length ? 'inline-block' : 'none';
}

// --- main render & filter loop ---
async function loadPlants() {
  const res = await fetch('api/get_plants.php');
  const plants = await res.json();
  const list = document.getElementById('plant-grid');
  const selectedRoom = document.getElementById('room-filter').value;
  const dueFilter = document.getElementById('due-filter')
    ? document.getElementById('due-filter').value
    : 'all';
  const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
  const today = new Date();
  const todayStr = today.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const startOfToday = new Date(today);
  startOfToday.setHours(0,0,0,0);
  const startOfTomorrow = addDays(startOfToday,1);

  list.innerHTML = '';
  const filtered = plants.filter(plant => {
    if (selectedRoom !== 'all' && plant.room !== selectedRoom) return false;
    const haystack = (plant.name + ' ' + plant.species).toLowerCase();
    if (searchQuery && !haystack.includes(searchQuery)) return false;

    const waterDue = needsWatering(plant, today);
    const fertDue = needsFertilizing(plant, today);
    if (dueFilter === 'water' && !waterDue) return false;
    if (dueFilter === 'fert' && !fertDue) return false;
    if (dueFilter === 'any' && !(waterDue || fertDue)) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="no-results">No plants match your filters.</p>';
  }

  // summary of due counts and totals for filtered plants
  let wateringDue = 0, fertilizingDue = 0;
  const totalPlants = filtered.length;
  filtered.forEach(p => {
    if (p.last_watered) {
      const nxt = addDays(new Date(p.last_watered), p.watering_frequency);
      if (nxt <= today) wateringDue++;
    }
    if (p.last_fertilized && p.fertilizing_frequency) {
      const nxt = addDays(new Date(p.last_fertilized), p.fertilizing_frequency);
      if (nxt <= today) fertilizingDue++;
    }
  });
  const summaryEl = document.getElementById('summary');
  summaryEl.innerHTML = '';
  const row1 = document.createElement('div');
  row1.classList.add('summary-row');
  const row1Items = [
    `${ICONS.plant} ${totalPlants} plants`,
    `${ICONS.water} ${wateringDue} need watering`,
    `${ICONS.fert} ${fertilizingDue} need fertilizing`
  ];
  row1Items.forEach(text => {
    const span = document.createElement('span');
    span.classList.add('summary-item');
    span.innerHTML = text;
    row1.appendChild(span);
  });

  const row2 = document.createElement('div');
  row2.classList.add('summary-row');
  const row2Items = [];
  row2Items.push(`${ICONS.calendar} ${todayStr}`);
  if (currentWeather) {
    row2Items.push(`${currentWeather}`);
  }
  row2Items.forEach(text => {
    const span = document.createElement('span');
    span.classList.add('summary-item');
    span.innerHTML = text;
    row2.appendChild(span);
  });

  summaryEl.appendChild(row1);
  summaryEl.appendChild(row2);
  summaryEl.classList.add('show');

  const sortBy = document.getElementById('sort-toggle').value || 'name';
  filtered.sort((a, b) =>
    sortBy === 'due'
      ? getSoonestDueDate(a) - getSoonestDueDate(b)
      : a.name.localeCompare(b.name)
  );

  filtered.forEach(plant => {
    const card = document.createElement('div');
    card.classList.add('plant-card', 'shadow');
    if (plant.id === window.lastUpdatedPlantId) {
      card.classList.add('just-updated');
      setTimeout(() => card.classList.remove('just-updated'), 2000);
    }
    const soonest = getSoonestDueDate(plant);
    let urgencyClass = '';
    let urgencyText = '';
    if (soonest < startOfToday) {
      card.classList.add('due-overdue');
      urgencyClass = 'urgency-overdue';
      urgencyText = 'Overdue';
    } else if (soonest < startOfTomorrow) {
      card.classList.add('due-today');
      urgencyClass = 'urgency-today';
      urgencyText = 'Due Today';
    } else {
      card.classList.add('due-future');
      urgencyClass = 'urgency-future';
      urgencyText = 'Upcoming';
    }

    const urgencyTag = document.createElement('span');
    urgencyTag.classList.add('urgency-tag', urgencyClass);
    urgencyTag.textContent = urgencyText;
    card.appendChild(urgencyTag);

    const img = document.createElement('img');
    img.src = plant.photo_url || 'https://jonosmond.com/plant-tracker/placeholder.png';
    if (plant.photo_url) {
      img.alt = plant.name;
    } else {
      img.alt = 'No photo available for ' + plant.name;
    }
    img.loading = 'lazy';
    img.classList.add('plant-photo');
    card.appendChild(img);
    const titleEl = document.createElement('h3');
    titleEl.classList.add('plant-title');
    titleEl.textContent = plant.name;
    card.appendChild(titleEl);

    const speciesEl = document.createElement('div');
    speciesEl.classList.add('plant-species');
    speciesEl.textContent = plant.species;
    card.appendChild(speciesEl);

    const tagList = document.createElement('div');
    tagList.classList.add('tag-list');
    if (plant.room) {
      const roomTag = document.createElement('span');
      roomTag.classList.add('tag', 'room-tag');
      roomTag.textContent = plant.room;
      roomTag.style.backgroundColor = colorForRoom(plant.room);
      roomTag.style.borderColor = borderColorForRoom(plant.room);
      tagList.appendChild(roomTag);
    }
    const ml = parseFloat(plant.water_amount);
    if (!isNaN(ml) && ml > 0) {
        const ozTag = document.createElement('span');
        ozTag.classList.add('tag', 'oz-tag');
        ozTag.textContent = `${(ml / ML_PER_US_FL_OUNCE).toFixed(1).replace(/\.0$/, '')}oz`;
        tagList.appendChild(ozTag);

        const mlTag = document.createElement('span');
        mlTag.classList.add('tag', 'ml-tag');
        mlTag.textContent = `${Math.round(ml)} ml`;
        tagList.appendChild(mlTag);
      }
    if (tagList.childElementCount > 0) {
      card.appendChild(tagList);
    }

    const summary = document.createElement('div');
    summary.classList.add('plant-summary');

    const waterSpan = document.createElement('span');
    waterSpan.classList.add('summary-item');
    waterSpan.innerHTML =
      ICONS.water + ` water every ${plant.watering_frequency} days`;
    summary.appendChild(waterSpan);

    const fertSpan = document.createElement('span');
    fertSpan.classList.add('summary-item');
    const fertFreq = plant.fertilizing_frequency
      ? `${plant.fertilizing_frequency} days`
      : 'N/A';
    fertSpan.innerHTML = ICONS.fert + ` fertilize every ${fertFreq}`;
    summary.appendChild(fertSpan);

    const nextWaterSpan = document.createElement('span');
    nextWaterSpan.classList.add('summary-item');
    nextWaterSpan.innerHTML =
      ICONS.water +
      ` next watering is ${formatDateShort(getNextWaterDate(plant))}`;
    summary.appendChild(nextWaterSpan);

    const nextFertSpan = document.createElement('span');
    nextFertSpan.classList.add('summary-item');
    const nextFert = getNextFertDate(plant);
    nextFertSpan.innerHTML =
      ICONS.fert +
      ` next fertilizing is ${nextFert ? formatDateShort(nextFert) : 'N/A'}`;
    summary.appendChild(nextFertSpan);

    const lastWaterSpan = document.createElement('span');
    lastWaterSpan.classList.add('summary-item');
    lastWaterSpan.innerHTML =
      ICONS.water + ` last watered ${formatDateShort(plant.last_watered)}`;
    summary.appendChild(lastWaterSpan);


    const lastFertSpan = document.createElement('span');
    lastFertSpan.classList.add('summary-item');
    lastFertSpan.innerHTML =
      ICONS.fert + ` last fertilized ${formatDateShort(plant.last_fertilized)}`;
    summary.appendChild(lastFertSpan);

    card.appendChild(summary);

    const overdue = waterOverdueDays(plant, today);
    if (overdue > 2) {
      const warn = document.createElement('div');
      warn.classList.add('water-warning');
      warn.textContent = "Don't forget about me or I'll die!";
      card.appendChild(warn);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('actions');
    const leftGroup = document.createElement('div');
    leftGroup.classList.add('actions-left');
    const rightGroup = document.createElement('div');
    rightGroup.classList.add('actions-right');

    const waterDue = needsWatering(plant, today);
    const fertDue = needsFertilizing(plant, today);

    if (waterDue) {
      const btn = document.createElement('button');
      btn.classList.add('action-btn', 'due-task', 'water-due');
      btn.innerHTML = ICONS.water + '<span class="visually-hidden">Water</span>';
      btn.title = 'Water Now';
      btn.onclick = () => markAction(plant.id, 'watered');
      leftGroup.appendChild(btn);

      const snooze = document.createElement('select');
      snooze.classList.add('snooze-select');
      snooze.title = 'Snooze';
      const placeholder = document.createElement('option');
      placeholder.textContent = '';
      placeholder.selected = true;
      placeholder.disabled = true;
      snooze.appendChild(placeholder);
      [1, 2, 3].forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `${d} day${d > 1 ? 's' : ''}`;
        snooze.appendChild(opt);
      });
      snooze.onchange = () => {
        if (snooze.value) {
          markAction(plant.id, 'watered', parseInt(snooze.value));
          snooze.selectedIndex = 0;
        }
      };
      leftGroup.appendChild(snooze);
    }

    if (fertDue) {
      const btn = document.createElement('button');
      btn.classList.add('action-btn', 'due-task', 'fert-due');
      btn.innerHTML = ICONS.fert + '<span class="visually-hidden">Fertilize</span>';
      btn.title = 'Fertilize Now';
      btn.onclick = () => markAction(plant.id, 'fertilized');
      leftGroup.appendChild(btn);

      const snooze = document.createElement('select');
      snooze.classList.add('snooze-select');
      snooze.title = 'Snooze';
      const placeholder = document.createElement('option');
      placeholder.textContent = '';
      placeholder.selected = true;
      placeholder.disabled = true;
      snooze.appendChild(placeholder);
      [1, 2, 3].forEach(d => {
        const opt = document.createElement('option');
        opt.value = d;
        opt.textContent = `${d} day${d > 1 ? 's' : ''}`;
        snooze.appendChild(opt);
      });
      snooze.onchange = () => {
        if (snooze.value) {
          markAction(plant.id, 'fertilized', parseInt(snooze.value));
          snooze.selectedIndex = 0;
        }
      };
      leftGroup.appendChild(snooze);
    }

    const editBtn = document.createElement('button');
    editBtn.classList.add('action-btn', 'edit-btn');
    editBtn.innerHTML = ICONS.edit + '<span class="visually-hidden">Edit</span>';
    editBtn.title = 'Edit';
    editBtn.type = 'button';
      editBtn.onclick = () => {
        populateForm(plant);
        const form = document.getElementById('plant-form');
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth' });
        const showBtn = document.getElementById('show-add-form');
        if (showBtn) showBtn.style.display = 'none';
        showFormStep(1);
      };
    rightGroup.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.classList.add('action-btn', 'delete-btn');
    delBtn.innerHTML = ICONS.trash + '<span class="visually-hidden">Delete</span>';
    delBtn.title = 'Delete';
    delBtn.onclick = () => showUndoBanner(plant);
    rightGroup.appendChild(delBtn);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = () => {
      if (fileInput.files[0]) {
        updatePlantPhoto(plant, fileInput.files[0]);
      }
    };
    const changeBtn = document.createElement('button');
    changeBtn.classList.add('action-btn', 'photo-btn');
    changeBtn.innerHTML = ICONS.photo + '<span class="visually-hidden">Change Photo</span>';
    changeBtn.type = 'button';
    changeBtn.title = 'Add Image';
    changeBtn.onclick = () => fileInput.click();
    rightGroup.appendChild(changeBtn);
    actionsDiv.appendChild(leftGroup);
    actionsDiv.appendChild(rightGroup);
    actionsDiv.appendChild(fileInput);
    card.appendChild(actionsDiv);

    list.appendChild(card);
  });

  // refresh room filter
  const filter = document.getElementById('room-filter');
  Array.from(filter.options).map(o => o.value);
  plants.forEach(p => {
    if (!Array.from(filter.options).map(o => o.value).includes(p.room)) {
      const opt = document.createElement('option');
      opt.value = p.room;
      opt.textContent = p.room;
      filter.appendChild(opt);
    }
  });
}

// --- init ---
document.addEventListener('DOMContentLoaded',()=>{
  const showBtn = document.getElementById('show-add-form');
  const form = document.getElementById('plant-form');
  const cancelBtn = document.getElementById('cancel-edit');
  const undoBtn = document.getElementById('undo-btn');
  const toggleSearch = document.getElementById('toggle-search');
  const searchContainer = document.getElementById('search-container');
  const closeSearch = document.getElementById('close-search');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const roomFilter = document.getElementById('room-filter');
  const sortToggle = document.getElementById('sort-toggle');
  const dueFilterEl = document.getElementById('due-filter');
  const prevBtn = document.getElementById('prev-week');
  const nextBtn = document.getElementById('next-week');

  const calendarEl = document.getElementById('calendar');
  const calendarHeading = document.getElementById('calendar-heading');

  const nextStepBtn = document.getElementById('next-step');
  const prevStepBtn = document.getElementById('prev-step');
  const photoDrop = document.getElementById('photo-drop');
  const photoInput = document.getElementById('photo');
  const waterFreqInput = document.getElementById('watering_frequency');
  const waterAmtInput = document.getElementById('water_amount');


  // apply saved preferences before initial load
  loadFilterPrefs();
  showFormStep(1);

  loadCalendar();

  if (showBtn) {
    showBtn.innerHTML = ICONS.plus + '<span class="visually-hidden">Add a Plant</span>';
  }
  if (cancelBtn) {
    cancelBtn.innerHTML = ICONS.cancel + '<span class="visually-hidden">Cancel</span>';
  }
  if (undoBtn) {
    undoBtn.innerHTML = ICONS.undo + ' Undo';
  }
  if (toggleSearch) {
    toggleSearch.innerHTML = ICONS.search + '<span class="visually-hidden">Search</span>';
    toggleSearch.addEventListener('click', () => {
      if (form) {
        form.style.display = 'none';
        if (showBtn) showBtn.style.display = 'inline-block';
        const cancel = document.getElementById('cancel-edit');
        if (cancel) cancel.style.display = 'none';
      }
      if (searchContainer) searchContainer.classList.remove('hidden');
      toggleSearch.style.display = 'none';
      const input = document.getElementById('search-input');
      if (input) input.focus();
    });
  }
  if (closeSearch) {
    closeSearch.innerHTML = ICONS.cancel + '<span class="visually-hidden">Close Search</span>';
    closeSearch.addEventListener('click', () => {
      if (searchContainer) searchContainer.classList.add('hidden');
      toggleSearch.style.display = 'inline-block';
      document.getElementById('search-input').value = '';
      loadPlants();
    });
  }
  if (submitBtn) {
    submitBtn.innerHTML = ICONS.plus + '<span class="visually-hidden">Add Plant</span>';
  }
  if (showBtn && form) {
    showBtn.addEventListener('click', () => {
      if (searchContainer) {
        searchContainer.classList.add('hidden');
        toggleSearch.style.display = 'inline-block';
      }
      form.style.display = 'block';
      showBtn.style.display = 'none';
      const cancel = document.getElementById('cancel-edit');
      if (cancel) cancel.style.display = 'inline-block';
      showFormStep(1);
    });
  }
  document.getElementById('undo-btn').addEventListener('click',()=>{
    clearTimeout(deleteTimer);
    document.getElementById('undo-banner').classList.remove('show');
    lastDeletedPlant=null;
  });

  document.getElementById('search-input').addEventListener('input',loadPlants);
  document.getElementById('cancel-edit').onclick=resetForm;
  if (nextStepBtn) nextStepBtn.addEventListener('click', () => {
    if (validateCurrentStep(currentFormStep)) showFormStep(currentFormStep + 1);
  });
  if (prevStepBtn) prevStepBtn.addEventListener('click', () => {
    showFormStep(currentFormStep - 1);
  });
  if (photoDrop && photoInput) {
    photoDrop.addEventListener('click', () => photoInput.click());
    photoDrop.addEventListener('dragover', e => { e.preventDefault(); photoDrop.classList.add('dragover'); });
    photoDrop.addEventListener('dragleave', () => photoDrop.classList.remove('dragover'));
    photoDrop.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) {
        photoInput.files = e.dataTransfer.files;
        photoDrop.textContent = e.dataTransfer.files[0].name;
      }
      photoDrop.classList.remove('dragover');
    });
    photoInput.addEventListener('change', () => {
      if (photoInput.files[0]) photoDrop.textContent = photoInput.files[0].name;
    });
  }
  if (waterFreqInput) waterFreqInput.addEventListener('input', () => {
    const err = document.getElementById('watering_frequency-error');
    if (parseInt(waterFreqInput.value,10) > 0) err.textContent = '';
    else err.textContent = 'Watering Frequency must be > 0';
  });
  if (waterAmtInput) waterAmtInput.addEventListener('input', () => {
    const err = document.getElementById('water_amount-error');
    if (parseFloat(waterAmtInput.value) > 0) err.textContent = '';
    else err.textContent = 'Enter a positive number.';
  });
  document.getElementById('plant-form').addEventListener('submit',async e=>{
    e.preventDefault(); const form=e.target;
    if (!validateForm(form)) return;
    const data=new FormData(form);
    data.set('water_amount',
      form.water_amount ? parseWaterAmount(form.water_amount.value) : '');
    const btn=form.querySelector('button[type="submit"]');
    btn.disabled=true;
    btn.innerHTML=(editingPlantId?ICONS.check:ICONS.plus)+
                  (editingPlantId?' Updating...':' Adding...');
    try{
      let resp;
      if(editingPlantId){ data.append('id', editingPlantId); resp=await fetch('api/update_plant.php',{method:'POST',body:data}); }
      else{ resp=await fetch('api/add_plant.php',{method:'POST',body:data}); }
      if(!resp.ok) throw new Error();
      showToast(editingPlantId?'Plant updated!':'Plant added!');
      resetForm();
      loadPlants();
      loadCalendar();
    }catch{
      showToast('An error occurred. Please try again.', true);
    }finally{
      btn.disabled=false;
      btn.innerHTML=editingPlantId
        ? ICONS.check + '<span class="visually-hidden">Update Plant</span>'
        : ICONS.plus + '<span class="visually-hidden">Add Plant</span>';
    }
  });

  if (roomFilter) {
    roomFilter.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
    });
  }
  if (sortToggle) {
    sortToggle.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
    });
  }
  if (dueFilterEl) {
    dueFilterEl.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
    });
  }
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      calendarStartDate = addDays(calendarStartDate, -7);
      loadCalendar();
    });
  }
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      calendarStartDate = addDays(calendarStartDate, 7);
      loadCalendar();
    });
  }
  loadPlants();
  loadHeatmap();
  fetchWeather();
});
