let editingPlantId = null;
let lastDeletedPlant = null;
let deleteTimer = null;

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

  return valid;
}

function addDays(date, days) {
  const d = new Date(date);
  const incr = parseInt(days, 10);
  if (isNaN(incr)) return d;
  d.setDate(d.getDate() + incr);
  return d;
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
  } catch (err) {
    console.error('Failed to mark action:', err);
    alert('Failed to update plant. Please try again.');
  }
}

// --- undo-delete snackbar ---
function showUndoBanner(plant) {
  lastDeletedPlant = plant;
  const banner = document.getElementById('undo-banner');
  banner.style.display = 'block';
  clearTimeout(deleteTimer);
  deleteTimer = setTimeout(async () => {
    await fetch('api/delete_plant.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `id=${plant.id}`
    });
    banner.style.display = 'none';
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
  data.append('watering_frequency', plant.watering_frequency);
  data.append('fertilizing_frequency', plant.fertilizing_frequency);
  data.append('room', plant.room);
  data.append('last_watered', plant.last_watered || '');
  data.append('last_fertilized', plant.last_fertilized || '');

  data.set(field, newValue);

  const resp = await fetch('api/update_plant.php', {
    method: 'POST',
    body: data
  });
  if (!resp.ok) {
    alert('Failed to save change');
  } else {
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
  submitBtn.textContent = 'Update Plant';
  document.getElementById('cancel-edit').style.display = 'inline-block';
}

function resetForm() {
  const form = document.getElementById('plant-form');
  form.reset();
  editingPlantId = null;
  form.querySelector('button[type="submit"]').textContent = 'Add Plant';
  document.getElementById('cancel-edit').style.display = 'none';
  document.getElementById('search-input').value = '';
}

// --- main render & filter loop ---
async function loadPlants() {
  const res = await fetch('api/get_plants.php');
  const plants = await res.json();
  const list = document.getElementById('plant-list');
  const selectedRoom = document.getElementById('room-filter').value;
  const searchQuery = document.getElementById('search-input').value.trim().toLowerCase();
  const today = new Date();

  // summary of due counts
  let wateringDue = 0, fertilizingDue = 0;
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
  document.getElementById('summary').textContent =
    `🔔 ${wateringDue} need watering • ${fertilizingDue} need fertilizing`;

  // group + filter
  list.innerHTML = '';
  const roomsMap = new Map();
  plants.forEach(plant => {
    if (selectedRoom !== 'all' && plant.room !== selectedRoom) return;
    const haystack = (plant.name + ' ' + plant.species).toLowerCase();
    if (searchQuery && !haystack.includes(searchQuery)) return;
    if (!roomsMap.has(plant.room)) roomsMap.set(plant.room, []);
    roomsMap.get(plant.room).push(plant);
  });

  const sortBy = document.getElementById('sort-toggle').value || 'name';
  [...roomsMap.entries()].forEach(([room, roomPlants]) => {
    roomPlants.sort((a,b) => sortBy==='due'
      ? getSoonestDueDate(a)-getSoonestDueDate(b)
      : a.name.localeCompare(b.name)
    );

    const header = document.createElement('h3');
    header.textContent = room || 'No Room';
    list.appendChild(header);

    const table = document.createElement('table');
    table.classList.add('plant-table');
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Name</th><th>Species</th><th>Frequencies</th><th>Actions</th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');

    roomPlants.forEach(plant => {
      const row = document.createElement('tr');
      if (plant.id===window.lastUpdatedPlantId) {
        row.classList.add('just-updated');
        setTimeout(()=>row.classList.remove('just-updated'),2000);
      }

      // inline editable Name
      const nameTd = document.createElement('td');
      const nameInput = document.createElement('input');
      nameInput.value = plant.name;
      nameInput.onblur = () => updatePlantInline(plant,'name',nameInput.value);
      nameTd.appendChild(nameInput);
      row.appendChild(nameTd);

      // inline editable Species
      const specTd = document.createElement('td');
      const specInput = document.createElement('input');
      specInput.value = plant.species;
      specInput.onblur = () => updatePlantInline(plant,'species',specInput.value);
      specTd.appendChild(specInput);
      row.appendChild(specTd);

      // static frequencies and editable room
      const freqTd = document.createElement('td');
      freqTd.textContent = `water every ${plant.watering_frequency} days` +
                           (plant.fertilizing_frequency?`, fertilize every ${plant.fertilizing_frequency} days`:``);
      const roomInput = document.createElement('input');
      roomInput.value = plant.room;
      roomInput.onblur = () => updatePlantInline(plant,'room',roomInput.value);
      freqTd.appendChild(document.createElement('br'));
      freqTd.appendChild(roomInput);
      row.appendChild(freqTd);

      // due badges & actions (omitted for brevity, same as before)
      // ...

      const actionsTd = document.createElement('td');
      // delete with undo
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.onclick = () => showUndoBanner(plant);
      actionsTd.appendChild(delBtn);
      row.appendChild(actionsTd);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    list.appendChild(table);
  });

  // refresh room filter
  const filter = document.getElementById('room-filter');
  Array.from(filter.options).map(o=>o.value);
  roomsMap.forEach((_arr,room)=>{
    if (!Array.from(filter.options).map(o=>o.value).includes(room)) {
      const opt = document.createElement('option');
      opt.value=room; opt.textContent=room;
      filter.appendChild(opt);
    }
  });
}

// --- init ---
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('undo-btn').addEventListener('click',()=>{
    clearTimeout(deleteTimer);
    document.getElementById('undo-banner').style.display='none';
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
    btn.textContent=editingPlantId? 'Updating...':'Adding...';
    try{
      let resp;
      if(editingPlantId){ data.append('id', editingPlantId); resp=await fetch('api/update_plant.php',{method:'POST',body:data}); }
      else{ resp=await fetch('api/add_plant.php',{method:'POST',body:data}); }
      if(!resp.ok) throw new Error();
      alert(editingPlantId?'Plant updated!':'Plant added!');
      resetForm(); loadPlants();
    }catch{
      alert('An error occurred. Please try again.');
    }finally{
      btn.disabled=false;
      btn.textContent=editingPlantId? 'Update Plant':'Add Plant';
    }
  });

  document.getElementById('room-filter').addEventListener('change',loadPlants);
  document.getElementById('sort-toggle').addEventListener('change',loadPlants);
  loadPlants();
});
