let editingPlantId = null;
let lastDeletedPlant = null;
let deleteTimer = null;

const ICONS = {
  trash: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  water: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>',
  fert: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14l-1 18H6z"/><path d="M7 3V1h10v2"/><line x1="12" y1="11" x2="12" y2="15"/><line x1="10" y1="13" x2="14" y2="13"/></svg>',
  plus: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  edit: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  cancel: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  undo: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>',
  check: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
  ,sun: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
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

  return valid;
}

function addDays(date, days) {
  const d = new Date(date);
  const incr = parseInt(days, 10);
  if (isNaN(incr)) return d;
  d.setDate(d.getDate() + incr);
  return d;
}

function formatDateShort(dateStr) {
  if (!dateStr) return 'never';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getSoonestDueDate(plant) {
  const waterDate = plant.last_watered
    ? addDays(new Date(plant.last_watered), plant.watering_frequency)
    : null;
  const fertDate = plant.last_fertilized && plant.fertilizing_frequency
    ? addDays(new Date(plant.last_fertilized), plant.fertilizing_frequency)
    : null;

  if (waterDate && fertDate) return waterDate < fertDate ? waterDate : fertDate;
  return waterDate || fertDate || new Date(8640000000000000);
}

function needsWatering(plant, today = new Date()) {
  if (!plant.last_watered) return true;
  const next = addDays(new Date(plant.last_watered), plant.watering_frequency);
  return next <= today;
}

function needsFertilizing(plant, today = new Date()) {
  if (!plant.fertilizing_frequency) return false;
  if (!plant.last_fertilized) return true;
  const next = addDays(new Date(plant.last_fertilized), plant.fertilizing_frequency);
  return next <= today;
}

// --- calendar helpers ---
function getNextWaterDate(plant) {
  if (!plant.last_watered) return new Date();
  return addDays(new Date(plant.last_watered), plant.watering_frequency);
}

function getNextFertDate(plant) {
  if (!plant.fertilizing_frequency) return null;
  if (!plant.last_fertilized) return new Date();
  return addDays(new Date(plant.last_fertilized), plant.fertilizing_frequency);
}

async function loadCalendar() {
  const res = await fetch('api/get_plants.php');
  const plants = await res.json();
  const container = document.getElementById('calendar');
  if (!container) return;
  const daysToShow = 7;
  const start = new Date();
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
    ev.classList.add('cal-event', type==='water' ? 'water-due' : 'fert-due');
    ev.textContent = `${plant.name} (${type==='water'? 'Water':'Fert'})`;
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
}

async function handleDrop(e,newDate,plants) {
  e.preventDefault();
  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
  const plant = plants.find(p=>p.id==data.id);
  if (!plant) return;
  const drop = new Date(newDate);
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
    showToast('Failed to save change', true);
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

// --- full-form populate & reset for edit ---
function populateForm(plant) {
  const form = document.getElementById('plant-form');
  form.name.value = plant.name;
  form.species.value = plant.species;
  form.watering_frequency.value = plant.watering_frequency;
  form.fertilizing_frequency.value = plant.fertilizing_frequency;
  form.room.value = plant.room;
  form.last_watered.value = plant.last_watered;
  form.last_fertilized.value = plant.last_fertilized;
  editingPlantId = plant.id;

  const submitBtn = form.querySelector('button[type="submit"]');
  submitBtn.innerHTML = ICONS.check + '<span class="visually-hidden">Update Plant</span>';
  document.getElementById('cancel-edit').style.display = 'inline-block';
}

function resetForm() {
  const form = document.getElementById('plant-form');
  form.reset();
  editingPlantId = null;
  form.querySelector('button[type="submit"]').innerHTML = ICONS.plus + '<span class="visually-hidden">Add Plant</span>';
  document.getElementById('cancel-edit').style.display = 'none';
  document.getElementById('search-input').value = '';
  form.style.display = 'none';
  const btn = document.getElementById('show-add-form');
  if (btn) btn.style.display = 'inline-block';
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
  const startOfToday = new Date(today);
  startOfToday.setHours(0,0,0,0);
  const startOfTomorrow = addDays(startOfToday,1);

  // summary of due counts and totals
  let wateringDue = 0, fertilizingDue = 0;
  const totalPlants = plants.length;
  plants.forEach(p => {
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
  summaryEl.textContent =
    `🌱 ${totalPlants} plants • 🔔 ${wateringDue} need watering • ${fertilizingDue} need fertilizing`;
  summaryEl.classList.add('show');

  list.innerHTML = '';
  const filtered = plants.filter(plant => {
    if (selectedRoom !== 'all' && plant.room !== selectedRoom) return false;
    const haystack = (plant.name + ' ' + plant.species).toLowerCase();
    if (searchQuery && !haystack.includes(searchQuery)) return false;

    if (dueFilter === 'water' && !waterDue) return false;
    if (dueFilter === 'fert' && !fertDue) return false;
    if (dueFilter === 'any' && !(waterDue || fertDue)) return false;
    return true;
  });

  const sortBy = document.getElementById('sort-toggle').value || 'name';
  filtered.sort((a, b) =>
    sortBy === 'due'
      ? getSoonestDueDate(a) - getSoonestDueDate(b)
      : a.name.localeCompare(b.name)
  );

  filtered.forEach(plant => {
    const card = document.createElement('div');
    card.classList.add('plant-card');
    if (plant.id === window.lastUpdatedPlantId) {
      card.classList.add('just-updated');
      setTimeout(() => card.classList.remove('just-updated'), 2000);
    }
    const soonest = getSoonestDueDate(plant);
    if (soonest < startOfToday) {
      card.classList.add('due-overdue');
    } else if (soonest < startOfTomorrow) {
      card.classList.add('due-today');
    } else {
      card.classList.add('due-future');
    }

    const waterDue = needsWatering(plant, today);
    const fertDue = needsFertilizing(plant, today);

    if (waterDue && fertDue) {
      card.classList.add('both-due-card');
    } else if (waterDue) {
      card.classList.add('water-due-card');
    } else if (fertDue) {
      card.classList.add('fert-due-card');
    }

    if (plant.photo_url) {
      const img = document.createElement('img');
      img.src = plant.photo_url;
      img.alt = plant.name;
      img.classList.add('plant-photo');
      card.appendChild(img);
    }
    const titleEl = document.createElement('h3');
    titleEl.classList.add('plant-title');
    titleEl.textContent = plant.name;
    card.appendChild(titleEl);

    const speciesEl = document.createElement('div');
    speciesEl.classList.add('plant-species');
    speciesEl.textContent = plant.species;
    card.appendChild(speciesEl);

    const summary = document.createElement('div');
    summary.classList.add('plant-summary');

    const waterSpan = document.createElement('span');
    waterSpan.classList.add('summary-item');
    waterSpan.innerHTML = ICONS.water + ` ${plant.watering_frequency}d`;
    summary.appendChild(waterSpan);

    const fertSpan = document.createElement('span');
    fertSpan.classList.add('summary-item');
    const fertFreq = plant.fertilizing_frequency
      ? `${plant.fertilizing_frequency}d`
      : 'N/A';
    fertSpan.innerHTML = ICONS.fert + ` ${fertFreq}`;
    summary.appendChild(fertSpan);

    const lastWaterSpan = document.createElement('span');
    lastWaterSpan.classList.add('summary-item');
    lastWaterSpan.innerHTML =
      ICONS.water + ` last ${formatDateShort(plant.last_watered)}`;
    summary.appendChild(lastWaterSpan);

    const lastFertSpan = document.createElement('span');
    lastFertSpan.classList.add('summary-item');
    lastFertSpan.innerHTML =
      ICONS.fert + ` last ${formatDateShort(plant.last_fertilized)}`;
    summary.appendChild(lastFertSpan);

    card.appendChild(summary);

    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('actions');

    if (waterDue) {
      const btn = document.createElement('button');
      btn.classList.add('action-btn', 'due-task', 'water-due');
      btn.innerHTML = ICONS.water + '<span class="visually-hidden">Water</span>';
      btn.title = 'Mark watered';
      btn.onclick = () => markAction(plant.id, 'watered');
      actionsDiv.appendChild(btn);
    }

    if (fertDue) {
      const btn = document.createElement('button');
      btn.classList.add('action-btn', 'due-task', 'fert-due');
      btn.innerHTML = ICONS.fert + '<span class="visually-hidden">Fertilize</span>';
      btn.title = 'Mark fertilized';
      btn.onclick = () => markAction(plant.id, 'fertilized');
      actionsDiv.appendChild(btn);
    }

    const editBtn = document.createElement('button');
    editBtn.classList.add('action-btn');
    editBtn.innerHTML = ICONS.edit + '<span class="visually-hidden">Edit</span>';
    editBtn.type = 'button';
    editBtn.onclick = () => {
      populateForm(plant);
      document.getElementById('plant-form').style.display = 'block';
      const showBtn = document.getElementById('show-add-form');
      if (showBtn) showBtn.style.display = 'none';
    };
    actionsDiv.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.classList.add('action-btn');
    delBtn.innerHTML = ICONS.trash + '<span class="visually-hidden">Delete</span>';
    delBtn.onclick = () => showUndoBanner(plant);
    actionsDiv.appendChild(delBtn);

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
    changeBtn.classList.add('action-btn');
    changeBtn.textContent = 'Change Photo';
    changeBtn.type = 'button';
    changeBtn.onclick = () => fileInput.click();
    actionsDiv.appendChild(changeBtn);
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
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;

  if (showBtn) {
    showBtn.innerHTML = ICONS.plus + ' Add a Plant';
  }
  if (cancelBtn) {
    cancelBtn.innerHTML = ICONS.cancel + ' Cancel';
  }
  if (undoBtn) {
    undoBtn.innerHTML = ICONS.undo + ' Undo';
  }
  if (submitBtn) {
    submitBtn.innerHTML = ICONS.plus + ' Add Plant';
  }
  if (showBtn && form) {
    showBtn.addEventListener('click', () => {
      form.style.display = 'block';
      showBtn.style.display = 'none';
      const cancel = document.getElementById('cancel-edit');
      if (cancel) cancel.style.display = 'inline-block';
    });
  }
  document.getElementById('undo-btn').addEventListener('click',()=>{
    clearTimeout(deleteTimer);
    document.getElementById('undo-banner').classList.remove('show');
    lastDeletedPlant=null;
  });

  document.getElementById('search-input').addEventListener('input',loadPlants);
  document.getElementById('cancel-edit').onclick=resetForm;
  document.getElementById('plant-form').addEventListener('submit',async e=>{
    e.preventDefault(); const form=e.target;
    if (!validateForm(form)) return;
    const data=new FormData(form);
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
        ? ICONS.check + ' Update Plant'
        : ICONS.plus + ' Add Plant';
    }
  });

  document.getElementById('room-filter').addEventListener('change',loadPlants);
  document.getElementById('sort-toggle').addEventListener('change',loadPlants);
  const df = document.getElementById('due-filter');
  if (df) df.addEventListener('change', loadPlants);
  loadPlants();
  loadCalendar();
});
