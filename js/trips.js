import { supabase } from './supabaseClient.js';
import { signUp, signIn, signOut, getSession } from './auth.js';
import { searchPlace } from './geocode.js';

let mode = 'signin'; // 'signin' | 'signup'
let pickedDest = null; // { label, lat, lon }

const authScreen = document.getElementById('auth-screen');
const tripsScreen = document.getElementById('trips-screen');
const topbar = document.getElementById('topbar');

async function init() {
  const session = await getSession();
  if (session) {
    showTripsScreen(session);
  } else {
    showAuthScreen();
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) showTripsScreen(session);
    else showAuthScreen();
  });
}

function showAuthScreen() {
  authScreen.style.display = 'flex';
  tripsScreen.style.display = 'none';
  topbar.style.display = 'none';
}

async function showTripsScreen(session) {
  authScreen.style.display = 'none';
  tripsScreen.style.display = 'block';
  topbar.style.display = 'flex';
  document.getElementById('user-email').textContent = session.user.email;
  await loadTrips();
}

// ---------- Auth form ----------
const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSub = document.getElementById('auth-sub');
const authSubmit = document.getElementById('auth-submit');
const authMsg = document.getElementById('auth-msg');
const authToggleText = document.getElementById('auth-toggle-text');
const authToggleBtn = document.getElementById('auth-toggle-btn');

function applyAuthMode() {
  if (mode === 'signin') {
    authTitle.textContent = 'Logga in';
    authSub.textContent = 'Logga in för att se och planera era resor.';
    authSubmit.textContent = 'Logga in';
    authToggleText.textContent = 'Inget konto än?';
    authToggleBtn.textContent = 'Registrera dig';
  } else {
    authTitle.textContent = 'Skapa konto';
    authSub.textContent = 'Registrera dig med mejl och lösenord för att komma igång.';
    authSubmit.textContent = 'Registrera dig';
    authToggleText.textContent = 'Har du redan ett konto?';
    authToggleBtn.textContent = 'Logga in';
  }
  authMsg.textContent = '';
  authMsg.className = 'form-msg';
}

authToggleBtn.addEventListener('click', () => {
  mode = mode === 'signin' ? 'signup' : 'signin';
  applyAuthMode();
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  authSubmit.disabled = true;
  authMsg.textContent = '';
  authMsg.className = 'form-msg';

  const { data, error } = mode === 'signin'
    ? await signIn(email, password)
    : await signUp(email, password);

  authSubmit.disabled = false;

  if (error) {
    authMsg.textContent = error.message;
    authMsg.className = 'form-msg error';
    return;
  }

  if (mode === 'signup' && !data.session) {
    authMsg.textContent = 'Konto skapat! Kolla din mejl om du behöver bekräfta adressen, logga sedan in.';
    authMsg.className = 'form-msg success';
    mode = 'signin';
    applyAuthMode();
    return;
  }
  // signed in — onAuthStateChange will flip the screen
});

// ---------- Logout ----------
document.getElementById('logout-btn').addEventListener('click', () => signOut());

// ---------- New trip form: destination search ----------
const destInput = document.getElementById('trip-dest');
const geoResults = document.getElementById('geo-results');
const geoPicked = document.getElementById('geo-picked');
const newTripSubmit = document.getElementById('new-trip-submit');
let searchTimer = null;

destInput.addEventListener('input', () => {
  pickedDest = null;
  geoPicked.style.display = 'none';
  newTripSubmit.disabled = true;
  clearTimeout(searchTimer);
  const q = destInput.value.trim();
  if (q.length < 2) { geoResults.classList.remove('show'); geoResults.innerHTML = ''; return; }
  searchTimer = setTimeout(async () => {
    const results = await searchPlace(q);
    if (results.length === 0) {
      geoResults.innerHTML = '<div class="geo-result-item">Inga träffar</div>';
      geoResults.classList.add('show');
      return;
    }
    geoResults.innerHTML = results.map((r, i) =>
      `<div class="geo-result-item" data-i="${i}">${r.label}</div>`).join('');
    geoResults.classList.add('show');
    geoResults.querySelectorAll('.geo-result-item').forEach((el, i) => {
      if (!results[i]) return;
      el.addEventListener('click', () => {
        pickedDest = results[i];
        destInput.value = results[i].shortLabel;
        geoPicked.textContent = `✓ Vald: ${results[i].shortLabel}`;
        geoPicked.style.display = 'block';
        geoResults.classList.remove('show');
        newTripSubmit.disabled = false;
      });
    });
  }, 400);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#trip-dest') && !e.target.closest('#geo-results')) {
    geoResults.classList.remove('show');
  }
});

// ---------- New trip form: submit ----------
const newTripForm = document.getElementById('new-trip-form');
const newTripMsg = document.getElementById('new-trip-msg');

newTripForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!pickedDest) return;
  const name = document.getElementById('trip-name').value.trim();
  const session = await getSession();
  newTripSubmit.disabled = true;
  newTripMsg.textContent = '';
  newTripMsg.className = 'form-msg';

  const { error } = await supabase.from('trips').insert({
    user_id: session.user.id,
    name,
    dest_lat: pickedDest.lat,
    dest_lon: pickedDest.lon,
    dest_label: pickedDest.shortLabel
  });

  if (error) {
    newTripMsg.textContent = 'Kunde inte skapa resan: ' + error.message;
    newTripMsg.className = 'form-msg error';
    newTripSubmit.disabled = false;
    return;
  }

  newTripForm.reset();
  pickedDest = null;
  geoPicked.style.display = 'none';
  newTripSubmit.disabled = true;
  await loadTrips();
});

// ---------- Trip list ----------
async function loadTrips() {
  const grid = document.getElementById('trip-grid');
  grid.innerHTML = '<div id="empty-hint">Laddar…</div>';
  const { data, error } = await supabase.from('trips').select('*').order('created_at', { ascending: false });
  if (error) {
    grid.innerHTML = `<div id="empty-hint">Kunde inte hämta resor: ${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    grid.innerHTML = '<div id="empty-hint">Inga resor ännu — skapa din första ovan.</div>';
    return;
  }
  grid.innerHTML = data.map(trip => `
    <a class="trip-card" href="trip.html?id=${trip.id}">
      <button class="trip-del" data-id="${trip.id}" title="Ta bort resa">🗑️</button>
      <h3>${esc(trip.name)}</h3>
      <div class="trip-dest">📍 ${esc(trip.dest_label)}</div>
    </a>
  `).join('');

  grid.querySelectorAll('.trip-del').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!confirm('Ta bort denna resa och alla dess platser?')) return;
      await supabase.from('trips').delete().eq('id', btn.dataset.id);
      await loadTrips();
    });
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
