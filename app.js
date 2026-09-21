import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);
const screens = { signin: $('signin'), hub: $('hub'), viewer: $('viewer') };

function show(name) {
  $('boot').hidden = true;
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

// The page lives at a project path on GitHub Pages, so redirects and the
// router both have to respect it rather than assuming the origin root.
const BASE = location.origin + location.pathname;

// ------------------------------------------------------------------ sign in
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('email').value.trim();
  const btn = $('loginBtn');
  const note = $('loginNote');

  btn.disabled = true;
  btn.textContent = 'Sending...';
  note.hidden = true;
  note.classList.remove('bad');

  const { error } = await db.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: BASE },
  });

  btn.disabled = false;
  btn.textContent = 'Send me a link';
  note.hidden = false;

  if (error) {
    note.classList.add('bad');
    note.textContent = error.message;
    return;
  }
  note.textContent = `Sent. Open the link in the email at ${email} on this device.`;
  $('loginForm').reset();
});

for (const id of ['signOutHub', 'signOutTrip']) {
  $(id).addEventListener('click', async () => {
    await db.auth.signOut();
    location.hash = '';
    show('signin');
  });
}

// --------------------------------------------------------------------- hub
const ICONS = new Set(['map', 'giraffe', 'beach', 'mountain', 'city']);
const TINTS = ['var(--gold)', 'var(--sky)', 'var(--leaf)', 'var(--rasp)'];

function statusOf(trip) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = trip.start_date ? new Date(trip.start_date + 'T00:00:00') : null;
  const end = new Date((trip.end_date || trip.start_date) + 'T00:00:00');
  if (!start || isNaN(start)) return { label: 'Upcoming', tone: 'var(--leaf)' };

  const days = Math.round((start - today) / 86400000);
  if (today > end) return { label: 'Been there', tone: 'var(--muted)' };
  if (days <= 0) return { label: 'Happening now', tone: 'var(--rasp)' };
  if (days === 1) return { label: 'Tomorrow', tone: 'var(--rasp)' };
  if (days <= 30) return { label: `${days} days away`, tone: 'var(--leaf)' };
  return { label: 'Upcoming', tone: 'var(--leaf)' };
}

let trips = [];

async function loadTrips() {
  const { data, error } = await db
    .from('trips')
    .select('slug,title,dates_label,start_date,end_date,blurb,icon')
    .order('start_date', { ascending: false });

  if (error) throw error;
  trips = data ?? [];

  const list = $('tripList');
  const noAccess = $('noAccess');
  list.replaceChildren();

  if (!trips.length) {
    // RLS returns an empty set rather than an error for a signed-in person who
    // is not on the allowlist, so this covers both that and a genuinely empty
    // database. Either way the fix is the same.
    const { data: who } = await db.auth.getUser();
    noAccess.hidden = false;
    noAccess.textContent =
      `Nothing here for ${who?.user?.email ?? 'this account'} yet. ` +
      `If that's the wrong address, sign out and try the other one.`;
    return;
  }

  noAccess.hidden = true;
  trips.forEach((trip, i) => {
    const status = statusOf(trip);
    const icon = ICONS.has(trip.icon) ? trip.icon : 'map';

    const li = document.createElement('li');
    li.className = 'trip';
    li.style.setProperty('--c', TINTS[i % TINTS.length]);
    li.innerHTML = `
      <a href="#/${trip.slug}">
        <span class="art"><svg aria-hidden="true"><use href="#i-${icon}"/></svg></span>
        <span>
          <span class="row"><h2></h2><span class="pill"></span></span>
          <span class="when"></span>
          <span class="blurb"></span>
        </span>
      </a>`;
    li.querySelector('h2').textContent = trip.title;
    li.querySelector('.when').textContent = trip.dates_label;
    li.querySelector('.blurb').textContent = trip.blurb ?? '';

    const pill = li.querySelector('.pill');
    pill.textContent = status.label;
    pill.style.color = status.tone;
    pill.style.background = `color-mix(in srgb, ${status.tone} 16%, var(--card))`;

    list.append(li);
  });
}

// -------------------------------------------------------------------- trip
async function openTrip(slug) {
  const { data, error } = await db.from('trips').select('title,html').eq('slug', slug).maybeSingle();

  if (error || !data) {
    location.hash = '';
    return;
  }
  $('viewerTitle').textContent = data.title;
  // Assigning the property escapes for us, and the sandboxed frame keeps the
  // trip page's own stylesheet from leaking into this one.
  $('frame').srcdoc = data.html;
  show('viewer');
}

// ------------------------------------------------------------------ router
function currentSlug() {
  const hash = location.hash;
  // Supabase drops its tokens in the hash on the way back from the email link.
  if (!hash || hash.includes('access_token') || hash.includes('error=')) return null;
  const m = hash.match(/^#\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function route() {
  const slug = currentSlug();
  if (slug) return openTrip(slug);
  $('frame').removeAttribute('srcdoc');
  show('hub');
}

$('backBtn').addEventListener('click', () => { location.hash = ''; });
window.addEventListener('hashchange', route);

// -------------------------------------------------------------------- boot
db.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') show('signin');
});

(async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return show('signin');

  try {
    await loadTrips();
  } catch (err) {
    $('noAccess').hidden = false;
    $('noAccess').textContent = `Could not load trips: ${err.message}`;
  }
  await route();
})();
