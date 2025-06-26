const assert = require('assert');
const vm = require("vm");
const fs = require('fs');
const {JSDOM} = require('jsdom');

(async () => {
  const html = `
<select id="view-toggle"><option value="grid">Grid</option><option value="list">List</option></select>
<select id="room-filter"></select>
<select id="sort-toggle"></select>
<select id="due-filter"></select>
<input id="search-input" value="">
<div id="plant-grid"></div>
<div id="summary"></div>`;
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com" });
  const { window } = dom;
  window.fetch = () => Promise.resolve({ ok: true, json: async () => [{
    id: 1,
    name: 'Aloe',
    species: 'Aloe',
    room: 'Kitchen',
    watering_frequency: 7,
    last_watered: '2024-01-01',
    fertilizing_frequency: 0,
    last_fertilized: null,
    water_amount: 0,
    photo_url: ''
  }] });

  const script = fs.readFileSync('script.js', 'utf8');
window.__TESTING__ = true;
  window.eval(script);

  window.localStorage.setItem('viewPref','list');
  if (window.loadFilterPrefs) window.loadFilterPrefs();
  await window.loadPlants();
  assert(window.document.getElementById('plant-grid').classList.contains('plant-list'), 'list view not applied');

  window.document.getElementById('view-toggle').value = 'grid';
  await window.loadPlants();
  assert(!window.document.getElementById('plant-grid').classList.contains('plant-list'), 'grid view not applied');

  console.log('loadPlants view test passed');
})();
