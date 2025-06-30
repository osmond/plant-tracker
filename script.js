let editingPlantId = null;
let lastDeletedPlant = null;
let deleteTimer = null;

// preferred layout for plant cards
let viewMode = localStorage.getItem('viewMode') || 'grid';
let archiveMode = localStorage.getItem('archiveMode') || 'active';
// track weather info so the summary can include current conditions
let currentWeather = null;
let currentWeatherIcon = null;
let currentWeatherDesc = null;

// public OpenWeather API key provided by user
const WEATHER_API_KEY = '2aa3ade8428368a141f7951420570c16';

// number of milliliters in one US fluid ounce
const ML_PER_US_FL_OUNCE = 29.5735;
const CM_PER_INCH = 2.54;

// how often to refresh weather data (ms)
const WEATHER_UPDATE_INTERVAL = 60 * 60 * 1000; // 1 hour

// configuration values mirrored from config.php
const RA = 20.0;
const DEFAULT_KC = 0.8;
// GBIF backbone usageKey for Plantae
const PLANTAE_KEY = 6;
// number of specimen photos to show for taxonomy lookup
const SPECIMEN_PHOTO_LIMIT = 8;
const KC_MAP = {
  succulent: 0.3,
  houseplant: 0.8,
  vegetable: 1.0,
  flower: 0.9,
  cacti: 0.28,
};

let weatherTminC = null;
let weatherTmaxC = null;

// forecast rainfall totals in inches (initialized to zeros in case fetch fails)
let rainForecastInches = [0, 0, 0];

let userWaterFreqEdited = false;

// starting date for the calendar view
let calendarStartDate = new Date();
calendarStartDate.setHours(0, 0, 0, 0);

// simple in-memory caches for taxonomy lookups
const classificationCache = new Map();
const commonNamesCache = new Map();
const synonymsCache = new Map();
const specimenPhotosCache = new Map();
const speciesKeyCache = new Map();

function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
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
  return `<span class="oz-line">${ozDisplay}oz</span>` +
         `<span class="ml-line">(${mlDisplay} ml)</span>`;
}

function calculateET0(tmin, tmax) {
  const tavg = (tmin + tmax) / 2;
  return 0.0023 * (tavg + 17.8) * Math.sqrt(Math.max(0, tmax - tmin)) * RA;
}

function computeArea(diameterCm) {
  const r = diameterCm / 2;
  return Math.PI * r * r;
}

async function fetchScientificNames(query) {
  if (!query) return [];
  if (speciesKeyCache.has(`s:${query}`)) return speciesKeyCache.get(`s:${query}`);
  try {
    const params = new URLSearchParams({
      q: query,
      limit: '10',
      kingdomKey: PLANTAE_KEY,
      rank: 'SPECIES',
      status: 'ACCEPTED'
    });
    const res = await fetch(`https://api.gbif.org/v1/species/search?${params}`);
    if (!res.ok) return [];
    const json = await res.json();
    const names = (json.results || [])
      .map(r => r.scientificName)
      .filter(Boolean);
    speciesKeyCache.set(`s:${query}`, names);
    return names;
  } catch (e) {
    return [];
  }
}

async function fetchCommonNameSuggestions(query) {
  if (!query) return [];
  const key = await getSpeciesKey(query);
  if (!key) return [];
  return fetchCommonNames(key);
}

async function getSpeciesKey(name) {
  if (!name) return null;
  if (speciesKeyCache.has(name)) return speciesKeyCache.get(name);
  try {
    const res = await fetch(
      `https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const key = json.usageKey || null;
    speciesKeyCache.set(name, key);
    return key;
  } catch (e) {
    return null;
  }
}

async function fetchClassification(key) {
  if (!key) return '';
  if (classificationCache.has(key)) return classificationCache.get(key);
  try {
    const res = await fetch(`https://api.gbif.org/v1/species/${key}`);
    if (!res.ok) return '';
    const json = await res.json();
    const parts = [
      json.kingdom,
      json.phylum,
      json.class,
      json.order,
      json.family,
      json.genus,
      json.species,
    ];
    const out = parts.filter(Boolean).join(' \u203a ');
    classificationCache.set(key, out);
    return out;
  } catch (e) {
    return '';
  }
}

async function fetchCommonNames(key) {
  if (!key) return [];
  if (commonNamesCache.has(key)) return commonNamesCache.get(key);
  try {
    const res = await fetch(`https://api.gbif.org/v1/species/${key}/vernacularNames`);
    if (!res.ok) return [];
    const json = await res.json();
    const names = [...new Set((json.results || []).map(r => r.vernacularName).filter(Boolean))];
    commonNamesCache.set(key, names);
    return names;
  } catch (e) {
    return [];
  }
}

async function fetchSynonyms(key) {
  if (!key) return [];
  if (synonymsCache.has(key)) return synonymsCache.get(key);
  try {
    const res = await fetch(`https://api.gbif.org/v1/species/${key}/synonyms`);
    if (!res.ok) return [];
    const json = await res.json();
    const arr = Array.isArray(json) ? json : json.results || [];
    const names = [...new Set(arr.map(r => r.scientificName).filter(Boolean))];
    synonymsCache.set(key, names);
    return names;
  } catch (e) {
    return [];
  }
}

async function fetchSpecimenPhotos(key) {
  if (!key) return [];
  if (specimenPhotosCache.has(key)) return specimenPhotosCache.get(key);
  try {
    const imgRes = await fetch(
      `https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&mediaType=StillImage&limit=${SPECIMEN_PHOTO_LIMIT}`
    );
    if (!imgRes.ok) return [];
    const data = await imgRes.json();
    const photos = (data.results || [])
      .flatMap(o => o.media || [])
      .map(m => m.identifier)
      .filter(Boolean);
    specimenPhotosCache.set(key, photos);
    return photos;
  } catch (e) {
    return [];
  }
}

async function showTaxonomyInfo(name) {
  const infoEl = document.getElementById('taxonomy-info');
  if (!infoEl) return;
  infoEl.textContent = '';
  const key = await getSpeciesKey(name);
  if (!key) {
    showToast("Couldn't fetch taxonomy data", true);
    return;
  }
  const [classification, common, syn, photos] = await Promise.all([
    fetchClassification(key),
    fetchCommonNames(key),
    fetchSynonyms(key),
    fetchSpecimenPhotos(key),
  ]);
  if (classification) {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'Classification:';
    div.appendChild(strong);
    div.appendChild(document.createTextNode(' ' + classification));
    infoEl.appendChild(div);
  }
  if (common && common.length) {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'Common Names:';
    div.appendChild(strong);
    div.appendChild(document.createTextNode(' ' + common.join(', ')));
    infoEl.appendChild(div);
  }
  if (syn && syn.length) {
    const div = document.createElement('div');
    const strong = document.createElement('strong');
    strong.textContent = 'Synonyms:';
    div.appendChild(strong);
    div.appendChild(document.createTextNode(' ' + syn.join(', ')));
    infoEl.appendChild(div);
  }
  if (photos && photos.length) {
    const gallery = document.createElement('div');
    gallery.classList.add('specimen-gallery');
    photos.forEach(url => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = name + ' specimen';
      img.loading = 'lazy';

      // allow user to select a specimen photo
      img.addEventListener('click', () => {
        // remove previous selection
        gallery.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
        img.classList.add('selected');

        const photoUrlInput = document.getElementById('photo_url');
        if (photoUrlInput) photoUrlInput.value = url;

        const drop = document.getElementById('photo-drop');
        if (drop) {
          drop.textContent = 'Using specimen photo';
          drop.style.backgroundImage = `url(${url})`;
          drop.style.backgroundSize = 'cover';
          drop.style.color = 'white';
        }
      });

      gallery.appendChild(img);
    });
    infoEl.appendChild(gallery);
  }
}

function updateWaterAmount() {
  const diamInput = document.getElementById('pot_diameter');
  const unitSelect = document.getElementById('pot_diameter_unit');
  const typeSelect = document.getElementById('plant_type');
  const waterAmtInput = document.getElementById('water_amount');
  if (!diamInput || !waterAmtInput) return;
  const diam = parseFloat(diamInput.value);
  if (isNaN(diam) || weatherTminC === null || weatherTmaxC === null) return;
  const unit = unitSelect ? unitSelect.value : 'cm';
  const diamCm = unit === 'in' ? diam * CM_PER_INCH : diam;
  const plantType = typeSelect ? typeSelect.value : null;
  let kc = DEFAULT_KC;
  if (plantType && KC_MAP[plantType] !== undefined) kc = KC_MAP[plantType];
  const et0 = calculateET0(weatherTminC, weatherTmaxC);
  const etc = kc * et0;
  const area = computeArea(diamCm);
  const waterMl = etc * area * 0.1;
  const oz = waterMl / ML_PER_US_FL_OUNCE;
  waterAmtInput.value = oz.toFixed(1);
  waterAmtInput.dispatchEvent(new Event('input', { bubbles: true }));
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

const ICONS = {
  trash: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  water: '<svg class="icon icon-water" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',

  fert: '<svg class="icon icon-sprout" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" fill="currentColor"><path d="M512 32c0 113.6-84.6 207.5-194.2 222c-7.1-53.4-30.6-101.6-65.3-139.3C290.8 46.3 364 0 448 0l32 0c17.7 0 32 14.3 32 32zM0 96C0 78.3 14.3 64 32 64l32 0c123.7 0 224 100.3 224 224l0 32 0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160C100.3 320 0 219.7 0 96z"/></svg>',
  plant: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.4 1.7c.217.289.65.84 1.725 1.274 1.093.44 2.885.774 5.834.528 2.02-.168 3.431.51 4.326 1.556C14.161 6.082 14.5 7.41 14.5 8.5q0 .344-.027.734C13.387 8.252 11.877 7.76 10.39 7.5c-2.016-.288-4.188-.445-5.59-2.045-.142-.162-.402-.102-.379.112.108.985 1.104 1.82 1.844 2.308 2.37 1.566 5.772-.118 7.6 3.071.505.8 1.374 2.7 1.75 4.292.07.298-.066.611-.354.715a.7.7 0 0 1-.161.042 1 1 0 0 1-1.08-.794c-.13-.97-.396-1.913-.868-2.77C12.173 13.386 10.565 14 8 14c-1.854 0-3.32-.544-4.45-1.435-1.124-.887-1.889-2.095-2.39-3.383-1-2.562-1-5.536-.65-7.28L.73.806z"/></svg>',

  plus: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  cancel: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  undo: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  check: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  photo: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
  sun: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
  moon: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 0111.21 3 7 7 0 004.22 15.78 9 9 0 0021 12.79z"/></svg>',
  search: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  calendar: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  rain: '<svg class="icon icon-rain" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="16" y1="13" x2="16" y2="21"/><line x1="8" y1="13" x2="8" y2="21"/><line x1="12" y1="15" x2="12" y2="23"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>',
  download: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  left: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  right: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  list: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3" y2="6"/><line x1="3" y1="12" x2="3" y2="12"/><line x1="3" y1="18" x2="3" y2="18"/></svg>',
  grid: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  text: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>',
  menu: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
  archive: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>'
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

function toggleLoading(show) {
  const overlay = document.getElementById('loading-overlay');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !show);
}

// --- filter preference helpers ---
function saveFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('due-filter');
  if (rf) localStorage.setItem('roomFilter', rf.value);
  if (sf) localStorage.setItem('sortPref', sf.value);
  if (df) localStorage.setItem('dueFilter', df.value);
  localStorage.setItem('archiveMode', archiveMode);
}

function loadFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('due-filter');
  const rVal = localStorage.getItem('roomFilter');
  const sVal = localStorage.getItem('sortPref');
  const dVal = localStorage.getItem('dueFilter');
  const aVal = localStorage.getItem('archiveMode');
  if (rf) rf.value = rVal !== null ? rVal : 'all';
  if (sf) sf.value = sVal !== null ? sVal : 'due';
  if (df) df.value = dVal !== null ? dVal : 'any';
  archiveMode = aVal !== null ? aVal : 'active';
}

function clearFilterPrefs() {
  localStorage.removeItem('roomFilter');
  localStorage.removeItem('sortPref');
  localStorage.removeItem('dueFilter');
  localStorage.removeItem('archiveMode');
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

function setArchiveToggleState(btn) {
  if (!btn) return;
  btn.textContent = archiveMode === 'archived' ? 'Archived' : 'Show Archived';
  btn.classList.toggle('active', archiveMode === 'archived');
}

async function updateArchiveToggleVisibility() {
  const btn = document.getElementById('archive-toggle');
  if (!btn) return;
  try {
    const room = document.getElementById('room-filter').value;
    const res = await fetch('api/get_plants.php?archived=true');
    const archived = await res.json();
    const has = room === 'all' ? archived.length > 0 : archived.some(p => p.room === room);
    btn.style.display = has ? 'inline-flex' : 'none';
    if (!has && archiveMode === 'archived') {
      archiveMode = 'active';
    }
    if (has) setArchiveToggleState(btn);
  } catch (e) {
    btn.style.display = 'none';
  }
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
  if (plant.archived) return new Date(8640000000000000);
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
  if (plant.archived) return false;
  if (!plant.last_watered) return true;
  const next = addDays(parseLocalDate(plant.last_watered), plant.watering_frequency);
  return next <= today;
}

function needsFertilizing(plant, today = new Date()) {
  if (plant.archived) return false;
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
  if (plant.archived) return null;
  if (!plant.last_watered) return new Date();
  return addDays(parseLocalDate(plant.last_watered), plant.watering_frequency);
}

function getNextFertDate(plant) {
  if (plant.archived) return null;
  if (!plant.fertilizing_frequency) return null;
  if (!plant.last_fertilized) return new Date();
  return addDays(parseLocalDate(plant.last_fertilized), plant.fertilizing_frequency);
}

async function loadCalendar() {
  let plants = [];
  try {
    const res = await fetch('api/get_plants.php');
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    plants = await res.json();
  } catch (err) {
    console.error('Failed to load calendar:', err);
    showToast('Failed to load calendar data', true);
    return;
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
    let msg;
    if (days > 0) {
      msg = type === 'watered'
        ? `Watering snoozed ${days} day${days !== 1 ? 's' : ''}`
        : `Fertilizing snoozed ${days} day${days !== 1 ? 's' : ''}`;
    } else {
      msg = type === 'watered' ? 'Marked watered!' : 'Marked fertilized!';
    }
    showToast(msg);
  } catch (err) {
    console.error('Failed to mark action:', err);
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
    overlay.style.transition = 'opacity 0.2s';
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
      overlay.style.opacity = progress;
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
      overlay.style.opacity = 1;
      setTimeout(() => {
        card.style.transform = '';
        overlay.style.opacity = 0;
        if (waterDue) markAction(plant.id, 'watered');
        if (fertDue) markAction(plant.id, 'fertilized');
      }, 200);
    } else {
      card.style.transform = '';
      overlay.style.opacity = 0;
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
    overlay.style.opacity = 0;
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
  data.append('plant_type', plant.plant_type || 'houseplant');
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('water_amount', plant.water_amount);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');
  data.append('photo_url', plant.photo_url || '');
  data.append('archived', plant.archived ? 1 : 0);

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
  data.append('plant_type', plant.plant_type || 'houseplant');
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('water_amount', plant.water_amount);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');
  data.append('archived', plant.archived ? 1 : 0);
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

// --- weather helper ---
async function fetch3DayForecastRain(lat, lon) {
  const url =
    `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}` +
    `&appid=${WEATHER_API_KEY}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [0, 0, 0];
    const json = await res.json();
    if (!json.list) return [0, 0, 0];
    const daily = [0, 0, 0];
    const now = new Date();
    for (const entry of json.list) {
      const t = new Date(entry.dt * 1000);
      const diff = Math.floor((t - now) / 86400000);
      if (diff >= 0 && diff < 3) {
        daily[diff] += (entry.rain?.['3h'] || 0) / 25.4;
      }
    }
    return daily;
  } catch (e) {
    showToast("Couldn't fetch rainfall forecast", true);
    return [0, 0, 0];
  }
}

async function fetchRainData(lat, lon) {
  try {
    const next = await fetch3DayForecastRain(lat, lon);
    rainForecastInches = next.length === 3 ? next : [0, 0, 0];
    loadPlants();
  } catch (e) {
    console.error('Rain fetch failed', e);
    rainForecastInches = [0, 0, 0];
    showToast("Couldn't fetch rainfall forecast", true);
    loadPlants();
  }
}

function fetchWeather() {
  const addWeather = (temp, desc, icon) => {
    currentWeather = `${temp}°F ${desc}`;
    currentWeatherIcon = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    currentWeatherDesc = desc;
    loadPlants();
  };

  const fetchByCoords = async (lat, lon) => {
  try {
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=imperial&appid=${WEATHER_API_KEY}`);
      if (!res.ok) return;
      const data = await res.json();
      weatherTminC = (data.main.temp_min - 32) * 5/9;
      weatherTmaxC = (data.main.temp_max - 32) * 5/9;
      addWeather(Math.round(data.main.temp), data.weather[0].main, data.weather[0].icon);
      updateWaterAmount();
      fetchRainData(lat, lon);
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
      if (oc && wg) {
        oc.checked = true;
        wg.classList.remove('hidden');
      }
    } else {
      form.water_amount.value = '';
      const oc = document.getElementById('override_water');
      const wg = document.getElementById('water-amount-group');
      if (oc && wg) {
        oc.checked = false;
        wg.classList.add('hidden');
      }
    }
  }
  form.fertilizing_frequency.value = plant.fertilizing_frequency;
  form.room.value = plant.room;
  form.last_watered.value = plant.last_watered;
  form.last_fertilized.value = plant.last_fertilized;
  const photoUrlInput = document.getElementById('photo_url');
  if (photoUrlInput) photoUrlInput.value = plant.photo_url || '';
  editingPlantId = plant.id;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.innerHTML = ICONS.check + ' Update Plant';
  document.getElementById('cancel-edit').style.display = 'inline-block';
  showFormStep(1);
}

function resetForm() {
  const form = document.getElementById('plant-form');
  form.reset();
  if (form.water_amount) form.water_amount.value = '';
  const oc = document.getElementById('override_water');
  const wg = document.getElementById('water-amount-group');
  if (oc && wg) {
    oc.checked = false;
    wg.classList.add('hidden');
  }
  const taxInfo = document.getElementById('taxonomy-info');
  if (taxInfo) taxInfo.innerHTML = '';
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
  showFormStep(1);
}

function showFormStep(){
  const form = document.getElementById("plant-form");
  if(!form) return;
  form.querySelectorAll(".form-step").forEach(el=>el.classList.remove("hidden"));
  const progress=document.getElementById("form-progress");
  if(progress) progress.style.display="none";
  const prev=document.getElementById("prev-step");
  const next=document.getElementById("next-step");
  const submit=document.getElementById("submit-btn");
  if(prev) prev.style.display="none";
  if(next) next.style.display="none";
  if(submit) submit.style.display="inline-block";
}

async function exportPlantsJSON() {
  try {
    const res = await fetch('api/get_plants.php');
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

// --- main render & filter loop ---
async function loadPlants() {
  const res = await fetch('api/get_plants.php?archived=' + (archiveMode === 'archived' ? 'true' : 'false'));
  const plants = await res.json();
  const list = document.getElementById('plant-grid');
  if (list) {
    list.classList.toggle('list-view', viewMode === 'list');
    list.classList.toggle('text-view', viewMode === 'text');
  }
  const selectedRoom = document.getElementById('room-filter').value;
  const dueFilter = document.getElementById('due-filter')
    ? document.getElementById('due-filter').value
    : 'all';

  const rainEl = document.getElementById('rainfall-info');
  if (rainEl) {
    if (
      selectedRoom &&
      selectedRoom.toLowerCase() === 'outside' &&
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
      const nxt = addDays(parseLocalDate(p.last_watered), p.watering_frequency);
      if (nxt <= today) wateringDue++;
    }
    if (p.last_fertilized && p.fertilizing_frequency) {
      const nxt = addDays(parseLocalDate(p.last_fertilized), p.fertilizing_frequency);
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

  const dateSpan = document.createElement('span');
  dateSpan.classList.add('summary-item');
  dateSpan.innerHTML = `${ICONS.calendar} ${todayStr}`;
  row2.appendChild(dateSpan);

  if (currentWeather) {
    const weatherSpan = document.createElement('span');
    weatherSpan.classList.add('summary-item');
    const icon = document.createElement('img');
    icon.id = 'weather-icon';
    icon.classList.add('weather-icon');
    icon.src = currentWeatherIcon;
    icon.alt = currentWeatherDesc;
    icon.title = currentWeatherDesc;
    weatherSpan.appendChild(icon);
    weatherSpan.insertAdjacentText('beforeend', ` ${currentWeather}`);
    row2.appendChild(weatherSpan);
  }

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
    const wrapper = document.createElement('div');
    wrapper.classList.add('plant-card-wrapper');

    const overlay = document.createElement('div');
    overlay.classList.add('swipe-overlay');
    overlay.innerHTML = ICONS.check;
    wrapper.appendChild(overlay);

    const card = document.createElement('div');
    card.classList.add('plant-card');
    if (viewMode !== 'text') {
      card.classList.add('shadow');
    }
    if (archiveMode === 'archived') {
      card.classList.add('archived-card');
      const badge = document.createElement('span');
      badge.classList.add('archived-badge');
      badge.textContent = 'Archived';
      card.appendChild(badge);
    }
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
      const urgencyTag = document.createElement('span');
      urgencyTag.classList.add('urgency-tag', urgencyClass);
      urgencyTag.textContent = urgencyText;
      card.appendChild(urgencyTag);
    }

    const img = document.createElement('img');
    img.src = plant.photo_url ||
      'https://placehold.co/600x600?text=Add+Photo';
    if (plant.photo_url) {
      img.alt = plant.name;
    } else {
      img.alt = 'No photo available for ' + plant.name;
    }
    img.loading = 'lazy';
    img.width = 300;
    img.height = 300;
    if (plant.photo_url && plant.photo_url.endsWith('.webp')) {
      const base = plant.photo_url.slice(0, -5);
      img.srcset = `${base}-400.webp 400w, ${plant.photo_url} 800w`;
      img.sizes = '(max-width: 640px) 100vw, 400px';
    }
    img.classList.add('plant-photo');
    card.appendChild(img);

    const infoWrap = document.createElement('div');
    infoWrap.classList.add('plant-info');

    const titleEl = document.createElement('h3');
    titleEl.classList.add('plant-title');
    titleEl.textContent = plant.name;
    infoWrap.appendChild(titleEl);

    const speciesEl = document.createElement('div');
    speciesEl.classList.add('plant-species');
    speciesEl.textContent = plant.species;
    speciesEl.title = plant.species;
    infoWrap.appendChild(speciesEl);

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
      amtTag.textContent = `${(ml / ML_PER_US_FL_OUNCE).toFixed(1).replace(/\.0$/, '')} oz / ${Math.round(ml)} ml`;
      amtTag.title = amtTag.textContent;
      tagList.appendChild(amtTag);
    }

    if (tagList.childElementCount > 0) {
      infoWrap.appendChild(tagList);
    }

    const summary = document.createElement('div');
    summary.classList.add('plant-summary');

    if (viewMode !== 'list') {
      const heading = document.createElement('div');
      heading.classList.add('schedule-heading');
      heading.textContent = 'Care Schedule';
      summary.appendChild(heading);
    }

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

    infoWrap.appendChild(summary);
    card.appendChild(infoWrap);

    const overdue = waterOverdueDays(plant, today);
    if (overdue > 2) {
      const warn = document.createElement('div');
      warn.classList.add('water-warning');
      warn.textContent = "Don't forget about me or I'll die!";
      card.appendChild(warn);
    }

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('actions');

    const waterDue = needsWatering(plant, today);
    const fertDue = needsFertilizing(plant, today);

    if (waterDue) {
      const btn = document.createElement('button');
      btn.classList.add('action-btn', 'due-task', 'water-due');
      btn.innerHTML = ICONS.water + '<span class="visually-hidden">Water</span>';
      btn.title = 'Water Now';
      btn.onclick = () => markAction(plant.id, 'watered');
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
      btn.onclick = () => markAction(plant.id, 'fertilized');
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
      showFormStep(1);
      menu.classList.remove('show');
    };
    menu.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.classList.add('action-btn', 'delete-btn');
    delBtn.innerHTML = ICONS.trash + '<span class="visually-hidden">Delete</span>';
    delBtn.title = 'Delete';
    delBtn.onclick = () => {
      showUndoBanner(plant);
      menu.classList.remove('show');
    };
    menu.appendChild(delBtn);

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

    const archiveBtn = document.createElement('button');
    archiveBtn.classList.add('action-btn', 'archive-btn');
    const archLabel = archiveMode === 'archived' ? 'Unarchive' : 'Archive';
    archiveBtn.innerHTML = ICONS.archive + `<span class="visually-hidden">${archLabel}</span>`;
    archiveBtn.title = archLabel;
    archiveBtn.onclick = async () => {
      await updatePlantInline(plant, 'archived', archiveMode === 'archived' ? 0 : 1);
      menu.classList.remove('show');
    };
    menu.appendChild(archiveBtn);

    menuBtn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('show');
    };

    document.addEventListener('click', (e) => {
      if (!overflow.contains(e.target)) {
        menu.classList.remove('show');
      }
    });

    actionsDiv.appendChild(overflow);
    actionsDiv.appendChild(fileInput);
    card.appendChild(actionsDiv);
    wrapper.appendChild(card);

    if (viewMode === 'list' || viewMode === 'text') {
      enableSwipeComplete(card, overlay, plant, waterDue, fertDue);
    }

    list.appendChild(wrapper);
  });

  // refresh room filter and datalist

  const roomSet = new Set();
  plants.forEach(p => { if (p.room) roomSet.add(p.room); });
  const rooms = Array.from(roomSet).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );

  const filter = document.getElementById('room-filter');
  if (filter) {
    const current = filter.value;
    filter.innerHTML = '<option value="all">All Rooms</option>';
    rooms.forEach(r => {

      const opt = document.createElement('option');
      opt.value = r;
      opt.textContent = r;
      filter.appendChild(opt);
    });

    if (current && rooms.includes(current)) {
      filter.value = current;
    }
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

  updateArchiveToggleVisibility();
}

// --- init ---
function init(){
  const showBtn = document.getElementById('show-add-form');
  const exportBtn = document.getElementById('export-json');
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
  const archiveToggle = document.getElementById('archive-toggle');
  const viewButtons = document.querySelectorAll('#view-toggle .view-toggle-btn');
  const prevBtn = document.getElementById('prev-week');
  const nextBtn = document.getElementById('next-week');

  const calendarEl = document.getElementById('calendar');
  const calendarHeading = document.getElementById('calendar-heading');

  const photoDrop = document.getElementById('photo-drop');
  const photoInput = document.getElementById('photo');
  const waterFreqInput = document.getElementById('watering_frequency');
  const waterAmtInput = document.getElementById('water_amount');
  const potDiamInput = document.getElementById('pot_diameter');
  const plantTypeSelect = document.getElementById('plant_type');
  const overrideCheck = document.getElementById('override_water');
  const waterGroup = document.getElementById('water-amount-group');
  const roomInput = document.getElementById('room');
  const nameInput = document.getElementById('name');
  const speciesInput = document.getElementById('species');
  const potHelp = document.getElementById('pot_diameter_help');
  const speciesList = document.getElementById('species-list');
  const commonList = document.getElementById('common-list');

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

  const savedNames = loadHistoryValues('plantNames');
  if (commonList && savedNames.length) {
    savedNames.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      commonList.appendChild(opt);
    });
  }


  // apply saved preferences before initial load
  loadFilterPrefs();
  showFormStep(1);

  applyViewMode();

  loadCalendar();

  if (showBtn) {
    showBtn.innerHTML = ICONS.plus + '<span class="visually-hidden">Add a Plant</span>';
  }
  if (exportBtn) {
    exportBtn.innerHTML = ICONS.download + '<span class="visually-hidden">Export JSON</span>';
    exportBtn.addEventListener('click', exportPlantsJSON);
  }
  if (cancelBtn) {
    cancelBtn.innerHTML = ICONS.cancel + ' Cancel';
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
      if (searchContainer) {
        searchContainer.classList.add('hidden');
        toggleSearch.style.display = 'inline-block';
      }
      form.style.display = 'block';
      showBtn.style.display = 'none';
      const cancel = document.getElementById('cancel-edit');
      if (cancel) cancel.style.display = 'inline-block';
      const lw = document.getElementById('last_watered');
      if (lw && !editingPlantId) lw.value = new Date().toISOString().split('T')[0];
      userWaterFreqEdited = false;
      updateWateringFrequency();
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
      waterGroup.classList.toggle('hidden', !overrideCheck.checked);
      if (!overrideCheck.checked && waterAmtInput) {
        waterAmtInput.value = '';
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
  if (nameInput && commonList) {
    let lastQueryName = '';
    nameInput.addEventListener('input', debounce(async () => {
      const query = nameInput.value.trim();
      if (query === lastQueryName) return;
      lastQueryName = query;
      if (!query) {
        commonList.innerHTML = '';
        if (speciesList) speciesList.innerHTML = '';
        return;
      }
      const [commonNames, scientificNames] = await Promise.all([
        fetchCommonNameSuggestions(query),
        fetchScientificNames(query)
      ]);
      commonList.innerHTML = commonNames
        .map(n => `<option value="${n}"></option>`)
        .join('');
      if (speciesList) {
        speciesList.innerHTML = scientificNames
          .map(n => `<option value="${n}"></option>`)
          .join('');
        if (scientificNames.length && speciesInput && !speciesInput.value) {
          speciesInput.value = scientificNames[0];
          showTaxonomyInfo(scientificNames[0]);
        }
      }
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
        if (commonList && nameVal) {
          const opt = document.createElement('option');
          opt.value = nameVal;
          commonList.appendChild(opt);
        }
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
      loadCalendar();
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
    roomFilter.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
      updateArchiveToggleVisibility();
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
  if (archiveToggle) {
    const updateArchLabel = () => setArchiveToggleState(archiveToggle);
    archiveToggle.addEventListener('click', () => {
      archiveMode = archiveMode === 'archived' ? 'active' : 'archived';
      saveFilterPrefs();
      loadPlants();
      updateArchLabel();
    });
    updateArchLabel();
    updateArchiveToggleVisibility();
  }
  if (viewButtons.length) {
    viewButtons.forEach(btn => {
      if (!btn.innerHTML.trim()) {
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
  loadPlants();
  fetchWeather();
  setInterval(fetchWeather, WEATHER_UPDATE_INTERVAL);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
