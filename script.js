let editingPlantId = null;
let lastDeletedPlant = null;
let deleteTimer = null;
let lastCompletedAction = null;
let actionTimer = null;

import { calculateET0, computeArea, computeRA } from "./js/calc.js";
import { parseLocalDate, addDays, formatDateShort } from "./js/dates.js";
import { showToast, toggleLoading } from "./js/dom.js";

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

// preferred layout for plant cards
let viewMode = localStorage.getItem('viewMode') || 'grid';
// tasks vs library mode
let mainMode = localStorage.getItem('mainMode') || 'tasks';
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
    infoEl.innerHTML = cached.html;
    if (imageUrlInput) imageUrlInput.value = cached.img || '';
    if (sciNameInput) sciNameInput.value = cached.sci || name;
    if (previewImg && cached.img) {
      previewImg.src = cached.img;
      previewImg.classList.remove('hidden');
    }
    // re-attach handlers to cached gallery images
    const gallery = infoEl.querySelector('.specimen-gallery');
    if (gallery) {
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
    return;
  }

  try {
    const res = await fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(name)}`);
    if (!res.ok) return;
    const json = await res.json();
    const taxon = (json.results || [])[0];
    if (!taxon) return;
    const parts = [];
    if (taxon.preferred_common_name) {
      parts.push(`<div><strong>Common Name:</strong> ${taxon.preferred_common_name}</div>`);
    }
    if (taxon.name) {
      parts.push(`<div><strong>Scientific Name:</strong> ${taxon.name}</div>`);
    }
    let photos = [];
    try {
      const detailRes = await fetch(`https://api.inaturalist.org/v1/taxa/${taxon.id}`);
      if (detailRes.ok) {
        const detailJson = await detailRes.json();
        const detail = (detailJson.results || [])[0] || {};
        photos = (detail.taxon_photos || []).map(tp => tp.photo && tp.photo.square_url).filter(Boolean);
      }
    } catch (e) {}
    if (!photos.length && taxon.default_photo && taxon.default_photo.square_url) {
      photos = [taxon.default_photo.square_url];
    }

    let img = photos[0] || '';
    if (photos.length) {
      const imgsHtml = photos.slice(0, 10).map((url, idx) =>
        `<img src="${url}" alt="${taxon.name || name}" loading="lazy"${idx === 0 ? ' class="selected"' : ''}>`
      ).join('');
      parts.push(`<div class="specimen-gallery">${imgsHtml}</div>`);
      if (imageUrlInput) imageUrlInput.value = img;
      if (previewImg && img) {
        previewImg.src = img;
        previewImg.classList.remove('hidden');
      }
    } else if (imageUrlInput) {
      imageUrlInput.value = '';
      if (previewImg) previewImg.classList.add('hidden');
    }
    const sci = taxon.name || name;
    if (sciNameInput) sciNameInput.value = sci;
    const html = parts.join('');
    infoEl.innerHTML = html;
    // attach handlers to newly created gallery
    const galleryEl = infoEl.querySelector('.specimen-gallery');
    if (galleryEl) {
      galleryEl.querySelectorAll('img').forEach(imgEl => {
        imgEl.addEventListener('click', () => {
          galleryEl.querySelectorAll('img').forEach(i => i.classList.remove('selected'));
          imgEl.classList.add('selected');
          if (imageUrlInput) imageUrlInput.value = imgEl.src;
          if (previewImg) {
            previewImg.src = imgEl.src;
            previewImg.classList.remove('hidden');
          }
        });
      });
    }
    plantInfoCache.set(name, { html, img, sci });
  } catch (e) {
    // ignore network errors
  }
}

async function lookupPlants(query) {
  if (!suggestionList) return;
  suggestionList.innerHTML = '';
  if (!query) return;
  try {
    const res = await fetch(`https://api.inaturalist.org/v1/taxa/autocomplete?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const json = await res.json();
    (json.results || []).forEach(taxon => {
      const li = document.createElement('li');
      li.textContent = taxon.preferred_common_name || taxon.name;
      li.dataset.sci = taxon.name || '';
      li.dataset.img = (taxon.default_photo && taxon.default_photo.square_url) || '';
      suggestionList.appendChild(li);
    });
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
  waterAmtInput.value = oz.toFixed(1);
  waterAmtInput.dispatchEvent(new Event('input', { bubbles: true }));
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

const ICONS = {
  trash: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  water: '<svg class="icon icon-water" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',

  fert: '<svg class="icon icon-sprout" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 512 512" fill="currentColor"><path d="M512 32c0 113.6-84.6 207.5-194.2 222c-7.1-53.4-30.6-101.6-65.3-139.3C290.8 46.3 364 0 448 0l32 0c17.7 0 32 14.3 32 32zM0 96C0 78.3 14.3 64 32 64l32 0c123.7 0 224 100.3 224 224l0 32 0 160c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-160C100.3 320 0 219.7 0 96z"/></svg>',
  plant: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M1.4 1.7c.217.289.65.84 1.725 1.274 1.093.44 2.885.774 5.834.528 2.02-.168 3.431.51 4.326 1.556C14.161 6.082 14.5 7.41 14.5 8.5q0 .344-.027.734C13.387 8.252 11.877 7.76 10.39 7.5c-2.016-.288-4.188-.445-5.59-2.045-.142-.162-.402-.102-.379.112.108.985 1.104 1.82 1.844 2.308 2.37 1.566 5.772-.118 7.6 3.071.505.8 1.374 2.7 1.75 4.292.07.298-.066.611-.354.715a.7.7 0 0 1-.161.042 1 1 0 0 1-1.08-.794c-.13-.97-.396-1.913-.868-2.77C12.173 13.386 10.565 14 8 14c-1.854 0-3.32-.544-4.45-1.435-1.124-.887-1.889-2.095-2.39-3.383-1-2.562-1-5.536-.65-7.28L.73.806z"/></svg>',

  plus: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  duplicate: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
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
  archive: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5" rx="2" ry="2"/><line x1="10" y1="12" x2="14" y2="12"/></svg>',
  analytics: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
  ,filter: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 4 21 4 14 12 14 19 10 19 10 12 3 4"/></svg>'
};


// --- filter preference helpers ---
function saveFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('status-filter');
  if (rf) localStorage.setItem('roomFilter', rf.value);
  if (sf) localStorage.setItem('sortPref', sf.value);
  if (df) localStorage.setItem('statusFilter', df.value);
}

function loadFilterPrefs() {
  const rf = document.getElementById('room-filter');
  const sf = document.getElementById('sort-toggle');
  const df = document.getElementById('status-filter');
  const rVal = localStorage.getItem('roomFilter');
  const sVal = localStorage.getItem('sortPref');
  const dVal = localStorage.getItem('statusFilter');
  if (rf) rf.value = rVal !== null ? rVal : 'all';
  if (sf) sf.value = sVal !== null ? sVal : (mainMode === 'tasks' ? 'due' : 'name');
  if (df) df.value = dVal !== null ? dVal : (mainMode === 'tasks' ? 'any' : 'all');
}

function clearFilterPrefs() {
  localStorage.removeItem('roomFilter');
  localStorage.removeItem('sortPref');
  localStorage.removeItem('statusFilter');
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

function applyMainMode() {
  document.querySelectorAll('#mode-toggle .mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mainMode);
  });
  const df = document.getElementById('status-filter');
  const sort = document.getElementById('sort-toggle');
  if (df) df.value = mainMode === 'tasks' ? 'any' : 'all';
  if (sort) sort.value = mainMode === 'tasks' ? 'due' : (localStorage.getItem('sortPref') || 'name');
  localStorage.setItem('mainMode', mainMode);
}

function updateFilterChips() {
  const wrap = document.getElementById('filter-chips');
  if (!wrap) return;
  wrap.innerHTML = '';
  const room = document.getElementById('room-filter')?.value || 'all';
  const status = document.getElementById('status-filter')?.value || (mainMode === 'tasks' ? 'any' : 'all');
  const sort = document.getElementById('sort-toggle')?.value || (mainMode === 'tasks' ? 'due' : 'name');
  const statusLabels = { water: 'Watering', fert: 'Fertilizing', any: 'Needs Care', all: 'All' };
  const sortLabels = { 'name': 'Name \u25B2', 'name-desc': 'Name \u25BC', 'due': 'Due Date', 'added': 'Date Added' };
  function addChip(type, label) {
    const span = document.createElement('span');
    span.className = 'filter-chip';
    span.textContent = label;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.innerHTML = ICONS.cancel;
    btn.addEventListener('click', () => {
      if (type === 'room') document.getElementById('room-filter').value = 'all';
      if (type === 'status') document.getElementById('status-filter').value = mainMode === 'tasks' ? 'any' : 'all';
      if (type === 'sort') document.getElementById('sort-toggle').value = mainMode === 'tasks' ? 'due' : 'name';
      saveFilterPrefs();
      updateFilterChips();
      loadPlants();
    });
    span.appendChild(btn);
    wrap.appendChild(span);
  }
  if (room !== 'all') addChip('room', room);
  const defaultStatus = mainMode === 'tasks' ? 'any' : 'all';
  const defaultSort = mainMode === 'tasks' ? 'due' : 'name';
  if (status !== defaultStatus) addChip('status', `Status: ${statusLabels[status] || status}`);
  if (sort !== defaultSort) addChip('sort', `Sort: ${sortLabels[sort] || sort}`);

  const summary = document.getElementById('filter-summary');
  const activeCount = wrap.children.length;
  if (summary) {
    summary.textContent = activeCount ? `${activeCount} filter${activeCount > 1 ? 's' : ''} applied` : 'No filters';
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
    await fetch('api/delete_plant.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id=${plant.id}`
    });
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
  const res = await fetch(`api/get_plants.php${showArchive ? '?archived=1' : ''}`);
  const plants = await res.json();
  plantCache = plants;
  const list = document.getElementById('plant-grid');
  if (list) {
    list.classList.toggle('list-view', viewMode === 'list');
    list.classList.toggle('text-view', viewMode === 'text');
  }
  const selectedRoom = document.getElementById('room-filter').value;
  const statusFilter = document.getElementById('status-filter')
    ? document.getElementById('status-filter').value
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
    if (statusFilter === 'water' && !waterDue) return false;
    if (statusFilter === 'fert' && !fertDue) return false;
    if (statusFilter === 'any' && !(waterDue || fertDue)) return false;

    if (mainMode === 'tasks') {
      const soonest = getSoonestDueDate(plant);
      if (soonest >= startOfDayAfterTomorrow) return false;
    }

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

  const sortBy = document.getElementById('sort-toggle').value || (mainMode === 'tasks' ? 'due' : 'name');
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
        const urgencyTag = document.createElement('span');
        urgencyTag.classList.add('urgency-tag', urgencyClass);
        urgencyTag.textContent = urgencyText;
        card.appendChild(urgencyTag);
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
    card.appendChild(photoWrap);

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
      amtTag.innerHTML = formatWaterAmount(ml);
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
    actionsDiv.appendChild(analyticsLink);

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

    actionsDiv.appendChild(overflow);
    actionsDiv.appendChild(fileInput);
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

  checkArchivedLink(plants);
  loadCalendar(plants);
}

async function checkArchivedLink(plantsList) {
  const link = document.getElementById('archived-link');
  if (!link) return;
  const room = document.getElementById('room-filter').value;
  if (showArchive) {
    link.textContent = 'Back to active plants';
    link.classList.remove('hidden');
    return;
  }
  if (room === 'all') {
    link.classList.add('hidden');
    return;
  }
  if (!archivedCache) {
    const res = await fetch('api/get_plants.php?archived=1');
    archivedCache = await res.json();
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
  const toggleSearch = document.getElementById('toggle-search');
  const searchContainer = document.getElementById('search-container');
  const closeSearch = document.getElementById('close-search');
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
  const roomFilter = document.getElementById('room-filter');
  const archivedLink = document.getElementById('archived-link');
  const sortToggle = document.getElementById('sort-toggle');
  const dueFilterEl = document.getElementById('status-filter');
  const filterBtn = document.getElementById('filter-btn');
  const filterPanel = document.getElementById('filter-panel');
  const modeButtons = document.querySelectorAll('#mode-toggle .mode-btn');
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
  loadFilterPrefs();
  applyMainMode();
  showFormStep(1);

  applyViewMode();
  updateFilterChips();


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
  if (filterBtn) {
    filterBtn.innerHTML = ICONS.filter + '<span class="visually-hidden">Filters</span>';
    filterBtn.addEventListener('click', () => {
      if (filterPanel) filterPanel.classList.toggle('show');
    });
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
    roomFilter.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
      checkArchivedLink();
      updateFilterChips();
      if (filterPanel) filterPanel.classList.remove('show');
    });
  }
  if (sortToggle) {
    sortToggle.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
      updateFilterChips();
      if (filterPanel) filterPanel.classList.remove('show');
    });
  }
  if (dueFilterEl) {
    dueFilterEl.addEventListener('change', () => {
      saveFilterPrefs();
      loadPlants();
      updateFilterChips();
      if (filterPanel) filterPanel.classList.remove('show');
    });
  }

  if (modeButtons.length) {
    modeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        mainMode = btn.dataset.mode;
        applyMainMode();
        saveFilterPrefs();
        updateFilterChips();
        loadPlants();
      });
    });
    applyMainMode();
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

export { loadCalendar, focusPlantId };
