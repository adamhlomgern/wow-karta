import { supabase } from './supabaseClient.js';
import { requireSession, signOut } from './auth.js';
import { searchPlace } from './geocode.js';
import { iconEdit, iconTrash, iconCheck } from './icons.js';

const params = new URLSearchParams(window.location.search);
const tripId = params.get('id');
if (!tripId) window.location.href = 'index.html';

let trip = null;
let activeFilter = 'all';
let activeAmenityFilters = new Set();
let places = {};        // keyed by place id
let leafletMarkers = {};
let tempMarker = null;
let map, destMarker;

const typeColors = { fricamping: '#4f9d6e', stallplats: '#2f8f9c', taltplats: '#7a8a2f', camping: '#d99a3d', stuga: '#3f7fd1', hotell: '#8b5fd1' };
const typeLabels = { fricamping: 'Fricamping', stallplats: 'Ställplats', taltplats: 'Tältplats', camping: 'Camping', stuga: 'Stuga/Airbnb', hotell: 'Hotell' };
const typeEmoji = { fricamping: '🚐', stallplats: '🅿️', taltplats: '🏕️', camping: '⛺', stuga: '🏡', hotell: '🏨' };

async function init() {
  const session = await requireSession();
  if (!session) return;
  document.getElementById('user-email').textContent = session.user.email;
  document.getElementById('logout-btn').addEventListener('click', () => signOut());

  const { data: tripRow, error } = await supabase.from('trips').select('*').eq('id', tripId).single();
  if (error || !tripRow) {
    alert('Kunde inte hitta resan (eller så har du inte tillgång till den).');
    window.location.href = 'index.html';
    return;
  }
  trip = tripRow;
  document.getElementById('trip-title').textContent = trip.name;
  document.title = `${trip.name} · Reseplaneraren`;

  setupMap();
  setupFilterChips();
  setupPlaceModal();
  setupEditTripModal();
  setupMobileTabs();

  await loadPlaces();
  rebuildAllMarkers();
  renderList();
  computeAllRoutes();
}

function setupMap() {
  map = L.map('map').setView([trip.dest_lat, trip.dest_lon], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-bidragsgivare &copy; CARTO'
  }).addTo(map);

  const destIcon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;background:#b5552f;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.4)"></div>`,
    iconSize: [18,18], iconAnchor: [9,9]
  });
  destMarker = L.marker([trip.dest_lat, trip.dest_lon], { icon: destIcon, zIndexOffset: 1000 })
    .addTo(map)
    .bindTooltip(trip.dest_label, { permanent: true, direction: 'top', offset: [0,-10], className: 'dest-tooltip' });

  map.on('click', (e) => openPlaceModal({ latlng: e.latlng }));
}

function setupFilterChips() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      activeFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderList();
      updateMarkerVisibility();
    });
  });
  document.querySelectorAll('.amenity-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.amenity;
      if (activeAmenityFilters.has(key)) {
        activeAmenityFilters.delete(key);
        chip.classList.remove('active');
      } else {
        activeAmenityFilters.add(key);
        chip.classList.add('active');
      }
      renderList();
      updateMarkerVisibility();
    });
  });
}

function updateMarkerVisibility() {
  Object.values(places).forEach(data => {
    const marker = leafletMarkers[data.id];
    if (!marker) return;
    const typeOk = activeFilter === 'all' || data.type === activeFilter;
    const amenitiesOk = [...activeAmenityFilters].every(key => data[key]);
    const visible = typeOk && amenitiesOk;
    if (visible && !map.hasLayer(marker)) marker.addTo(map);
    if (!visible && map.hasLayer(marker)) map.removeLayer(marker);
  });
}

async function loadPlaces() {
  const { data, error } = await supabase.from('places').select('*').eq('trip_id', tripId);
  if (error) { console.warn('Kunde inte hämta platser', error); return; }
  places = {};
  (data || []).forEach(row => { places[row.id] = row; });
}

function makeIcon(type) {
  const color = typeColors[type] || '#888';
  return L.divIcon({
    className: '',
    html: `
      <div class="marker-dot" style="width:28px;height:28px;background:${color};border-radius:50%;
        border:2.5px solid #fff;box-shadow:0 1px 4px rgba(20,18,10,0.3);
        display:flex;align-items:center;justify-content:center;font-size:13px;">${typeEmoji[type] || '📍'}</div>`,
    iconSize: [28,28], iconAnchor: [14,14]
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const amenityFields = [
  { id: 'bad', key: 'near_badplats', label: 'Strandnära', emoji: '🏖️' },
  { id: 'shower', key: 'has_shower', label: 'Dusch', emoji: '🚿' },
  { id: 'wifi', key: 'has_wifi', label: 'WiFi', emoji: '📶' },
  { id: 'power', key: 'has_power', label: 'El/Ström', emoji: '🔌' },
  { id: 'pets', key: 'pets_allowed', label: 'Husdjur ok', emoji: '🐶' },
  { id: 'kitchen', key: 'has_kitchen', label: 'Kök', emoji: '🍳' }
];

function formHtml(data) {
  data = data || { type: 'fricamping', status: 'Idé', near_toilet:false, near_badplats:false, near_rastplats:false };
  const typeOpts = Object.entries(typeLabels).map(([k,v]) =>
    `<option value="${k}" ${data.type===k?'selected':''}>${v}</option>`).join('');
  const statusOpts = ['Idé','Kontaktad','Bokad'].map(s =>
    `<option value="${s}" ${data.status===s?'selected':''}>${s}</option>`).join('');
  const amenityChecks = amenityFields.map(a =>
    `<label for="f-${a.id}"><input type="checkbox" id="f-${a.id}" ${data[a.key]?'checked':''}> ${a.emoji} ${a.label}</label>`).join('');
  return `
    <div class="form-field">
      <label for="f-name">Namn</label>
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="text" id="f-name" value="${esc(data.name||'')}" placeholder="t.ex. Askims badplats" autofocus style="flex:1;">
        <button type="button" id="f-favorite" class="favorite-toggle ${data.is_favorite?'active':''}" title="Markera som favorit" aria-pressed="${data.is_favorite?'true':'false'}">★</button>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-field">
        <label for="f-type">Typ av boende</label>
        <select id="f-type">${typeOpts}</select>
      </div>
      <div class="form-field">
        <label for="f-status">Status</label>
        <select id="f-status">${statusOpts}</select>
      </div>
    </div>
    <div class="form-row-2">
      <div class="form-field">
        <label for="f-price">Pris (kr/natt)</label>
        <input type="number" id="f-price" min="0" value="${data.price!=null?data.price:''}" placeholder="0 för gratis">
      </div>
      <div class="form-field">
        <label for="f-capacity">Sovplatser</label>
        <input type="number" id="f-capacity" min="1" value="${data.capacity!=null?data.capacity:''}" placeholder="t.ex. 4">
      </div>
    </div>
    <div class="form-field">
      <label for="f-link">Länk</label>
      <input type="url" id="f-link" value="${esc(data.link||'')}" placeholder="https://...">
    </div>
    <div class="form-field">
      <label class="form-section-label">Bekvämligheter</label>
      <div class="checkrow">${amenityChecks}</div>
    </div>
    <div class="form-field fricamping-only" id="fricamping-checks">
      <label id="fricamping-checks-label" class="form-section-label">Fricamping-krav i närheten</label>
      <div class="checkrow" role="group" aria-labelledby="fricamping-checks-label">
        <label for="f-toilet"><input type="checkbox" id="f-toilet" ${data.near_toilet?'checked':''}> 🚻 Toa</label>
        <label for="f-rast"><input type="checkbox" id="f-rast" ${data.near_rastplats?'checked':''}> 🅿️ Rastplats</label>
      </div>
    </div>
    <div class="form-field">
      <label for="f-notes">Anteckningar / krav</label>
      <textarea id="f-notes">${esc(data.notes||'')}</textarea>
    </div>
    <div class="form-actions">
      <button class="save-btn" id="f-save">Spara</button>
      <button class="cancel-btn" id="f-cancel">Avbryt</button>
    </div>
  `;
}

// container: DOM-element som innehåller formHtml()-markupen (antingen en
// Leaflet-popups element eller modalens fältcontainer).
// callbacks: { onCancel(), onSaved(savedId) }
function bindFormEvents(container, id, latlng, callbacks) {
  const typeSelect = container.querySelector('#f-type');
  const fricampingDiv = container.querySelector('#fricamping-checks');
  function toggleFricamping() {
    fricampingDiv.style.display = typeSelect.value === 'fricamping' ? 'block' : 'none';
  }
  typeSelect.addEventListener('change', toggleFricamping);
  toggleFricamping();

  const favoriteBtn = container.querySelector('#f-favorite');
  favoriteBtn.addEventListener('click', () => {
    favoriteBtn.classList.toggle('active');
    favoriteBtn.setAttribute('aria-pressed', favoriteBtn.classList.contains('active') ? 'true' : 'false');
  });

  container.querySelector('#f-cancel').addEventListener('click', () => {
    callbacks.onCancel();
  });

  container.querySelector('#f-save').addEventListener('click', async () => {
    const saveBtn = container.querySelector('#f-save');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Sparar…';

    const payload = {
      trip_id: tripId,
      name: container.querySelector('#f-name').value.trim() || 'Namnlöst boende',
      type: container.querySelector('#f-type').value,
      status: container.querySelector('#f-status').value,
      price: container.querySelector('#f-price').value === '' ? null : Number(container.querySelector('#f-price').value),
      capacity: container.querySelector('#f-capacity').value === '' ? null : Number(container.querySelector('#f-capacity').value),
      link: container.querySelector('#f-link').value.trim(),
      notes: container.querySelector('#f-notes').value.trim(),
      near_toilet: container.querySelector('#f-toilet').checked,
      near_badplats: container.querySelector('#f-bad').checked,
      near_rastplats: container.querySelector('#f-rast').checked,
      has_shower: container.querySelector('#f-shower').checked,
      has_wifi: container.querySelector('#f-wifi').checked,
      has_power: container.querySelector('#f-power').checked,
      pets_allowed: container.querySelector('#f-pets').checked,
      has_kitchen: container.querySelector('#f-kitchen').checked,
      is_favorite: favoriteBtn.classList.contains('active'),
      lat: latlng.lat,
      lon: latlng.lng
    };

    let savedId = id;
    if (id && places[id]) {
      const { error } = await supabase.from('places').update(payload).eq('id', id);
      if (error) { alert('Kunde inte spara: ' + error.message); saveBtn.disabled = false; saveBtn.textContent = 'Spara'; return; }
    } else {
      const { data, error } = await supabase.from('places').insert(payload).select().single();
      if (error) { alert('Kunde inte spara: ' + error.message); saveBtn.disabled = false; saveBtn.textContent = 'Spara'; return; }
      savedId = data.id;
    }

    await loadPlaces();
    rebuildAllMarkers();
    renderList();
    callbacks.onSaved(savedId);
  });
}

// ---------- Boende-modal: lägg till (klick på karta ELLER adressökning) eller redigera ----------
// En centrerad modal istället för en Leaflet-popup ankrad till kartan — annars
// kan formuläret hamna delvis eller helt utanför synligt område när kartan är
// hårt inzoomad eller på en liten kartruta (t.ex. mobil).
let placeModalSearchTimer = null;

function setupPlaceModal() {
  const overlay = document.getElementById('place-modal-overlay');
  const closeBtn = document.getElementById('place-modal-close');
  const addBtn = document.getElementById('add-place-btn');

  closeBtn.addEventListener('click', closePlaceModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closePlaceModal(); });
  addBtn.addEventListener('click', () => openPlaceModal({}));

  document.getElementById('place-search').addEventListener('input', () => {
    const fieldsEl = document.getElementById('place-fields');
    const resultsEl = document.getElementById('place-geo-results');
    const pickedEl = document.getElementById('place-geo-picked');
    fieldsEl.innerHTML = '';
    pickedEl.style.display = 'none';
    if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
    clearTimeout(placeModalSearchTimer);
    const q = document.getElementById('place-search').value.trim();
    if (q.length < 2) { resultsEl.classList.remove('show'); resultsEl.innerHTML = ''; return; }
    placeModalSearchTimer = setTimeout(async () => {
      const results = await searchPlace(q);
      if (results.length === 0) {
        resultsEl.innerHTML = '<div class="geo-result-item">Inga träffar</div>';
        resultsEl.classList.add('show');
        return;
      }
      resultsEl.innerHTML = results.map((r, i) =>
        `<div class="geo-result-item" data-i="${i}">${esc(r.label)}</div>`).join('');
      resultsEl.classList.add('show');
      resultsEl.querySelectorAll('.geo-result-item').forEach((el, i) => {
        if (!results[i]) return;
        el.addEventListener('click', () => {
          pickedEl.innerHTML = `${iconCheck} Vald plats: ${esc(results[i].label)}`;
          pickedEl.style.display = 'block';
          resultsEl.classList.remove('show');
          const latlng = L.latLng(results[i].lat, results[i].lon);
          showPlaceFields(null, latlng, { name: results[i].shortLabel });
        });
      });
    }, 400);
  });
}

function showPlaceFields(id, latlng, prefill) {
  const fieldsEl = document.getElementById('place-fields');
  const data = id ? places[id] : Object.assign({ type: 'fricamping', status: 'Idé' }, prefill || {});
  fieldsEl.innerHTML = formHtml(data);

  if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
  if (!id) tempMarker = L.marker(latlng, { icon: makeIcon(data.type || 'fricamping') }).addTo(map);

  bindFormEvents(fieldsEl, id, latlng, {
    onCancel: closePlaceModal,
    onSaved: (savedId) => {
      closePlaceModal();
      map.setView(latlng, Math.max(map.getZoom(), 13));
      setMobileView('map');
      computeRoute(savedId);
    }
  });
}

function openPlaceModal({ id = null, latlng = null } = {}) {
  const overlay = document.getElementById('place-modal-overlay');
  const titleEl = document.getElementById('place-modal-title');
  const searchWrap = document.getElementById('place-search-wrap');
  const searchInput = document.getElementById('place-search');
  const resultsEl = document.getElementById('place-geo-results');
  const pickedEl = document.getElementById('place-geo-picked');
  const fieldsEl = document.getElementById('place-fields');

  searchInput.value = '';
  resultsEl.innerHTML = '';
  resultsEl.classList.remove('show');
  pickedEl.style.display = 'none';
  fieldsEl.innerHTML = '';

  overlay.style.display = 'flex';

  if (latlng) {
    // Klick på kartan eller "Redigera" — vi har redan en position, hoppa över sökningen.
    titleEl.textContent = id ? 'Redigera boende' : 'Lägg till boende';
    searchWrap.style.display = 'none';
    showPlaceFields(id, latlng, null);
  } else {
    // Öppnad via "+ Lägg till boende" — sök fram en adress först.
    titleEl.textContent = 'Lägg till boende';
    searchWrap.style.display = 'block';
    setTimeout(() => searchInput.focus(), 0);
  }
}

function closePlaceModal() {
  document.getElementById('place-modal-overlay').style.display = 'none';
  document.getElementById('place-fields').innerHTML = '';
  if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
}

function rebuildAllMarkers() {
  Object.values(leafletMarkers).forEach(m => map.removeLayer(m));
  leafletMarkers = {};
  Object.values(places).forEach(data => {
    const marker = L.marker([data.lat, data.lon], { icon: makeIcon(data.type) }).addTo(map);
    marker.on('click', () => openPlaceModal({ id: data.id, latlng: L.latLng(data.lat, data.lon) }));
    marker.on('mouseover', () => setCardHighlight(data.id, true));
    marker.on('mouseout', () => setCardHighlight(data.id, false));
    leafletMarkers[data.id] = marker;
  });
  updateMarkerVisibility();
}

function setMarkerHighlight(id, on) {
  const marker = leafletMarkers[id];
  if (!marker) return;
  const el = marker.getElement();
  const dot = el && el.querySelector('.marker-dot');
  if (dot) dot.classList.toggle('bump', on);
}

function setCardHighlight(id, on) {
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (card) card.classList.toggle('is-highlighted', on);
}

async function deleteMarker(id) {
  if (!confirm('Ta bort detta boendealternativ?')) return;
  const { error } = await supabase.from('places').delete().eq('id', id);
  if (error) { alert('Kunde inte ta bort: ' + error.message); return; }
  delete places[id];
  if (leafletMarkers[id]) { map.removeLayer(leafletMarkers[id]); delete leafletMarkers[id]; }
  renderList();
}

async function computeRoute(id) {
  const data = places[id];
  if (!data) return;
  data.routeFailed = false;
  const url = `https://router.project-osrm.org/route/v1/driving/${data.lon},${data.lat};${trip.dest_lon},${trip.dest_lat}?overview=false`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    if (json.routes && json.routes[0]) {
      data.distance_km = json.routes[0].distance / 1000;
      data.duration_min = json.routes[0].duration / 60;
      await supabase.from('places').update({ distance_km: data.distance_km, duration_min: data.duration_min }).eq('id', id);
    } else {
      data.routeFailed = true;
    }
  } catch (e) {
    console.warn('Kunde inte hämta rutt för', id, e);
    data.routeFailed = true;
  }
  renderList();
}

function computeAllRoutes() {
  Object.keys(places).forEach(id => computeRoute(id));
}

function renderList() {
  const list = document.getElementById('list');
  const allItems = Object.values(places);
  const items = allItems
    .filter(data => activeFilter === 'all' || data.type === activeFilter)
    .filter(data => [...activeAmenityFilters].every(key => data[key]))
    .sort((a,b) => {
      if (a.distance_km == null && b.distance_km == null) return 0;
      if (a.distance_km == null) return 1;
      if (b.distance_km == null) return -1;
      return a.distance_km - b.distance_km;
    });
  if (items.length === 0) {
    let msg = 'Inga boendealternativ ännu.<br>Klicka någonstans på kartan för att lägga till ett.';
    if (allItems.length > 0) {
      msg = activeFilter === 'all'
        ? 'Inga alternativ matchar de valda filtren.'
        : `Inga alternativ av typen "${typeLabels[activeFilter]}" matchar filtren.`;
    }
    list.innerHTML = `<div id="empty-hint">${msg}</div>`;
    return;
  }
  list.innerHTML = items.map(data => {
    const badges = [`<span class="badge type-${data.type}">${typeLabels[data.type]}</span>`, `<span class="badge status-${data.status}">${data.status}</span>`];
    if (data.type === 'fricamping') {
      if (data.near_toilet) badges.push('<span class="badge">🚻 Toa</span>');
      if (data.near_rastplats) badges.push('<span class="badge">🅿️ Rastplats</span>');
    }
    amenityFields.forEach(a => { if (data[a.key]) badges.push(`<span class="badge">${a.emoji} ${a.label}</span>`); });
    if (data.capacity) badges.push(`<span class="badge">👥 ${data.capacity}</span>`);
    const priceStr = data.price == null ? '' : (data.price == 0 ? 'Gratis' : data.price + ' kr');
    let distStr;
    if (data.distance_km != null) {
      distStr = `🚗 ${Number(data.distance_km).toFixed(1)} km · ${Math.round(data.duration_min)} min till ${esc(trip.dest_label)}`;
    } else if (data.routeFailed) {
      distStr = `Kunde inte beräkna körväg · <button class="dist-retry" data-id="${data.id}">försök igen</button>`;
    } else {
      distStr = `<span class="dist-pending">Beräknar körväg</span>`;
    }
    return `
      <div class="card type-${data.type}" data-id="${data.id}" tabindex="0" role="button" aria-label="Zooma till ${esc(data.name)} på kartan">
        <div class="card-top">
          <div class="card-title">${data.is_favorite ? '<span class="fav-star" title="Favorit">★</span> ' : ''}${esc(data.name)}</div>
        </div>
        <div class="card-badges">${badges.join('')}</div>
        <div class="card-meta">
          ${priceStr ? `💰 ${priceStr}<br>` : ''}
          ${data.link ? `🔗 <a href="${esc(data.link)}" target="_blank" rel="noopener">Länk</a><br>` : ''}
          ${data.notes ? esc(data.notes) : ''}
        </div>
        <div class="card-dist">${distStr}</div>
        <div class="card-actions">
          <button class="edit" data-id="${data.id}">${iconEdit} Redigera</button>
          <button class="del" data-id="${data.id}">${iconTrash} Ta bort</button>
        </div>
      </div>
    `;
  }).join('');

  function goToCard(card) {
    const data = places[card.dataset.id];
    map.setView([data.lat, data.lon], 14);
    setMobileView('map');
  }

  list.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-actions') || e.target.closest('.dist-retry')) return;
      goToCard(card);
    });
    card.addEventListener('keydown', (e) => {
      if (e.target.closest('.card-actions') || e.target.closest('.dist-retry')) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToCard(card); }
    });
    card.addEventListener('mouseenter', () => setMarkerHighlight(card.dataset.id, true));
    card.addEventListener('mouseleave', () => setMarkerHighlight(card.dataset.id, false));
    card.addEventListener('focus', () => setMarkerHighlight(card.dataset.id, true));
    card.addEventListener('blur', () => setMarkerHighlight(card.dataset.id, false));
  });
  list.querySelectorAll('.edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const data = places[btn.dataset.id];
      openPlaceModal({ id: data.id, latlng: L.latLng(data.lat, data.lon) });
    });
  });
  list.querySelectorAll('.del').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteMarker(btn.dataset.id); });
  });
  list.querySelectorAll('.dist-retry').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); computeRoute(btn.dataset.id); });
  });
}

// ---------- "Redigera resmål"-modal ----------
let editTripPicked = null;
let editTripSearchTimer = null;

function setupEditTripModal() {
  const overlay = document.getElementById('edit-trip-modal-overlay');
  const openBtn = document.getElementById('edit-trip-btn');
  const closeBtn = document.getElementById('edit-trip-modal-close');
  const nameInput = document.getElementById('edit-trip-name');
  const destInput = document.getElementById('edit-trip-dest');
  const resultsEl = document.getElementById('edit-geo-results');
  const pickedEl = document.getElementById('edit-geo-picked');
  const saveBtn = document.getElementById('edit-trip-save');
  const msgEl = document.getElementById('edit-trip-msg');

  function closeModal() {
    overlay.style.display = 'none';
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('show');
    msgEl.textContent = '';
    msgEl.className = 'form-msg';
  }

  openBtn.addEventListener('click', () => {
    nameInput.value = trip.name;
    destInput.value = trip.dest_label;
    editTripPicked = null;
    pickedEl.style.display = 'none';
    resultsEl.innerHTML = '';
    msgEl.textContent = '';
    overlay.style.display = 'flex';
  });
  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  destInput.addEventListener('input', () => {
    editTripPicked = null;
    pickedEl.style.display = 'none';
    clearTimeout(editTripSearchTimer);
    const q = destInput.value.trim();
    if (q.length < 2) { resultsEl.classList.remove('show'); resultsEl.innerHTML = ''; return; }
    editTripSearchTimer = setTimeout(async () => {
      const results = await searchPlace(q);
      if (results.length === 0) {
        resultsEl.innerHTML = '<div class="geo-result-item">Inga träffar</div>';
        resultsEl.classList.add('show');
        return;
      }
      resultsEl.innerHTML = results.map((r, i) =>
        `<div class="geo-result-item" data-i="${i}">${esc(r.label)}</div>`).join('');
      resultsEl.classList.add('show');
      resultsEl.querySelectorAll('.geo-result-item').forEach((el, i) => {
        if (!results[i]) return;
        el.addEventListener('click', () => {
          editTripPicked = results[i];
          destInput.value = results[i].shortLabel;
          pickedEl.innerHTML = `${iconCheck} Vald: ${esc(results[i].shortLabel)}`;
          pickedEl.style.display = 'block';
          resultsEl.classList.remove('show');
        });
      });
    }, 400);
  });

  saveBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { msgEl.textContent = 'Namnet får inte vara tomt.'; msgEl.className = 'form-msg error'; return; }
    saveBtn.disabled = true;
    msgEl.textContent = '';
    msgEl.className = 'form-msg';

    const payload = { name };
    if (editTripPicked) {
      payload.dest_lat = editTripPicked.lat;
      payload.dest_lon = editTripPicked.lon;
      payload.dest_label = editTripPicked.shortLabel;
    }

    const { error } = await supabase.from('trips').update(payload).eq('id', tripId);
    saveBtn.disabled = false;
    if (error) {
      msgEl.textContent = 'Kunde inte spara: ' + error.message;
      msgEl.className = 'form-msg error';
      return;
    }

    trip = Object.assign(trip, payload);
    document.getElementById('trip-title').textContent = trip.name;
    document.title = `${trip.name} · Reseplaneraren`;
    destMarker.setLatLng([trip.dest_lat, trip.dest_lon]);
    destMarker.setTooltipContent(trip.dest_label);
    if (editTripPicked) {
      map.setView([trip.dest_lat, trip.dest_lon], map.getZoom());
      computeAllRoutes();
    } else {
      renderList();
    }
    closeModal();
  });
}

// ---------- Mobil: helskärms-flikar (Karta / Lista) ----------
function setupMobileTabs() {
  const tabbar = document.getElementById('mobile-tabbar');
  if (!tabbar) return;
  document.body.classList.add('mobile-view-map');
  tabbar.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => setMobileView(btn.dataset.view));
  });
  const fab = document.getElementById('mobile-fab-add');
  if (fab) fab.addEventListener('click', () => openPlaceModal({}));
}

function setMobileView(view) {
  document.body.classList.remove('mobile-view-map', 'mobile-view-list');
  document.body.classList.add('mobile-view-' + view);
  document.querySelectorAll('#mobile-tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
}

init();
