let editingPlantId = null;
let lastDeletedPlant = null;
let deleteTimer = null;
let lastCompletedAction = null;
let actionTimer = null;

import { calculateET0, computeArea, computeRA } from "./js/calc.js";
import { parseLocalDate, addDays, formatDateShort } from "./js/dates.js";
import { showToast, toggleLoading } from "./js/dom.js";
import { ICONS } from "./js/icons.js";

const indexParams = new URLSearchParams(window.location.search);
let focusPlantId = null;
const hashMatch = location.hash.match(/^#plant-(\d+)/);
if (hashMatch) {
  focusPlantId = hashMatch[1];
} else {
  focusPlantId = indexParams.get('plant_id');
}

// show archived plants instead of active ones
let showArchive = false;
let archivedCache = null;
let plantCache = [];

// track counts for active filters
let filterCounts = {
  watering: 0,
  fertilizing: 0,
  needsCare: 0,
};

// preferred layout for plant cards
let viewMode = localStorage.getItem('viewMode') || 'grid';
// increment when the format of saved filter preferences changes
const FILTER_PREF_VERSION = 3;
// track weather info so the summary can include current conditions
let currentWeather = null;
let currentWeatherIcon = null;
let currentWeatherDesc = null;

// number of milliliters in one US fluid ounce
const ML_PER_US_FL_OUNCE = 29.5735;
const CM_PER_INCH = 2.54;

// how often to refresh weather data (ms)
const WEATHER_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour

// configuration values mirrored from config.php
const DEFAULT_KC = 0.8;
const KC_MAP = {
  succulent: 0.3,
  houseplant: 0.8,
  vegetable: 1.0,
  flower: 0.9,
  cacti: 0.28,
};

let weatherTminC = null;
let weatherTmaxC = null;
let raValue = null;

// forecast rainfall totals in inches (initialized to zeros in case fetch fails)
let rainForecastInches = [0, 0, 0];

let userWaterFreqEdited = false;

// starting date for the calendar view
let calendarStartDate = new Date();
calendarStartDate.setHours(0, 0, 0, 0);

// simple in-memory caches for plant lookups
const iNatCache = new Map();
const plantInfoCache = new Map();

// DOM elements used across functions
let suggestionList = null;


function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

function playSuccessFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 440;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.15);
  } catch (e) {}
}

function showCompletionBadge(card, text) {
  const badge = document.createElement('div');
  badge.className = 'completion-badge';
  badge.textContent = text;
  card.appendChild(badge);
  setTimeout(() => badge.remove(), 2000);
  card.classList.add('just-updated');
  setTimeout(() => card.classList.remove('just-updated'), 2000);
}

function showUndoActionBanner(plant, actions, prevWater, prevFert) {
  lastCompletedAction = { plant, actions, prevWater, prevFert };
  const banner = document.getElementById('undo-banner');
  const msg = document.getElementById('undo-message');
  if (msg) {
    if (actions.length === 2) {
      msg.textContent = 'Tasks marked complete.';
    } else {
      msg.textContent = actions[0] === 'watered' ? 'Watered.' : 'Fertilized.';
    }
  }
  banner.classList.add('success');
  banner.classList.add('show');
  banner.setAttribute('aria-hidden', 'false');
  clearTimeout(actionTimer);
  actionTimer = setTimeout(() => {
    banner.classList.remove('show');
    banner.classList.remove('success');
    banner.setAttribute('aria-hidden', 'true');
    lastCompletedAction = null;
  }, 5000);
}

async function markActionsWithUndo(plant, card, actions) {
  const prevWater = plant.last_watered;
  const prevFert = plant.last_fertilized;
  for (const act of actions) {
    await markAction(plant.id, act, 0, false);
  }
  const toastMsg = actions.length === 2 ? 'Watered & fertilized!' :
    (actions[0] === 'watered' ? 'Marked watered!' : 'Marked fertilized!');
  showToast(toastMsg);
  showCompletionBadge(card, actions.length === 2 ? 'Care done!' :
    (actions[0] === 'watered' ? 'Watered!' : 'Fertilized!'));
  playSuccessFeedback();
  showUndoActionBanner(plant, actions, prevWater, prevFert);
}

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
  return `<span class="oz-line">${ozDisplay}oz</span> / ` +
         `<span class="ml-line">${mlDisplay} ml</span>`;
}


function hexToRgb(hex) {
  if (!hex) return { r: 0, g: 0, b: 0 };
  hex = hex.trim().replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  const num = parseInt(hex, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}
async function fetchScientificNames(query) {
  if (!query) return [];
  if (iNatCache.has(query)) return iNatCache.get(query);
  try {
    const res = await fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const json = await res.json();
    const names = [...new Set((json.results || []).map(t => t.name).filter(Boolean))];
    iNatCache.set(query, names);
    return names;
  } catch (e) {
    return [];
  }
}

function renderTaxonomyData(data) {
  const infoEl = document.getElementById('taxonomy-info');
  if (!infoEl) return;
  infoEl.textContent = '';
  const frag = document.createDocumentFragment();
  if (data.commonName) {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'Common Name:';
    div.appendChild(strong);
    div.appendChild(document.createTextNode(' ' + data.commonName));
    frag.appendChild(div);
  }
  if (data.sciName) {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'Scientific Name:';
    div.appendChild(strong);
    div.appendChild(document.createTextNode(' ' + data.sciName));
    frag.appendChild(div);
  }
  if (data.photos && data.photos.length) {
    const galleryDiv = document.createElement('div');
    galleryDiv.className = 'specimen-gallery';
    data.photos.forEach((url, idx) => {
      const imgEl = document.createElement('img');
      imgEl.src = url;
      imgEl.alt = data.sciName || '';
      imgEl.loading = 'lazy';
      if (idx === 0) imgEl.classList.add('selected');
      galleryDiv.appendChild(imgEl);
    });
    frag.appendChild(galleryDiv);
  }
  infoEl.appendChild(frag);
}

function attachGalleryHandlers(gallery) {
  const imageUrlInput = document.getElementById('thumbnail_url');
  const previewImg = document.getElementById('name-preview');
  if (!gallery) return;
  gallery.querySelectorAll('img').forEach(imgEl => {
    imgEl.addEventListener('click', () => {
      gallery.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
      imgEl.classList.add('selected');
      if (imageUrlInput) imageUrlInput.value = imgEl.src;
      if (previewImg) {
        previewImg.src = imgEl.src;
        previewImg.classList.remove('hidden');
      }
    });
  });
}

async function showTaxonomyInfo(name) {
  const infoEl = document.getElementById('taxonomy-info');
  const imageUrlInput = document.getElementById('thumbnail_url');
  const sciNameInput = document.getElementById('scientific_name');
  const previewImg = document.getElementById('name-preview');
  if (!infoEl) return;
  infoEl.textContent = '';
  if (!name) {
    if (imageUrlInput) imageUrlInput.value = '';
    if (sciNameInput) sciNameInput.value = '';
    if (previewImg) previewImg.classList.add('hidden');
    return;
  }

  if (plantInfoCache.has(name)) {
    const cached = plantInfoCache.get(name);
    renderTaxonomyData(cached);
    if (imageUrlInput) imageUrlInput.value = cached.photos[0] || '';
    if (sciNameInput) sciNameInput.value = cached.sciName || name;
    if (previewImg && cached.photos[0]) {
      previewImg.src = cached.photos[0];
      previewImg.classList.remove('hidden');
    }
    const gallery = infoEl.querySelector('.specimen-gallery');
    attachGalleryHandlers(gallery);
    return;
  }

  try {
    const res = await fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(name)}`);
    if (!res.ok) return;
    const json = await res.json();
    const taxon = (json.results || [])[0];
    if (!taxon) return;
    const data = {
      commonName: taxon.preferred_common_name || '',
      sciName: taxon.name || name,
      photos: []
    };
    let photos = [];
    try {
      const detailRes = await fetch(`https://api.inaturalist.org/v1/taxa/${taxon.id}`);
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        const detail = (detailJson.results || [])[0] || {};
        // prefer the medium variant for sharper thumbnails, falling back to
        // square if it is unavailable
        photos = (detail.taxon_photos || []).map(tp => {
          const p = tp.photo || {};
          return p.medium_url || p.square_url;
        }).filter(Boolean);
      }
    } catch (e) {}
    if (!photos.length && taxon.default_photo) {
      photos = [taxon.default_photo.medium_url || taxon.default_photo.square_url];
    }

    data.photos = photos.slice(0, 10);
    if (sciNameInput) sciNameInput.value = data.sciName;
    if (imageUrlInput) imageUrlInput.value = data.photos[0] || '';
    if (previewImg && data.photos[0]) {
      previewImg.src = data.photos[0];
      previewImg.classList.remove('hidden');
    } else if (previewImg) {
      previewImg.classList.add('hidden');
    }

    renderTaxonomyData(data);
    attachGalleryHandlers(infoEl.querySelector('.specimen-gallery'));
    plantInfoCache.set(name, data);
  } catch (e) {
    // ignore network errors
  }
}

async function lookupPlants(query) {
  if (!suggestionList) return;
  suggestionList.innerHTML = '';
  if (!query) {
    suggestionList.classList.add('hidden');
    return;
  }
  try {
    const res = await fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const json = await res.json();
    (json.results || []).forEach(taxon => {
      const li = document.createElement('li');
      li.textContent = taxon.preferred_common_name || taxon.name;
      li.dataset.sci = taxon.name || '';
      li.dataset.img = (taxon.default_photo && (taxon.default_photo.medium_url || taxon.default_photo.square_url)) || '';
      suggestionList.appendChild(li);
    });
    suggestionList.classList.toggle('hidden', suggestionList.children.length === 0);
  } catch (e) {
    // ignore network errors
  }
}

const debouncedLookupPlants = debounce(lookupPlants, 300);

function updateWaterAmount() {
  const diamInput = document.getElementById('pot_diameter');
  const unitSelect = document.getElementById('pot_diameter_unit');
  const typeSelect = document.getElementById('plant_type');
  const waterAmtInput = document.getElementById('water_amount');

  const autoDisplay = document.getElementById('auto-water-oz');

  const overrideCheck = document.getElementById('override_water');
  const autoWater = document.getElementById('auto-water-oz');

  if (!diamInput || !waterAmtInput) return;
  const diam = parseFloat(diamInput.value);
  if (isNaN(diam) || weatherTminC === null || weatherTmaxC === null) return;
  const unit = unitSelect ? unitSelect.value : 'cm';
  const diamCm = unit === 'in' ? diam * CM_PER_INCH : diam;
  const plantType = typeSelect ? typeSelect.value : null;
  let kc = DEFAULT_KC;
  if (plantType && KC_MAP[plantType] !== undefined) kc = KC_MAP[plantType];
  const et0 = calculateET0(
    weatherTminC,
    weatherTmaxC,
    raValue !== null ? raValue : undefined
  );
  const etc = kc * et0;
  const area = computeArea(diamCm);
  const waterMl = etc * area * 0.1;
  const oz = waterMl / ML_PER_US_FL_OUNCE;

  const ozStr = oz.toFixed(1);
  waterAmtInput.value = ozStr;
  if (autoDisplay) autoDisplay.textContent = ozStr;
  waterAmtInput.dispatchEvent(new Event('input', { bubbles: true }));

  if (!overrideCheck || !overrideCheck.checked) {
    waterAmtInput.value = oz.toFixed(1);
    waterAmtInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (autoWater) autoWater.textContent = oz.toFixed(1);

  if (editingPlantId) {
    const body = new URLSearchParams({
      plant_id: editingPlantId,
      et0_mm: et0.toFixed(2),
      water_ml: waterMl.toFixed(1)
    });
    fetch('api/log_et0.php', { method: 'POST', body }).catch(() => {});
  }
}

function updateWateringFrequency() {
  const freqInput = document.getElementById('watering_frequency');
  if (!freqInput || userWaterFreqEdited) return;
  const typeSelect = document.getElementById('plant_type');
  const potInput = document.getElementById('pot_diameter');
  const unitSelect = document.getElementById('pot_diameter_unit');
  let base = 7;
  const type = typeSelect ? typeSelect.value : 'houseplant';
  if (type === 'succulent') base = 14;
  else if (type === 'cacti') base = 21;
  else if (type === 'flower') base = 5;
  else if (type === 'vegetable') base = 3;
  let diam = parseFloat(potInput ? potInput.value : '');
  if (!isNaN(diam)) {
    const unit = unitSelect ? unitSelect.value : 'cm';
    if (unit === 'in') diam *= CM_PER_INCH;
    if (diam > 25) base += 3;
    else if (diam < 10) base -= 1;
  }
  freqInput.value = Math.max(1, base);
}



// --- filter preference helpers ---
function saveFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('status-filter');
  if (rf) {
    const rooms = Array.from(rf.selectedOptions).map(o => o.value);
    localStorage.setItem('roomFilter', JSON.stringify(rooms));
  }
  if (sf) localStorage.setItem('sortPref', sf.value);
  if (df) localStorage.setItem('statusFilter', df.value);
  const types = Array.from(
    document.querySelectorAll('#type-filters input:checked')
  ).map(cb => cb.value);
  localStorage.setItem('typeFilters', JSON.stringify(types));
}

function loadFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('status-filter');
  const rVal = localStorage.getItem('roomFilter');
  const sVal = localStorage.getItem('sortPref');
  const dVal = localStorage.getItem('statusFilter');
  if (rf) {
    const rooms = rVal ? JSON.parse(rVal) : [];
    Array.from(rf.options).forEach(opt => {
      opt.selected = rooms.includes(opt.value);
    });
  }
  if (sf) {
    const hasS = sVal !== null && Array.from(sf.options).some(o => o.value === sVal);
    sf.value = hasS ? sVal : 'due';
  }
  if (df) {
    const hasD = dVal !== null && Array.from(df.options).some(o => o.value === dVal);
    df.value = hasD ? dVal : 'all';
  }
  const types = JSON.parse(localStorage.getItem('typeFilters') || '[]');
  document.querySelectorAll('#type-filters input').forEach(cb => {
    cb.checked = types.includes(cb.value);
  });


  const recentEl = document.getElementById('recently-added');
  if (recentEl) recentEl.checked = false;

}

function clearFilterPrefs() {
  localStorage.removeItem('roomFilter');
  localStorage.removeItem('sortPref');
  localStorage.removeItem('statusFilter');
  localStorage.removeItem('typeFilters');

}

function migrateFilterPrefs() {
  const stored = localStorage.getItem('filterPrefVersion');
  if (stored !== String(FILTER_PREF_VERSION)) {
    clearFilterPrefs();
    localStorage.setItem('filterPrefVersion', String(FILTER_PREF_VERSION));
  }

}

function saveHistoryValue(key, value) {
  if (!value) return;
  const arr = JSON.parse(localStorage.getItem(key) || '[]');
  if (!arr.includes(value)) {
    arr.push(value);
    localStorage.setItem(key, JSON.stringify(arr));
  }
}

function loadHistoryValues(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

// expose so it can be called externally
window.clearFilterPrefs = clearFilterPrefs;
window.migrateFilterPrefs = migrateFilterPrefs;

function applyViewMode() {
  const container = document.getElementById('plant-grid');
  if (container) {
    container.classList.remove('grid-view', 'list-view', 'text-view');
    container.classList.add(`${viewMode}-view`);
  }
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewMode);
  });
  localStorage.setItem('viewMode', viewMode);
}



function updateFilterChips() {
  const filterToggle = document.getElementById('filter-toggle');
  const chipsEl = document.getElementById('filter-chips');
  const summaryEl = document.getElementById('filter-summary');
  const clearBtn = document.getElementById('clear-filters');

  const roomEl = document.getElementById('room-filter');
  const statusEl = document.getElementById('status-filter');
  const sortEl = document.getElementById('sort-toggle');

  const defaultStatus = 'all';
  const defaultSort = 'due';

  const chips = [];
  if (roomEl) {
    const rooms = Array.from(roomEl.selectedOptions);
    rooms.forEach(opt => {
      const val = opt.value;
      chips.push({
        text: opt.textContent,
        remove() {
          const select = document.getElementById('room-filter');
          if (select) {
            Array.from(select.options).forEach(o => {
              if (o.value === val) o.selected = false;
            });
          }
        }
      });
    });
  }
  if (statusEl &&
      statusEl.value !== defaultStatus &&
      statusEl.value !== 'any' &&
      statusEl.selectedIndex >= 0) {
    const val = statusEl.value;
    let label = statusEl.options[statusEl.selectedIndex].textContent;
    if (val === 'water') label += ` (${filterCounts.watering})`;
    if (val === 'fert') label += ` (${filterCounts.fertilizing})`;
    chips.push({
      text: label,
      remove() { statusEl.value = defaultStatus; }
    });
  }
  if (sortEl && sortEl.value !== defaultSort && sortEl.selectedIndex >= 0) {
    chips.push({
      text: sortEl.options[sortEl.selectedIndex].textContent,
      remove() { sortEl.value = defaultSort; }
    });
  }
  document.querySelectorAll('#type-filters input:checked').forEach(cb => {
    const label = cb.closest('label');
    chips.push({
      text: label ? label.textContent.trim() : cb.value,
      remove() { cb.checked = false; }
    });
  });

  if (chipsEl) {
    chipsEl.innerHTML = '';
    chips.forEach(c => {
      const chip = document.createElement('span');
      chip.className = 'filter-chip';
      chip.textContent = c.text;
      const btn = document.createElement('button');
      btn.innerHTML = ICONS.cancel;
      btn.addEventListener('click', async () => {
        c.remove();
        saveFilterPrefs();
        await loadPlants();
        updateFilterChips();
      });
      chip.appendChild(btn);
      chipsEl.appendChild(chip);
    });
  }

  const activeCount = chips.length;

  if (summaryEl) {
    summaryEl.textContent = activeCount ? `${activeCount} active` : 'No filters';
  }
  if (filterToggle) {
    filterToggle.innerHTML = ICONS.filter + ' Filters';
    filterToggle.setAttribute('data-count', activeCount);
  }
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', activeCount === 0);
  }
  return activeCount;
}

function updateSegments(total, water, fert) {
  const allEl = document.getElementById('seg-all-count');
  const waterEl = document.getElementById('seg-water-count');
  const fertEl = document.getElementById('seg-fert-count');
  if (allEl) allEl.textContent = total;
  if (waterEl) waterEl.textContent = water;
  if (fertEl) fertEl.textContent = fert;
  const statusVal = document.getElementById('status-filter')
    ? document.getElementById('status-filter').value
    : 'all';
  document.querySelectorAll('#status-segments button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === statusVal);
  });
}




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
  const nameField = form.querySelector('[name="name"]');
  if (nameField && nameField.value.trim() &&
      !/^[\p{L}0-9\s'-]{1,100}$/u.test(nameField.value.trim())) {
    document.getElementById('name-error').textContent =
      'Invalid characters or too long.';
    valid = false;
  }

  const species = form.querySelector('[name="species"]');
  if (species && species.value.trim() &&
      !/^[\p{L}0-9\s.'-]{1,100}$/u.test(species.value.trim())) {
    document.getElementById('species-error').textContent =
      'Invalid characters or too long.';
    valid = false;
  }

  const room = form.querySelector('[name="room"]');
  if (room && room.value.trim() &&
      !/^[\p{L}0-9\s-]{1,50}$/u.test(room.value.trim())) {
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

  const potDiam = form.querySelector('#pot_diameter');
  if (potDiam && potDiam.value.trim() !== '') {
    const val = parseFloat(potDiam.value);
    if (isNaN(val) || val <= 0) {
      const err = document.getElementById('pot_diameter-error');
      if (err) err.textContent = 'Enter a positive number.';
      valid = false;
    } else {
      const err = document.getElementById('pot_diameter-error');
      if (err) err.textContent = '';
    }
  } else {
    const err = document.getElementById('pot_diameter-error');
    if (err) err.textContent = '';
  }

  const waterAmtField = form.water_amount;
  if (waterAmtField) {
    const val = waterAmtField.value.trim();
    if (val !== '') {
      const amt = parseWaterAmount(val);
      if (isNaN(amt) || amt <= 0) {
        const errorDiv = document.getElementById('water_amount-error');
        if (errorDiv) errorDiv.textContent = 'Enter a positive number.';
        valid = false;
      }
    }
  }

  return valid;
}



function formatFrequency(days) {
  const n = parseInt(days, 10);
  if (isNaN(n) || n <= 0) return '';
  if (n === 1) return 'every day';
  if (n === 7) return 'once a week';
  if (n === 14) return 'every 2 weeks';
  if (n === 30 || n === 31) return 'once a month';
  if (n === 365) return 'once a year';
  return `every ${n} days`;
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

async function loadCalendar(plantsList = null) {
  let plants = plantsList || plantCache;
  if (!plants || plants.length === 0) {
    try {
      const res = await fetch('api/get_plants.php');
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      plants = await res.json();
      plantCache = plants;
    } catch (err) {
      console.error('Failed to load calendar:', err);
      showToast('Failed to load calendar data', true);
      return;
    }
  }
  const container = document.getElementById('calendar');
  if (!container) return;
  const daysToShow = 7;
  const start = new Date(calendarStartDate);
  start.setHours(0,0,0,0);
  container.innerHTML = '';

  const roomSet = new Set();
  plants.forEach(p => { if (p.room) roomSet.add(p.room); });
  const rooms = Array.from(roomSet).sort((a,b) => a.localeCompare(b));
  const groupMap = new Map();

  const dayEls = [];
  for (let i=0;i<daysToShow;i++) {
    const d = addDays(start,i);
    const dayEl = document.createElement('div');
    dayEl.classList.add('cal-day');
    dayEl.dataset.date = d.toISOString().split('T')[0];
    dayEl.innerHTML = `<div class="cal-day-header">${d.toLocaleDateString(undefined,{weekday:'short',month:'numeric',day:'numeric'})}</div>`;
    dayEl.addEventListener('dragover',e=>e.preventDefault());
    dayEl.addEventListener('drop',e=>handleDrop(e, dayEl.dataset.date, plants));
    rooms.forEach(r => {
      const group = document.createElement('div');
      group.classList.add('room-group');
      group.dataset.room = r;
      const header = document.createElement('div');
      header.classList.add('room-header');
      header.textContent = r;
      header.style.backgroundColor = colorForRoom(r);
      header.style.borderColor = borderColorForRoom(r);
      group.appendChild(header);
      dayEl.appendChild(group);
      groupMap.set(`${dayEl.dataset.date}|${r}`, group);
    });
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
    ev.style.borderLeftColor = borderColorForRoom(plant.room);
    const group = groupMap.get(`${dateStr}|${plant.room}`);
    if (group) group.appendChild(ev); else dayEl.appendChild(ev);
  }

  plants.forEach(p=>{
    const w = getNextWaterDate(p);
    if (w) addEvent(p,'water',w);
    const f = getNextFertDate(p);
    if (f) addEvent(p,'fert',f);
  });

  // Remove room groups that have no events
  groupMap.forEach(group => {
    if (group.querySelectorAll('.cal-event').length === 0) {
      group.remove();
    }
  });

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
  loadPlants();
}

function savePendingAction(action) {
  const arr = JSON.parse(localStorage.getItem('pendingActions') || '[]');
  arr.push(action);
  localStorage.setItem('pendingActions', JSON.stringify(arr));
}

async function syncPendingActions() {
  if (!navigator.onLine) return;
  const actions = JSON.parse(localStorage.getItem('pendingActions') || '[]');
  if (actions.length === 0) return;
  for (const act of actions) {
    try {
      await fetch(`api/mark_${act.type}.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `id=${act.id}&snooze_days=${act.days}`
      });
    } catch (e) {
      console.error('Failed to sync action', e);
      return;
    }
  }
  localStorage.removeItem('pendingActions');
  showToast('Offline actions synced!');
  loadPlants();
}

window.addEventListener('online', syncPendingActions);

// --- mark watered/fertilized / snooze ---
async function markAction(id, type, days = 0, showMsg = true) {
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
    let msg;
    if (days > 0) {
      msg = type === 'watered'
        ? `Watering snoozed ${days} day${days !== 1 ? 's' : ''}`
        : `Fertilizing snoozed ${days} day${days !== 1 ? 's' : ''}`;
    } else {
      msg = type === 'watered' ? 'Marked watered!' : 'Marked fertilized!';
    }
    if (showMsg) {
      showToast(msg);
    }
  } catch (err) {
    console.error('Failed to mark action:', err);
    savePendingAction({ id, type, days });
    if (showMsg) {
      showToast('Saved offline. Will sync when online.');
    }
  }
}

// --- archive/unarchive helper ---
async function archivePlant(id, archive = true) {
  try {
    const resp = await fetch('api/archive_plant.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id=${id}&archive=${archive ? 1 : 0}`
    });
    if (!resp.ok) throw new Error();
    archivedCache = null;
    showToast(archive ? 'Plant archived!' : 'Plant restored!');
    if (showArchive && !archive) showArchive = false;
    loadPlants();
    checkArchivedLink();
  } catch (err) {
    console.error('Failed to update archive state:', err);
    showToast('Failed to update plant. Please try again.', true);
  }
}

// --- swipe-to-complete helper ---
function enableSwipeComplete(card, overlay, plant, waterDue, fertDue) {
  if (!waterDue && !fertDue) return;
  let startX = null;
  let startY = null;
  let swiping = false;
  let activePointerId = null;
  const threshold = 80;
  card.addEventListener('pointerdown', e => {
    e.preventDefault();
    startX = e.clientX;
    startY = e.clientY;
    swiping = false;
    activePointerId = e.pointerId;
    card.setPointerCapture(activePointerId);
    card.style.transition = 'none';
    overlay.style.transition = 'opacity 0.2s, transform 0.2s';
  });
  card.addEventListener('pointermove', e => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
      swiping = true;
    }
    if (swiping) {
      const translate = Math.max(0, dx);
      card.style.transform = `translateX(${translate}px)`;
      const progress = Math.min(1, translate / threshold);
      overlay.style.setProperty('--swipe-progress', progress);
    }
  });
  card.addEventListener('pointerup', e => {
    if (startX === null) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = startY = null;
    card.style.transition = '';
    if (dx > threshold && Math.abs(dy) < 50) {
      card.style.transform = `translateX(100%)`;
      overlay.style.setProperty('--swipe-progress', 1);
      setTimeout(() => {
        card.style.transform = '';
        overlay.style.setProperty('--swipe-progress', 0);
        const acts = [];
        if (waterDue) acts.push('watered');
        if (fertDue) acts.push('fertilized');
        markActionsWithUndo(plant, card, acts);
      }, 200);
    } else {
      card.style.transform = '';
      overlay.style.setProperty('--swipe-progress', 0);
    }
    swiping = false;
    if (activePointerId !== null) {
      card.releasePointerCapture(activePointerId);
      activePointerId = null;
    }
  });
  card.addEventListener('pointercancel', () => {
    startX = startY = null;
    swiping = false;
    card.style.transition = '';
    card.style.transform = '';
    overlay.style.setProperty('--swipe-progress', 0);
    if (activePointerId !== null) {
      card.releasePointerCapture(activePointerId);
      activePointerId = null;
    }
  });
}

// --- undo-delete snackbar ---
function showUndoBanner(plant) {
  lastDeletedPlant = plant;
  const banner = document.getElementById('undo-banner');
  const msg = document.getElementById('undo-message');
  if (msg) msg.textContent = 'Plant deleted.';
  banner.classList.remove('success');
  banner.classList.add('show');
  banner.setAttribute('aria-hidden', 'false');
  clearTimeout(deleteTimer);
  deleteTimer = setTimeout(async () => {
    try {
      await fetch('api/delete_plant.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `id=${plant.id}`
      });
    } catch (err) {
      console.error('Failed to delete plant', err);
      showToast('Failed to delete plant', true);
    }
    banner.classList.remove('show');
    banner.setAttribute('aria-hidden', 'true');
    lastDeletedPlant = null;
    loadPlants();
  }, 5000);
}

// --- inline update helper ---
async function updatePlantInline(plant, field, newValue) {
  const data = new FormData();
  // send full payload to match existing PHP
  data.append('id', plant.id);
  data.append('name', plant.name);
  data.append('species', plant.species);
  data.append('plant_type', plant.plant_type || 'houseplant');
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('water_amount', plant.water_amount);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');
  data.append('photo_url', plant.photo_url || '');
  data.append('scientific_name', plant.scientific_name || '');
  data.append('thumbnail_url', plant.thumbnail_url || '');

  data.set(field, newValue);

  try {
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
    }
  } catch (err) {
    console.error('Failed to update plant inline', err);
    showToast('Failed to save change', true);
  }
}

async function updatePlantPhoto(plant, file) {
  const data = new FormData();
  data.append('id', plant.id);
  data.append('name', plant.name);
  data.append('species', plant.species);
  data.append('plant_type', plant.plant_type || 'houseplant');
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('water_amount', plant.water_amount);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');
  data.append('scientific_name', plant.scientific_name || '');
  data.append('thumbnail_url', plant.thumbnail_url || '');
  data.append('photo', file);

  toggleLoading(true);
  try {
    const resp = await fetch('api/update_plant.php', { method: 'POST', body: data });
    if (!resp.ok) {
      showToast('Failed to update photo', true);
    } else {
      window.lastUpdatedPlantId = plant.id;
      loadPlants();
    }
  } finally {
    toggleLoading(false);
  }
}

async function duplicatePlant(plant) {
  const data = new FormData();
  data.append('name', plant.name);
  data.append('species', plant.species);
  data.append('plant_type', plant.plant_type || 'houseplant');
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('water_amount', plant.water_amount);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');
  data.append('photo_url', plant.photo_url || '');

  toggleLoading(true);
  try {
    const resp = await fetch('api/add_plant.php', { method: 'POST', body: data });
    if (!resp.ok) {
      showToast('Failed to duplicate plant', true);
    } else {
      showToast('Plant duplicated!');
      loadPlants();
    }
  } finally {
    toggleLoading(false);
  }
}

// --- weather helper ---
// Weather data is fetched server-side to keep the API key private.

function fetchWeather() {
  const addWeather = (temp, desc, icon) => {
    currentWeather = `${temp}°F ${desc}`;
    currentWeatherIcon = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    currentWeatherDesc = desc;
    loadPlants();
  };

    const fetchByCoords = async (lat, lon) => {
    try {
        const res = await fetch(`api/weather.php?lat=${lat}&lon=${lon}`);
        if (res.status === 401) {
          console.warn('Unauthorized weather fetch');
          showToast('Please log in', true);
          window.showOverlay?.();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
      weatherTminC = (data.temp_min - 32) * 5/9;
      weatherTmaxC = (data.temp_max - 32) * 5/9;
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const doy = Math.floor((now - start) / 86400000);
      raValue = computeRA(lat, doy);
      rainForecastInches = Array.isArray(data.rain) && data.rain.length === 3 ? data.rain : [0, 0, 0];
      addWeather(Math.round(data.temp), data.desc, data.icon);
      updateWaterAmount();
    } catch (e) {
      console.error('Weather fetch failed', e);
      showToast("Couldn't fetch weather data; water amounts may be off", true);
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
  showTaxonomyInfo(plant.species);
  form.watering_frequency.value = plant.watering_frequency;
  const typeSelect = document.getElementById('plant_type');
  if (typeSelect) typeSelect.value = plant.plant_type || 'houseplant';
  if (form.water_amount) {
    const ml = parseFloat(plant.water_amount);
    if (ml > 0) {
      const oz = ml / ML_PER_US_FL_OUNCE;
      form.water_amount.value = oz.toFixed(1).replace(/\.0$/, '');
      const oc = document.getElementById('override_water');
      const wg = document.getElementById('water-amount-group');
      const ad = document.getElementById('auto-water-display');
      const av = document.getElementById('auto-water-oz');
      if (oc && wg) {
        oc.checked = true;
        wg.classList.remove('hidden');
        if (ad) ad.classList.add('hidden');
      }
      if (av) av.textContent = oz.toFixed(1).replace(/\.0$/, '');
    } else {
      form.water_amount.value = '';
      const oc = document.getElementById('override_water');
      const wg = document.getElementById('water-amount-group');
      const ad = document.getElementById('auto-water-display');
      const av = document.getElementById('auto-water-oz');
      if (oc && wg) {
        oc.checked = false;
        wg.classList.add('hidden');
        if (ad) ad.classList.remove('hidden');
      }
      if (av) av.textContent = '';
    }
  }
  form.fertilizing_frequency.value = plant.fertilizing_frequency;
  form.room.value = plant.room;
  form.last_watered.value = plant.last_watered;
  form.last_fertilized.value = plant.last_fertilized;
  const photoUrlInput = document.getElementById('photo_url');
  if (photoUrlInput) photoUrlInput.value = plant.photo_url || '';
  const thumbInput = document.getElementById('thumbnail_url');
  if (thumbInput) thumbInput.value = plant.thumbnail_url || '';
  const previewImg = document.getElementById('name-preview');
  if (previewImg && plant.thumbnail_url) {
    previewImg.src = plant.thumbnail_url;
    previewImg.classList.remove('hidden');
  }
  editingPlantId = plant.id;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.innerHTML = ICONS.check + ' Update Plant';
  document.getElementById('cancel-edit').style.display = 'inline-block';
}

function resetForm() {
  const form = document.getElementById('plant-form');
  form.reset();
  if (form.water_amount) form.water_amount.value = '';
  const oc = document.getElementById('override_water');
  const wg = document.getElementById('water-amount-group');
  const ad = document.getElementById('auto-water-display');
  const av = document.getElementById('auto-water-oz');
  if (oc && wg) {
    oc.checked = false;
    wg.classList.add('hidden');
  }
  if (ad) ad.classList.remove('hidden');
  if (av) av.textContent = '';
  const taxInfo = document.getElementById('taxonomy-info');
  if (taxInfo) taxInfo.innerHTML = '';
  const thumbInput = document.getElementById('thumbnail_url');
  if (thumbInput) thumbInput.value = '';
  const previewImg = document.getElementById('name-preview');
  if (previewImg) {
    previewImg.src = '';
    previewImg.classList.add('hidden');
  }
  const photoInput = document.getElementById('photo');
  if (photoInput) photoInput.value = '';
  const photoUrlInput = document.getElementById('photo_url');
  if (photoUrlInput) photoUrlInput.value = '';
  const photoDrop = document.getElementById('photo-drop');
  if (photoDrop) {
    photoDrop.textContent = 'Drop image or click to upload';
    photoDrop.style.backgroundImage = '';
    photoDrop.style.backgroundSize = '';
    photoDrop.style.color = '';
  }
  const lw = document.getElementById('last_watered');
  if (lw) lw.value = new Date().toISOString().split('T')[0];
  userWaterFreqEdited = false;
  editingPlantId = null;
  form.querySelector('button[type="submit"]').innerHTML = ICONS.plus + ' Add Plant';
  document.getElementById('cancel-edit').style.display = 'none';
  document.getElementById('search-input').value = '';
  form.style.display = 'none';
  const btn = document.getElementById('show-add-form');
  if (btn) btn.style.display = 'inline-block';
}

async function exportPlantsJSON() {
  try {
    const res = await fetch(`api/get_plants.php${showArchive ? '?archived=1' : ''}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plants.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    showToast('Export failed. Please try again.', true);
  }
}

async function exportPlantsCSV() {
  try {
    const res = await fetch(`api/export_plants_csv.php${showArchive ? '?archived=1' : ''}`);
    if (!res.ok) throw new Error();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plants.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (e) {
    showToast('Export failed. Please try again.', true);
  }
}

async function exportPlantsBoth() {
  await exportPlantsJSON();
  await exportPlantsCSV();
}

// --- main render & filter loop ---
async function loadPlants() {
  const list = document.getElementById('plant-grid');
  toggleLoading(true);
  if (list) list.classList.add('updating-grid');
  try {
    const res = await fetch(`api/get_plants.php${showArchive ? '?archived=1' : ''}`);
    if (res.status === 401) {
      console.warn('Unauthorized while loading plants');
      showToast('Please log in', true);
      window.showOverlay?.();
      return;
    }
    if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
    const plants = await res.json();
    plantCache = plants;
    if (list) {
      list.classList.toggle('list-view', viewMode === 'list');
      list.classList.toggle('text-view', viewMode === 'text');
    }
  const roomSelect = document.getElementById('room-filter');
  const selectedRooms = roomSelect ? Array.from(roomSelect.selectedOptions).map(o => o.value) : [];
  const statusFilter = document.getElementById('status-filter')
    ? document.getElementById('status-filter').value
    : 'all';
  const typeFilters = Array.from(
    document.querySelectorAll('#type-filters input:checked')
  ).map(cb => cb.value);


  const rainEl = document.getElementById('rainfall-info');
  if (rainEl) {
    const showRain = selectedRooms.length === 1 && selectedRooms[0].toLowerCase() === 'outside';
    if (
      showRain &&
      rainForecastInches.length === 3
    ) {
      const nextText = rainForecastInches
        .map((r, idx) => {
          const d = new Date();
          d.setDate(d.getDate() + idx);
          const day = d.toLocaleDateString(undefined, { weekday: 'short' });
          return `${day}: ${r.toFixed(2)} in`;
        })
        .join(', ');
      rainEl.innerHTML =
        `<div class="summary-row">
            <span class="summary-item">${ICONS.rain} Next 3 days: ${nextText}</span>
        </div>`;
      rainEl.classList.remove('hidden');
    } else {
      rainEl.classList.add('hidden');
      rainEl.innerHTML = '';
    }
  }
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
  const startOfDayAfterTomorrow = addDays(startOfTomorrow,1);

  list.innerHTML = '';

  // global counts used for summary regardless of filter
  const totalPlants = plants.length;
  let wateringDue = 0,
      fertilizingDue = 0;
  const roomCounts = {};
  const roomDueCounts = {};
  plants.forEach(plant => {
    const waterDue = needsWatering(plant, today);
    const fertDue = needsFertilizing(plant, today);
    if (waterDue) wateringDue++;
    if (fertDue) fertilizingDue++;
    if (plant.room) {
      roomCounts[plant.room] = (roomCounts[plant.room] || 0) + 1;
      if (waterDue || fertDue) {
        roomDueCounts[plant.room] = (roomDueCounts[plant.room] || 0) + 1;
      }
    }
  });

  filterCounts.watering = wateringDue;
  filterCounts.fertilizing = fertilizingDue;

  let needsCareCount = 0;
  plants.forEach(plant => {
    if (needsWatering(plant, today) || needsFertilizing(plant, today)) {
      needsCareCount++;
    }
  });
  filterCounts.needsCare = needsCareCount;

  const filtered = plants.filter(plant => {
    if (selectedRooms.length && !selectedRooms.includes(plant.room)) return false;
    const haystack = (plant.name + ' ' + plant.species).toLowerCase();
    if (searchQuery && !haystack.includes(searchQuery)) return false;

    const waterDue = needsWatering(plant, today);
    const fertDue = needsFertilizing(plant, today);
    if (statusFilter === 'water' && !waterDue) return false;
    if (statusFilter === 'fert' && !fertDue) return false;
    if (statusFilter === 'any' && !(waterDue || fertDue)) return false;

    if (typeFilters.length) {
      let ptype = plant.plant_type || '';
      if (ptype === 'flower') ptype = 'flower';
      if (!typeFilters.includes(ptype)) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="no-results">No plants match your filters.</p>';
  }

  // update summary counts using totals from all plants
  updateSegments(totalPlants, wateringDue, fertilizingDue);
  const summaryEl = document.getElementById('summary');
  const countsEl = document.getElementById('summary-counts');
  const roomSummaryEl = document.getElementById('room-summary');
  const dateContainer = document.getElementById('summary-date');
  const weatherContainer = document.getElementById('summary-weather');

  if (countsEl) countsEl.innerHTML = '';
  if (roomSummaryEl) roomSummaryEl.innerHTML = '';
  const row1Items = [
    { html: `${ICONS.plant} ${totalPlants} plants`, status: 'all', cls: 'summary-plants' },
    { html: `${ICONS.water} ${wateringDue} need watering`, status: 'water', cls: 'summary-water' },
    { html: `${ICONS.fert} ${fertilizingDue} need fertilizing`, status: 'fert', cls: 'summary-fert' }
  ];
  if (selectedRooms.length === 1 && roomSummaryEl) {
    const roomName = selectedRooms[0];
    const count = roomCounts[roomName] || 0;
    const due = roomDueCounts[roomName] || 0;
    const dueText = due ? ` — ${due} need care` : '';
    const roomItem = document.createElement('span');
    roomItem.classList.add('summary-item', 'summary-room');
    roomItem.innerHTML = `${count} in ${roomName}${dueText}`;
    roomSummaryEl.appendChild(roomItem);
  }
  row1Items.forEach(item => {
    const span = document.createElement('span');
    span.classList.add('summary-item');
    if (item.cls) span.classList.add(item.cls);
    span.innerHTML = item.html;
    if (item.status) {
      span.dataset.status = item.status;
      span.setAttribute('role', 'button');
      span.setAttribute('aria-pressed', item.status === statusFilter);
      span.tabIndex = 0;
      if (item.status === statusFilter) {
        span.classList.add('active');
      }
      span.addEventListener('click', () => {
        const dueInput = document.getElementById('status-filter');
        if (dueInput) {
          dueInput.value = item.status;
          dueInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (countsEl) {
          countsEl.querySelectorAll('.summary-item').forEach(s => {
            s.setAttribute('aria-pressed', s === span);
          });
        }
      });
      span.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          span.click();
        }
      });
    }
    if (countsEl) countsEl.appendChild(span);
  });

  if (dateContainer) {
    dateContainer.classList.add('summary-item');
    dateContainer.innerHTML = `${ICONS.calendar} ${todayStr}`;
  }

  if (weatherContainer) {
    weatherContainer.innerHTML = '';
    if (currentWeather) {
      weatherContainer.classList.add('summary-item');
      const icon = document.createElement('img');
      icon.id = 'weather-icon';
      icon.classList.add('weather-icon');
      icon.src = currentWeatherIcon;
      icon.alt = currentWeatherDesc;
      icon.title = currentWeatherDesc;
      weatherContainer.appendChild(icon);
      weatherContainer.insertAdjacentText('beforeend', ` ${currentWeather}`);
    }
  }

  if (summaryEl) summaryEl.classList.add('show');

  const statusLabel = document.getElementById('status-chip-label');
  const alertBadge = document.getElementById('needs-care-alert');
  if (statusLabel) {
    statusLabel.textContent = statusFilter === 'any' ? 'Show All' : 'Needs Care';
  }
  if (alertBadge) {
    alertBadge.textContent = needsCareCount ? String(needsCareCount) : '';
    alertBadge.classList.toggle('hidden', needsCareCount === 0);
  }



  const sortBy = document.getElementById('sort-toggle').value || 'due';
  filtered.sort((a, b) => {
    if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    }
    if (sortBy === 'due') {
      return getSoonestDueDate(a) - getSoonestDueDate(b);
    }
    if (sortBy === 'added') {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    return a.name.localeCompare(b.name);
  });

  filtered.forEach(plant => {
    const wrapper = document.createElement('div');
    wrapper.classList.add('plant-card-wrapper');
    wrapper.id = `plant-${plant.id}`;

    const overlay = document.createElement('div');
    overlay.classList.add('swipe-overlay');
    overlay.innerHTML = ICONS.check;
    wrapper.appendChild(overlay);

    const card = document.createElement('div');
    card.classList.add('plant-card');
    if (showArchive) {
      card.classList.add('archived');
    }
    if (viewMode !== 'text') {
      card.classList.add('shadow');
    }
    if (plant.id === window.lastUpdatedPlantId) {
      card.classList.add('just-updated');
      setTimeout(() => card.classList.remove('just-updated'), 2000);
    }
    const soonest = getSoonestDueDate(plant);
    let urgencyClass = '';
    let urgencyText = '';
    let urgencyTag = null;
    if (!showArchive) {
      if (soonest < startOfToday) {
        card.classList.add('due-overdue');
        urgencyClass = 'urgency-overdue';
        const overdueDays = Math.floor((startOfToday - soonest) / 86400000);
        urgencyText = `Overdue by ${overdueDays} day${overdueDays !== 1 ? 's' : ''}`;
      } else if (soonest < startOfTomorrow) {
        card.classList.add('due-today');
        urgencyClass = 'urgency-today';
        urgencyText = 'Due Today';
      } else if (soonest < startOfDayAfterTomorrow) {
        card.classList.add('due-future');
        urgencyClass = 'urgency-future';
        urgencyText = 'Upcoming';
      }

      if (urgencyText) {
        urgencyTag = document.createElement('span');
        urgencyTag.classList.add('urgency-tag', urgencyClass);
        urgencyTag.textContent = urgencyText;
      }
    }

    const img = document.createElement('img');
    const photoSrc = plant.photo_url || plant.thumbnail_url ||
      'https://placehold.co/600x600?text=Add+Photo';
    img.src = photoSrc;
    if (plant.photo_url || plant.thumbnail_url) {
      img.alt = plant.name;
    } else {
      img.alt = 'No photo available for ' + plant.name;
    }
    img.loading = 'lazy';
    img.width = 300;
    img.height = 300;
    if (photoSrc.endsWith('.webp')) {
      const base = photoSrc.slice(0, -5);
      img.srcset = `${base}-400.webp 400w, ${photoSrc} 800w`;
      img.sizes = '(max-width: 640px) 100vw, 400px';
    }
    img.classList.add('plant-photo');
    const photoWrap = document.createElement('div');
    photoWrap.classList.add('photo-wrap');
    photoWrap.appendChild(img);

    const infoWrap = document.createElement('div');
    infoWrap.classList.add('plant-info');

    const titleEl = document.createElement('h3');
    titleEl.classList.add('plant-title');
    titleEl.textContent = plant.name;

    const speciesEl = document.createElement('div');
    speciesEl.classList.add('plant-species');
    speciesEl.textContent = plant.species;
    speciesEl.title = plant.species;

    if (viewMode === 'list') {
      const header = document.createElement('div');
      header.classList.add('list-header');
      const nameWrap = document.createElement('div');
      nameWrap.classList.add('name-wrap');
      nameWrap.appendChild(titleEl);
      nameWrap.appendChild(speciesEl);
      header.appendChild(photoWrap);
      header.appendChild(nameWrap);
      if (urgencyTag) header.appendChild(urgencyTag);
      card.appendChild(header);
    } else {
      card.appendChild(photoWrap);
      if (urgencyTag) card.appendChild(urgencyTag);
      infoWrap.appendChild(titleEl);
      infoWrap.appendChild(speciesEl);
    }

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
      const amtTag = document.createElement('span');
      amtTag.classList.add('tag', 'amt-tag');
      amtTag.innerHTML = formatWaterAmount(ml);
      amtTag.title = amtTag.textContent;
      tagList.appendChild(amtTag);
    }

    let summary;
    if (viewMode === 'list') {
      summary = document.createElement('div');
      summary.classList.add('list-summary-row');
      if (tagList.childElementCount > 0) {
        summary.appendChild(tagList);
      }
    } else {
      if (tagList.childElementCount > 0) {
        infoWrap.appendChild(tagList);
      }
      summary = document.createElement('div');
      summary.classList.add('plant-summary');

      const heading = document.createElement('div');
      heading.classList.add('schedule-heading');
      heading.textContent = 'Care Schedule';
      summary.appendChild(heading);

      const waterSummary = document.createElement('div');
      waterSummary.classList.add('summary-item');
      const waterIconWrap = document.createElement('span');
      waterIconWrap.innerHTML = ICONS.water;
      const nextWater = getNextWaterDate(plant);
      const waterNext = nextWater ? formatDateShort(nextWater) : 'N/A';
      const waterText = document.createElement('span');
      const waterFreq = formatFrequency(plant.watering_frequency);
      waterText.textContent =
        `Water ${waterFreq} (last: ${formatDateShort(plant.last_watered)}; next: ${waterNext})`;
      waterSummary.appendChild(waterIconWrap);
      waterSummary.appendChild(waterText);
      summary.appendChild(waterSummary);

      const fertSummary = document.createElement('div');
      fertSummary.classList.add('summary-item');
      const fertIconWrap = document.createElement('span');
      fertIconWrap.innerHTML = ICONS.fert;
      const fertFreq = plant.fertilizing_frequency
        ? formatFrequency(plant.fertilizing_frequency)
        : 'as needed';
      const fertNext = getNextFertDate(plant);
      const fertText = document.createElement('span');
      const fertNextStr = fertNext ? formatDateShort(fertNext) : 'N/A';
      fertText.textContent =
        `Fertilize ${fertFreq} (last: ${formatDateShort(plant.last_fertilized)}; next: ${fertNextStr})`;
      fertSummary.appendChild(fertIconWrap);
      fertSummary.appendChild(fertText);
      summary.appendChild(fertSummary);
    }

    infoWrap.appendChild(summary);
    card.appendChild(infoWrap);

    card.dataset.plantId = plant.id;

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('actions');

    const waterDue = needsWatering(plant, today);
    const fertDue = needsFertilizing(plant, today);

    if (waterDue) {
      const btn = document.createElement('button');
      btn.classList.add('action-btn', 'due-task', 'water-due');
      btn.innerHTML = ICONS.water + '<span class="visually-hidden">Water</span>';
      btn.title = 'Water Now';
      btn.onclick = () => markActionsWithUndo(plant, card, ['watered']);
      actionsDiv.appendChild(btn);

      const snooze = document.createElement('select');
      snooze.classList.add('snooze-select', 'water-snooze');
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
      actionsDiv.appendChild(snooze);
    }

    if (fertDue) {
      const btn = document.createElement('button');
      btn.classList.add('action-btn', 'due-task', 'fert-due');
      btn.innerHTML = ICONS.fert + '<span class="visually-hidden">Fertilize</span>';
      btn.title = 'Fertilize Now';
      btn.onclick = () => markActionsWithUndo(plant, card, ['fertilized']);
      actionsDiv.appendChild(btn);

      const snooze = document.createElement('select');
      snooze.classList.add('snooze-select', 'fert-snooze');
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
      actionsDiv.appendChild(snooze);
    }

    const analyticsLink = document.createElement('a');
    analyticsLink.classList.add('action-btn');
    analyticsLink.innerHTML = ICONS.analytics + '<span class="visually-hidden">Analytics</span>';
    analyticsLink.title = 'Analytics';
    analyticsLink.href = `analytics.html?plant_id=${plant.id}`;
    analyticsLink.target = '_blank';
    analyticsLink.rel = 'noopener';
    analyticsLink.style.marginLeft = 'auto';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = () => {
      if (fileInput.files[0]) {
        updatePlantPhoto(plant, fileInput.files[0]);
      }
    };

    const overflow = document.createElement('div');
    overflow.classList.add('overflow-container');

    const menuBtn = document.createElement('button');
    menuBtn.classList.add('action-btn', 'menu-btn');
    menuBtn.innerHTML = ICONS.menu + '<span class="visually-hidden">More</span>';
    overflow.appendChild(menuBtn);

    const menu = document.createElement('div');
    menu.classList.add('overflow-menu');
    overflow.appendChild(menu);

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
      menu.classList.remove('show');
    };
    menu.appendChild(editBtn);

    const dupBtn = document.createElement('button');
    dupBtn.classList.add('action-btn', 'duplicate-btn');
    dupBtn.innerHTML = ICONS.duplicate + '<span class="visually-hidden">Duplicate</span>';
    dupBtn.title = 'Duplicate';
    dupBtn.type = 'button';
    dupBtn.onclick = () => {
      duplicatePlant(plant);
      menu.classList.remove('show');
    };
    menu.appendChild(dupBtn);

    const delBtn = document.createElement('button');
    delBtn.classList.add('action-btn', 'delete-btn');
    delBtn.innerHTML = ICONS.trash + '<span class="visually-hidden">Delete</span>';
    delBtn.title = 'Delete';
    delBtn.onclick = () => {
      showUndoBanner(plant);
      menu.classList.remove('show');
    };
    menu.appendChild(delBtn);

    const archBtn = document.createElement('button');
    archBtn.classList.add('action-btn');
    archBtn.innerHTML =
      (showArchive ? ICONS.undo : ICONS.archive) +
      `<span class="visually-hidden">${showArchive ? 'Restore' : 'Archive'}</span>`;
    archBtn.title = showArchive ? 'Restore' : 'Archive';
    archBtn.type = 'button';
    archBtn.onclick = () => {
      archivePlant(plant.id, !showArchive);
      menu.classList.remove('show');
    };
    menu.appendChild(archBtn);

    const changeBtn = document.createElement('button');
    changeBtn.classList.add('action-btn', 'photo-btn');
    changeBtn.innerHTML = ICONS.photo + '<span class="visually-hidden">Change Photo</span>';
    changeBtn.type = 'button';
    changeBtn.title = 'Add Image';
    changeBtn.onclick = () => {
      fileInput.click();
      menu.classList.remove('show');
    };
    menu.appendChild(changeBtn);


    menuBtn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('show');
    };

    document.addEventListener('click', (e) => {
      if (!overflow.contains(e.target)) {
        menu.classList.remove('show');
      }
    });

    if (viewMode === 'list') {
      summary.appendChild(analyticsLink);
      summary.appendChild(overflow);
      summary.appendChild(fileInput);
    } else {
      actionsDiv.appendChild(analyticsLink);
      actionsDiv.appendChild(overflow);
      actionsDiv.appendChild(fileInput);
    }

    card.appendChild(actionsDiv);
    wrapper.appendChild(card);

    if (viewMode === 'list') {
      enableSwipeComplete(card, overlay, plant, waterDue, fertDue);
    }

    list.appendChild(wrapper);
  });

  if (focusPlantId) {
    const el = document.getElementById(`plant-${focusPlantId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('just-updated');
      setTimeout(() => el.classList.remove('just-updated'), 2000);
      history.replaceState(null, '', location.pathname + '#plant-' + focusPlantId);

      const clearHash = () => {
        history.replaceState(null, '', location.pathname);
        focusPlantId = null;
        document.removeEventListener('click', clearHash);
      };
      document.addEventListener('click', clearHash, { once: true });
    }
  }

  // refresh room filter and datalist

  const roomSet = new Set();
  plants.forEach(p => { if (p.room) roomSet.add(p.room); });
  const rooms = Array.from(roomSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  const filter = document.getElementById('room-filter');
  if (filter) {
    const current = Array.from(filter.selectedOptions).map(o => o.value);
    filter.innerHTML = '';
    rooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      if (current.includes(r)) opt.selected = true;
      filter.appendChild(opt);
    });
  }

  const datalist = document.getElementById('room-options');
  if (datalist) {
    datalist.innerHTML = '';
    rooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      datalist.appendChild(opt);
    });
  }

  checkArchivedLink(plants);
  loadCalendar(plants);
  } catch (err) {
    console.error('Failed to load plants', err);
    showToast('Failed to load plants', true);
  } finally {
    if (list) list.classList.remove('updating-grid');
    toggleLoading(false);
  }
}

async function checkArchivedLink(plantsList) {
  const link = document.getElementById('archived-link');
  if (!link) return;
  const select = document.getElementById('room-filter');
  const rooms = select ? Array.from(select.selectedOptions).map(o => o.value) : [];
  const room = rooms.length === 1 ? rooms[0] : null;
  if (showArchive) {
    link.textContent = 'Back to active plants';
    link.classList.remove('hidden');
    return;
  }
  if (!room) {
    link.classList.add('hidden');
    return;
  }
  if (!archivedCache) {
    try {
      const res = await fetch('api/get_plants.php?archived=1');
      archivedCache = await res.json();
    } catch (err) {
      console.error('Failed to fetch archived plants', err);
      return;
    }
  }
  const count = archivedCache.filter(p => p.room === room).length;
  if (count > 0) {
    link.innerHTML = ICONS.archive + ` Archived (${count})`;
    link.classList.remove('hidden');
  } else {
    link.classList.add('hidden');
  }
}

// --- init ---
async function init(){
  const showBtn = document.getElementById('show-add-form');
  const exportBtn = document.getElementById('export-all');
  const form = document.getElementById('plant-form');
  const cancelBtn = document.getElementById('cancel-edit');
  const undoBtn = document.getElementById('undo-btn');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const roomFilter = document.getElementById('room-filter');
  const archivedLink = document.getElementById('archived-link');
  const sortToggle = document.getElementById('sort-toggle');
  const dueFilterEl = document.getElementById('status-filter');
  const filterPanel = document.getElementById('filter-panel');
  const filterToggle = document.getElementById('filter-toggle');
  const viewButtons = document.querySelectorAll('#view-toggle .view-toggle-btn');
  const prevBtn = document.getElementById('prev-week');
  const nextBtn = document.getElementById('next-week');
  const toolbar = document.querySelector('.toolbar');
  const searchInputEl = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const clearFiltersBtn = document.getElementById('clear-filters');
  const segButtons = document.querySelectorAll('#status-segments button');

  const calendarEl = document.getElementById('calendar');
  const calendarHeading = document.getElementById('calendar-heading');
  const summaryDate = document.getElementById('summary-date');

  const photoDrop = document.getElementById('photo-drop');
  const photoInput = document.getElementById('photo');
  const waterFreqInput = document.getElementById('watering_frequency');
  const waterAmtInput = document.getElementById('water_amount');
  const potDiamInput = document.getElementById('pot_diameter');
  const plantTypeSelect = document.getElementById('plant_type');
  const overrideCheck = document.getElementById('override_water');
  const waterGroup = document.getElementById('water-amount-group');
  const autoWaterDisplay = document.getElementById('auto-water-display');
  const roomInput = document.getElementById('room');
  const nameInput = document.getElementById('name');
  const speciesInput = document.getElementById('species');
  const potHelp = document.getElementById('pot_diameter_help');
  const speciesList = document.getElementById('species-list');
  suggestionList = document.getElementById('name-suggestions');
  const sciNameInput = document.getElementById('scientific_name');
  const imageUrlInput = document.getElementById('thumbnail_url');
  const previewImg = document.getElementById('name-preview');


  // populate datalists from saved history
  const savedRooms = loadHistoryValues('rooms');
  const roomDatalist = document.getElementById('room-options');
  if (roomDatalist && savedRooms.length) {
    savedRooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r;
      roomDatalist.appendChild(opt);
    });
  }




  // apply saved preferences before initial load
  migrateFilterPrefs();
  loadFilterPrefs();

  applyViewMode();
  updateFilterChips();
  updateSegments(0, 0, 0);

  if (summaryDate && calendarHeading) {
    summaryDate.setAttribute('role', 'button');
    summaryDate.tabIndex = 0;
    summaryDate.addEventListener('click', () => {
      calendarHeading.scrollIntoView({ behavior: 'smooth' });
    });
    summaryDate.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        summaryDate.click();
      }
    });
  }

  segButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      if (dueFilterEl) {
        dueFilterEl.value = status;
        dueFilterEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      segButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
  });


  if (showBtn) {
    showBtn.innerHTML = ICONS.plus + '<span class="visually-hidden">Add a Plant</span>';
  }
  if (exportBtn) {
    exportBtn.innerHTML = ICONS.download + '<span class="visually-hidden">Export</span>';
    exportBtn.addEventListener('click', exportPlantsBoth);
  }
  if (cancelBtn) {
    cancelBtn.innerHTML = ICONS.cancel + ' Cancel';
  }
  if (undoBtn) {
    undoBtn.innerHTML = ICONS.undo + ' Undo';
  }


  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const expanded = filterPanel.classList.toggle('show');
      filterToggle.setAttribute('aria-expanded', expanded);
      filterPanel.setAttribute('aria-hidden', !expanded);
    });
    document.addEventListener('click', (e) => {
      if (!filterPanel.contains(e.target) && e.target !== filterToggle) {
        filterPanel.classList.remove('show');
        filterToggle.setAttribute('aria-expanded', 'false');
        filterPanel.setAttribute('aria-hidden', 'true');
      }
    });
  }
  if (submitBtn) {
    submitBtn.innerHTML = ICONS.plus + ' Add Plant';
  }
  if (prevBtn) {
    prevBtn.innerHTML = ICONS.left + '<span class="visually-hidden">Previous Week</span>';
  }
  if (nextBtn) {
    nextBtn.innerHTML = ICONS.right + '<span class="visually-hidden">Next Week</span>';
  }
  if (showBtn && form) {
    showBtn.addEventListener('click', () => {
      form.style.display = 'block';
      showBtn.style.display = 'none';
      const cancel = document.getElementById('cancel-edit');
      if (cancel) cancel.style.display = 'inline-block';
      const lw = document.getElementById('last_watered');
      if (lw && !editingPlantId) lw.value = new Date().toISOString().split('T')[0];
      userWaterFreqEdited = false;
      updateWateringFrequency();
    });
  }
  document.getElementById('undo-btn').addEventListener('click', async () => {
    const banner = document.getElementById('undo-banner');
    banner.classList.remove('show');
    banner.setAttribute('aria-hidden', 'true');
    if (lastDeletedPlant) {
      clearTimeout(deleteTimer);
      lastDeletedPlant = null;
    } else if (lastCompletedAction) {
      clearTimeout(actionTimer);
      const { plant, actions, prevWater, prevFert } = lastCompletedAction;
      if (actions.includes('watered')) {
        await updatePlantInline(plant, 'last_watered', prevWater);
      }
      if (actions.includes('fertilized')) {
        await updatePlantInline(plant, 'last_fertilized', prevFert);
      }
      lastCompletedAction = null;
      banner.classList.remove('success');
    }
  });

  if (searchInputEl) {
    const toggleClear = () => {
      if (clearSearchBtn) {
        clearSearchBtn.classList.toggle('hidden', searchInputEl.value === '');
      }
    };
    searchInputEl.addEventListener('input', () => {
      toggleClear();
      loadPlants();
    });
    if (clearSearchBtn) {
      clearSearchBtn.innerHTML = ICONS.cancel;
      clearSearchBtn.addEventListener('click', () => {
        searchInputEl.value = '';
        toggleClear();
        loadPlants();
      });
      toggleClear();
    }
  }
  if (toolbar) {
    // keep the search field visible while scrolling
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      const current = window.scrollY;
      lastScrollY = current;
    });
  }
  document.getElementById('cancel-edit').onclick=resetForm;
  if (photoDrop && photoInput) {
    function previewFile(file) {
      const reader = new FileReader();
      reader.onload = () => {
        photoDrop.style.backgroundImage = `url(${reader.result})`;
        photoDrop.style.backgroundSize = 'cover';
        photoDrop.style.color = 'white';
        photoDrop.textContent = '';
      };
      reader.readAsDataURL(file);
    }
    photoDrop.addEventListener('click', () => photoInput.click());
    photoDrop.addEventListener('dragover', e => { e.preventDefault(); photoDrop.classList.add('dragover'); });
    photoDrop.addEventListener('dragleave', () => photoDrop.classList.remove('dragover'));
    photoDrop.addEventListener('drop', e => {
      e.preventDefault();
      if (e.dataTransfer.files[0]) {
        photoInput.files = e.dataTransfer.files;
        previewFile(e.dataTransfer.files[0]);
      }
      photoDrop.classList.remove('dragover');
    });
    photoInput.addEventListener('change', () => {
      if (photoInput.files[0]) previewFile(photoInput.files[0]);
    });
  }
  if (waterFreqInput) waterFreqInput.addEventListener('input', () => {
    const err = document.getElementById('watering_frequency-error');
    if (parseInt(waterFreqInput.value,10) > 0) err.textContent = '';
    else err.textContent = 'Watering Frequency must be > 0';
    userWaterFreqEdited = true;
  });
  if (waterAmtInput) waterAmtInput.addEventListener('input', () => {
    const err = document.getElementById('water_amount-error');
    const val = waterAmtInput.value.trim();
    if (val === '' || parseFloat(val) > 0) err.textContent = '';
    else err.textContent = 'Enter a positive number.';
  });
  if (potDiamInput) potDiamInput.addEventListener('blur', () => {
    const err = document.getElementById('pot_diameter-error');
    const valStr = potDiamInput.value.trim();
    if (valStr === '') {
      if (err) err.textContent = '';
      return;
    }
    const val = parseFloat(valStr);
    if (!isNaN(val) && val > 0) err.textContent = '';
    else err.textContent = 'Enter a positive number.';
    updateWateringFrequency();
  });
  if (overrideCheck && waterGroup) {
    overrideCheck.addEventListener('change', () => {
      const checked = overrideCheck.checked;
      waterGroup.classList.toggle('hidden', !checked);
      if (autoWaterDisplay) autoWaterDisplay.classList.toggle('hidden', checked);
      if (!checked && waterAmtInput) {
        waterAmtInput.value = '';
        updateWaterAmount();
      }
    });
  }
  if (potHelp) {
    const tip = document.createElement('div');
    tip.className = 'tooltip hidden';
    tip.textContent = 'Measure across the top rim of your pot.';
    potHelp.appendChild(tip);
    const show = () => tip.classList.remove('hidden');
    const hide = () => tip.classList.add('hidden');
    potHelp.addEventListener('click', show);
    potHelp.addEventListener('mouseenter', show);
    potHelp.addEventListener('mouseleave', hide);
    potHelp.addEventListener('blur', hide);
  }
  if (roomInput) {
    let prevRoom = '';
    roomInput.addEventListener('focus', () => {
      prevRoom = roomInput.value;
      roomInput.value = '';
      if (typeof roomInput.showPicker === 'function') {
        try { roomInput.showPicker(); } catch (e) {}
      }
    });
    roomInput.addEventListener('blur', () => {
      if (!roomInput.value) {
        roomInput.value = prevRoom;
      }
    });
  }
  if (nameInput && speciesInput && speciesList) {
    let lastNameQuery = '';
    nameInput.addEventListener('input', debounce(async () => {
      const query = nameInput.value.trim();
      if (query === lastNameQuery) return;
      lastNameQuery = query;
      if (!query) {
        speciesList.innerHTML = '';
        return;
      }
      const names = await fetchScientificNames(query);
      speciesList.innerHTML = names
        .map(n => `<option value="${n}"></option>`)
        .join('');
    }, 300));
  }
  if (speciesInput && speciesList) {
    let lastQuery = '';
    speciesInput.addEventListener('input', debounce(async () => {
      const query = speciesInput.value.trim();
      if (query === lastQuery) return;
      lastQuery = query;
      if (!query) {
        speciesList.innerHTML = '';
        showTaxonomyInfo('');
        return;
      }
      const names = await fetchScientificNames(query);
      speciesList.innerHTML = names
        .map(n => `<option value="${n}"></option>`)
        .join('');
    }, 300));
    speciesInput.addEventListener('change', () => {
      showTaxonomyInfo(speciesInput.value.trim());
    });
  }

  if (nameInput && suggestionList) {
    let lastLookup = '';
    nameInput.addEventListener('input', () => {
      const q = nameInput.value.trim();
      if (q === lastLookup) return;
      lastLookup = q;
      debouncedLookupPlants(q);
    });
    nameInput.addEventListener('focus', () => {
      if (suggestionList.children.length) suggestionList.classList.remove('hidden');
    });
    nameInput.addEventListener('blur', () => {
      setTimeout(() => suggestionList.classList.add('hidden'), 100);
    });
    suggestionList.addEventListener('click', e => {
      if (e.target.tagName === 'LI') {
        nameInput.value = e.target.textContent;
        if (speciesInput) {
          speciesInput.value = e.target.dataset.sci || '';
          speciesInput.dispatchEvent(new Event('change'));
        }
        if (imageUrlInput) imageUrlInput.value = e.target.dataset.img || '';
        if (previewImg && e.target.dataset.img) {
          previewImg.src = e.target.dataset.img;
          previewImg.classList.remove('hidden');
        }
        suggestionList.classList.add('hidden');
      }
    });
  }
  const potDiamUnit = document.getElementById('pot_diameter_unit');
  if (potDiamInput) potDiamInput.addEventListener('input', () => {updateWaterAmount(); updateWateringFrequency();});
  if (potDiamUnit) potDiamUnit.addEventListener('change', () => {updateWaterAmount(); updateWateringFrequency();});
  if (plantTypeSelect) plantTypeSelect.addEventListener('change', () => {updateWaterAmount(); updateWateringFrequency();});
  document.getElementById('plant-form').addEventListener('submit',async e=>{
    e.preventDefault(); const form=e.target;
    if (!validateForm(form)) return;
    const data=new FormData(form);
    if(form.photo_url) data.set('photo_url', form.photo_url.value);
    if (form.water_amount) {
      const val = form.water_amount.value.trim();
      data.set('water_amount', val === '' ? '' : parseWaterAmount(val));
    }
    const btn=form.querySelector('button[type="submit"]');
    btn.disabled=true;
    btn.innerHTML=(editingPlantId?ICONS.check:ICONS.plus)+
                  (editingPlantId?' Updating...':' Adding...');
    toggleLoading(true);
    try{
      let resp;
      if(editingPlantId){ data.append('id', editingPlantId); resp=await fetch('api/update_plant.php',{method:'POST',body:data}); }
      else{ resp=await fetch('api/add_plant.php',{method:'POST',body:data}); }
      if(!resp.ok) throw new Error();
      if (!editingPlantId) {
        const nameVal = form.name.value.trim();
        const roomVal = form.room.value.trim();
        saveHistoryValue('plantNames', nameVal);
        saveHistoryValue('rooms', roomVal);
        const roomList = document.getElementById('room-options');
        if (roomList && roomVal) {
          const opt = document.createElement('option');
          opt.value = roomVal;
          roomList.appendChild(opt);
        }
      }
      showToast(editingPlantId?'Plant updated!':'Plant added!');
      resetForm();
      loadPlants();
    }catch{
      showToast('An error occurred. Please try again.', true);
    }finally{
      toggleLoading(false);
      btn.disabled=false;
      btn.innerHTML = editingPlantId
        ? ICONS.check + ' Update Plant'
        : ICONS.plus + ' Add Plant';
    }
  });

  if (roomFilter) {
    roomFilter.addEventListener('change', async () => {
      saveFilterPrefs();
      await loadPlants();
      checkArchivedLink();
      updateFilterChips();
      if (filterPanel && !roomFilter.hasAttribute('multiple')) {
        filterPanel.classList.remove('show');
        filterToggle.setAttribute('aria-expanded', 'false');
        filterPanel.setAttribute('aria-hidden', 'true');
      }
    });
  }
  if (sortToggle) {
    sortToggle.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
      updateFilterChips();
      if (filterPanel) {
        filterPanel.classList.remove('show');
        filterToggle.setAttribute('aria-expanded', 'false');
        filterPanel.setAttribute('aria-hidden', 'true');
      }
    });
  }
  if (dueFilterEl) {
    dueFilterEl.addEventListener('change', () => {
      saveFilterPrefs();
      updateSegments(0, 0, 0);
      loadPlants();
      updateFilterChips();
      if (filterPanel) {
        filterPanel.classList.remove('show');
        filterToggle.setAttribute('aria-expanded', 'false');
        filterPanel.setAttribute('aria-hidden', 'true');
      }
    });
  }

  const extraFilterInputs = document.querySelectorAll('#type-filters input');
  extraFilterInputs.forEach(input => {
    input.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
      updateFilterChips();
    });
  });

  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener('click', async () => {
      if (roomFilter) Array.from(roomFilter.options).forEach(o => o.selected = false);
      if (dueFilterEl) dueFilterEl.value = 'all';
      document.querySelectorAll('#type-filters input').forEach(cb => {
        cb.checked = false;
      });
      saveFilterPrefs();
      await loadPlants();
      updateFilterChips();
    });
  }



  if (viewButtons.length) {
    viewButtons.forEach(btn => {
      // Inject icons if they haven't been added yet
      if (!btn.querySelector('svg')) {
        const label = btn.dataset.view.charAt(0).toUpperCase() + btn.dataset.view.slice(1);
        btn.innerHTML = `${ICONS[btn.dataset.view] || ''}<span class="visually-hidden">${label}</span>`;
      }
      btn.addEventListener('click', () => {
        viewMode = btn.dataset.view;
        applyViewMode();
        loadPlants();
      });
    });
    applyViewMode();
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
  if (archivedLink) {
    archivedLink.addEventListener('click', e => {
      e.preventDefault();
      showArchive = !showArchive;
      loadPlants();
      checkArchivedLink();
    });
  }
  loadPlants();
  syncPendingActions();
  fetchWeather();
  setInterval(fetchWeather, WEATHER_UPDATE_INTERVAL);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { loadCalendar, focusPlantId, loadPlants, updateFilterChips, loadFilterPrefs };
