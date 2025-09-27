// admin.js
/* Company Admin Panel enhanced:
 * - QR generation for stops
 * - Live vehicles on map (RTDB)
 * - Live Lost Bag reports aggregation
 *
 * Uses firebase compat SDK (v9 compat).
 */

const firebaseConfig = {
  apiKey: "AIzaSyCn9YSO4-ksWl6JBqIcEEuLx2EJN8jMj4M",
  authDomain: "svms-c0232.firebaseapp.com",
  databaseURL: "https://svms-c0232-default-rtdb.firebaseio.com",
  projectId: "svms-c0232",
  storageBucket: "svms-c0232.appspot.com",
  messagingSenderId: "359201898609",
  appId: "1:359201898609:web:893ef076207abb06471bd0"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();

// Element refs
const currentUserEl = document.getElementById('currentUser');
const logoutBtn = document.getElementById('logoutBtn');
const statCompanies = document.getElementById('statCompanies');
const statVehicles = document.getElementById('statVehicles');
const statDeliveries = document.getElementById('statDeliveries');
const statAlerts = document.getElementById('statAlerts');

const publicVehicleId = document.getElementById('publicVehicleId');
const publicVehicleType = document.getElementById('publicVehicleType');
const publicVehicleGps = document.getElementById('publicVehicleGps');
const publicRouteName = document.getElementById('publicRouteName');

const stopName = document.getElementById('stopName');
const stopGps = document.getElementById('stopGps');
const addStopBtn = document.getElementById('addStopBtn');
const stopListEl = document.getElementById('stopList');

const addPublicVehicleBtn = document.getElementById('addPublicVehicleBtn');
const deletePublicVehicleBtn = document.getElementById('deletePublicVehicleBtn');
const refreshVehiclesBtn = document.getElementById('refreshVehiclesBtn');
const vehicleListTbody = document.getElementById('vehicleListTbody');

const stopId = document.getElementById('stopId');
const stopNameInput = document.getElementById('stopNameInput');
const stopGpsInput = document.getElementById('stopGpsInput');
const stopVehicleId = document.getElementById('stopVehicleId');
const stopVehicleRoute = document.getElementById('stopVehicleRoute');
const stopVehicleType = document.getElementById('stopVehicleType');
const stopVehicleTimings = document.getElementById('stopVehicleTimings');
const addStopVehicleBtn = document.getElementById('addStopVehicleBtn');
const stopVehicleList = document.getElementById('stopVehicleList');
const addBusStopBtn = document.getElementById('addBusStopBtn');
const deleteBusStopBtn = document.getElementById('deleteBusStopBtn');
const refreshStopsBtn = document.getElementById('refreshStopsBtn');
const stopListTbody = document.getElementById('stopListTbody');

const lastQrArea = document.getElementById('lastQrArea');
const qrcodeContainer = document.getElementById('qrcode');
const qrLinkEl = document.getElementById('qrLink');
const downloadQrBtn = document.getElementById('downloadQrBtn');

const lostBagTbody = document.getElementById('lostBagTbody');

let uid = null;
let companyName = null;
let tempStops = [];
let tempStopVehicles = [];

let vehicleMap, stopMap, busStopMap;
let vehicleMarker, stopMarker, busStopMarker;

// Live vehicle markers
const liveMarkers = {};

// ensure maps are initialized only once
let mapsInitialized = false;

// Utility: toast
function showToast(msg, type = 'info', ttl = 4000) {
  const div = document.createElement('div');
  div.className = `toast align-items-center text-bg-${type} border-0`;
  div.setAttribute('role', 'alert');
  div.setAttribute('aria-live', 'assertive');
  div.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>`;
  const container = document.querySelector('.toast-container') || document.body;
  container.appendChild(div);
  const t = new bootstrap.Toast(div, { delay: ttl });
  t.show();
  div.addEventListener('hidden.bs.toast', () => div.remove());
}

// Parse GPS string -> [lat, lng] or null
function parseGps(gps) {
  if (!gps) return null;
  // accept "lat,lng" or "lat, lng"
  const parts = String(gps).split(',').map(s => s.trim());
  if (parts.length < 2) return null;
  const lat = Number(parts[0]), lng = Number(parts[1]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

// Haversine distance (km)
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Initialize all maps (idempotent)
function initMaps() {
  if (mapsInitialized) return;
  try {
    vehicleMap = L.map('vehicleMap').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(vehicleMap);

    stopMap = L.map('stopMap').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(stopMap);

    busStopMap = L.map('busStopMap').setView([20.5937, 78.9629], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(busStopMap);

    vehicleMap.on('click', e => {
      const latlng = e.latlng;
      publicVehicleGps.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
      if (vehicleMarker) vehicleMarker.setLatLng(latlng);
      else vehicleMarker = L.marker(latlng).addTo(vehicleMap).bindPopup('Vehicle Location').openPopup();
    });

    stopMap.on('click', e => {
      const latlng = e.latlng;
      stopGps.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
      if (stopMarker) stopMarker.setLatLng(latlng);
      else stopMarker = L.marker(latlng).addTo(stopMap).bindPopup('Stop Location').openPopup();
    });

    busStopMap.on('click', e => {
      const latlng = e.latlng;
      stopGpsInput.value = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;
      if (busStopMarker) busStopMarker.setLatLng(latlng);
      else busStopMarker = L.marker(latlng).addTo(busStopMap).bindPopup('Bus Stop Location').openPopup();
    });

    mapsInitialized = true;
  } catch (e) {
    console.error('initMaps error', e);
    showToast('Map initialization failed (check Leaflet container IDs)', 'danger');
  }
}

// Render temp stops (for vehicle)
function renderStopList() {
  stopListEl.innerHTML = '';
  tempStops.forEach((s, idx) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `${s.name} (${s.gps}) <button class="btn btn-sm btn-outline-danger" data-i="${idx}">Remove</button>`;
    li.querySelector('button').addEventListener('click', () => {
      tempStops.splice(idx, 1);
      renderStopList();
    });
    stopListEl.appendChild(li);
  });
}

// Render temp stop vehicles list
function renderStopVehicleList() {
  stopVehicleList.innerHTML = '';
  tempStopVehicles.forEach((v, idx) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `${v.vehicleId} - ${v.routeName} (${v.type}) <button class="btn btn-sm btn-outline-danger" data-i="${idx}">Remove</button>`;
    li.querySelector('button').addEventListener('click', () => {
      tempStopVehicles.splice(idx, 1);
      renderStopVehicleList();
    });
    stopVehicleList.appendChild(li);
  });
}

// Add stop (to temp list for vehicle)
addStopBtn.addEventListener('click', () => {
  const name = stopName.value.trim();
  const gps = stopGps.value.trim();
  if (!name || !gps) { showToast('Enter name + select GPS', 'warning'); return; }
  if (!parseGps(gps)) { showToast('Invalid GPS', 'warning'); return; }
  tempStops.push({ name, gps });
  stopName.value = '';
  stopGps.value = '';
  if (stopMarker) { stopMap.removeLayer(stopMarker); stopMarker = null; }
  renderStopList();
});

// Add vehicle
addPublicVehicleBtn.addEventListener('click', async () => {
  const vid = publicVehicleId.value.trim();
  const vtype = publicVehicleType.value.trim();
  const gps = publicVehicleGps.value.trim();
  const routeName = publicRouteName.value.trim();
  if (!vid || !vtype || !gps || !routeName) { showToast('Fill all fields', 'warning'); return; }
  if (!parseGps(gps)) { showToast('Invalid GPS', 'warning'); return; }

  try {
    const fullRoutePath = tempStops.map(s => s.gps).filter(Boolean);
    const obj = {
      vehicleType: vtype,
      vehicleNumber: vid,
      gps,
      battery: Math.floor(Math.random() * 20) + 80,
      companyName: companyName || 'unknown',
      routeName,
      stops: tempStops,
      fullRoutePath,
      lastUpdated: Date.now(),
      status: 'active'
    };
    await db.ref(`public_transport/vehicles/${vid}`).set(obj);
    showToast('Vehicle saved', 'success');
    publicVehicleId.value = ''; publicVehicleType.value = ''; publicVehicleGps.value = ''; publicRouteName.value = '';
    tempStops = [];
    if (vehicleMarker) { vehicleMap.removeLayer(vehicleMarker); vehicleMarker = null; }
    renderStopList();
    loadVehiclesList();
  } catch (e) {
    console.error(e); showToast('Failed saving vehicle', 'danger');
  }
});

// Delete vehicle
deletePublicVehicleBtn.addEventListener('click', () => {
  const vid = publicVehicleId.value.trim();
  if (!vid) { showToast('Enter/select vehicle id to delete', 'warning'); return; }
  if (!confirm(`Delete ${vid}?`)) return;
  db.ref(`public_transport/vehicles/${vid}`).remove()
    .then(() => { showToast('Vehicle deleted', 'success'); publicVehicleId.value = ''; loadVehiclesList(); })
    .catch(err => { console.error(err); showToast('Delete failed', 'danger'); });
});

// Load vehicles list (one-time)
async function loadVehiclesList() {
  try {
    const snap = await db.ref('public_transport/vehicles').once('value');
    const vehicles = snap.val() || {};
    vehicleListTbody.innerHTML = '';
    Object.entries(vehicles).forEach(([vid, v]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${vid}</td>
        <td>${v.vehicleType || 'Unknown'}</td>
        <td>${v.routeName || 'N/A'}</td>
        <td><span class="badge ${v.status === 'active' ? 'bg-success' : 'bg-warning'}">${v.status || 'unknown'}</span></td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-vehicle" data-vid="${vid}">Edit</button>
          <button class="btn btn-sm btn-outline-danger delete-vehicle" data-vid="${vid}">Delete</button>
        </td>
      `;
      vehicleListTbody.appendChild(tr);
    });

    // attach events
    vehicleListTbody.querySelectorAll('.edit-vehicle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const vid = btn.dataset.vid;
        const snap = await db.ref(`public_transport/vehicles/${vid}`).once('value');
        const v = snap.val() || {};
        publicVehicleId.value = vid;
        publicVehicleType.value = v.vehicleType || '';
        publicVehicleGps.value = v.gps || '';
        publicRouteName.value = v.routeName || '';
        tempStops = v.stops || [];
        // set marker on map
        const gps = parseGps(v.gps);
        if (gps && vehicleMarker) vehicleMarker.setLatLng(gps);
        else if (gps) vehicleMarker = L.marker(gps).addTo(vehicleMap).bindPopup('Vehicle Location').openPopup();
        renderStopList();
        showToast('Loaded vehicle for edit', 'info');
      });
    });
    vehicleListTbody.querySelectorAll('.delete-vehicle').forEach(btn => {
      btn.addEventListener('click', () => {
        const vid = btn.dataset.vid; if (!confirm(`Delete ${vid}?`)) return;
        db.ref(`public_transport/vehicles/${vid}`).remove().then(() => { showToast('Deleted', 'success'); loadVehiclesList(); })
          .catch(err => { console.error(err); showToast('Delete failed', 'danger'); });
      });
    });

  } catch (e) { console.error(e); showToast('Failed to load vehicles', 'danger'); }
}

refreshVehiclesBtn.addEventListener('click', loadVehiclesList);

// Stop vehicle management
addStopVehicleBtn.addEventListener('click', () => {
  const vehicleIdVal = stopVehicleId.value.trim();
  const routeName = stopVehicleRoute.value.trim();
  const type = stopVehicleType.value.trim();
  const timings = stopVehicleTimings.value.trim();
  if (!vehicleIdVal || !routeName || !type) { showToast('Enter vehicle id, route and type', 'warning'); return; }
  tempStopVehicles.push({ vehicleId: vehicleIdVal, routeName, type, timings });
  stopVehicleId.value = ''; stopVehicleRoute.value = ''; stopVehicleType.value = ''; stopVehicleTimings.value = '';
  renderStopVehicleList();
});

// Add or update bus stop, generate QR
addBusStopBtn.addEventListener('click', async () => {
  const id = stopId.value.trim();
  const name = stopNameInput.value.trim();
  const gps = stopGpsInput.value.trim();
  if (!id || !name || !gps) { showToast('Fill all stop fields', 'warning'); return; }
  if (!parseGps(gps)) { showToast('Invalid GPS', 'warning'); return; }
  try {
    const payload = {
      name,
      gps,
      vehicles: tempStopVehicles,
      lastUpdated: Date.now()
    };
    await db.ref(`public_transport/stops/${id}`).set(payload);
    showToast('Bus stop saved', 'success');

    // generate QR linking to stop page
    // use current origin if available
    // FIXED: properly closed string and fallback
    const base = window.location?.origin || 'https://svms.pages.dev';
    const stopUrl = `${String(base).replace(/\/$/, '')}/stop.html?id=${encodeURIComponent(id)}`;

    // clear previous qrcode
    qrcodeContainer.innerHTML = '';
    // qrcode.js usage - library must be loaded in page
    // create QR
    let qrcodeInstance;
    try {
      qrcodeInstance = new QRCode(qrcodeContainer, {
        text: stopUrl,
        width: 160,
        height: 160,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    } catch (err) {
      // If the QRCode constructor isn't available, fallback to a simple link
      console.warn('QRCode lib not available', err);
      qrcodeContainer.innerHTML = `<div class="p-2">QR generation lib not found. <a href="${stopUrl}" target="_blank">Open stop link</a></div>`;
    }

    qrLinkEl.innerHTML = `<a href="${stopUrl}" target="_blank">${stopUrl}</a>`;

    // prepare download link after short delay (qrcode lib may render img or canvas)
    setTimeout(() => {
      // set default hidden
      downloadQrBtn.style.display = 'none';
      // find image
      const img = qrcodeContainer.querySelector('img');
      if (img && img.src) {
        downloadQrBtn.href = img.src;
        downloadQrBtn.setAttribute('download', `stop-${id}.png`);
        downloadQrBtn.style.display = 'inline-block';
      } else {
        // older qrcode lib uses canvas
        const canvas = qrcodeContainer.querySelector('canvas');
        if (canvas) {
          try {
            downloadQrBtn.href = canvas.toDataURL("image/png");
            downloadQrBtn.setAttribute('download', `stop-${id}.png`);
            downloadQrBtn.style.display = 'inline-block';
          } catch (err) {
            console.warn('QR canvas -> dataURL failed', err);
          }
        }
      }
    }, 400);

    lastQrArea.style.display = 'block';

    // reset inputs
    stopId.value = ''; stopNameInput.value = ''; stopGpsInput.value = ''; tempStopVehicles = []; renderStopVehicleList();
    if (busStopMarker) { busStopMap.removeLayer(busStopMarker); busStopMarker = null; }
    loadStopsList();
  } catch (e) {
    console.error(e); showToast('Failed to save stop', 'danger');
  }
});

// Delete bus stop
deleteBusStopBtn.addEventListener('click', () => {
  const id = stopId.value.trim();
  if (!id) { showToast('Enter/select stop id', 'warning'); return; }
  if (!confirm(`Delete stop ${id}?`)) return;
  db.ref(`public_transport/stops/${id}`).remove()
    .then(() => { showToast('Stop deleted', 'success'); loadStopsList(); })
    .catch(err => { console.error(err); showToast('Delete failed', 'danger'); });
});

// Load stops list
async function loadStopsList() {
  try {
    const snap = await db.ref('public_transport/stops').once('value');
    const stops = snap.val() || {};
    stopListTbody.innerHTML = '';
    Object.entries(stops).forEach(([id, s]) => {
      const vehicleCount = Array.isArray(s.vehicles) ? s.vehicles.length : (s.vehicles ? Object.keys(s.vehicles).length : 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${id}</td><td>${s.name || 'Unknown'}</td><td>${vehicleCount} vehicles</td>
        <td>
          <button class="btn btn-sm btn-outline-primary edit-stop" data-id="${id}">Edit</button>
          <button class="btn btn-sm btn-outline-danger delete-stop" data-id="${id}">Delete</button>
        </td>`;
      stopListTbody.appendChild(tr);
    });

    // attach edit/delete buttons
    stopListTbody.querySelectorAll('.edit-stop').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const snap = await db.ref(`public_transport/stops/${id}`).once('value');
        const s = snap.val() || {};
        stopId.value = id; stopNameInput.value = s.name || ''; stopGpsInput.value = s.gps || '';
        tempStopVehicles = s.vehicles || [];
        renderStopVehicleList();
        // set map marker
        const gps = parseGps(s.gps);
        if (gps && busStopMarker) busStopMarker.setLatLng(gps);
        else if (gps) busStopMarker = L.marker(gps).addTo(busStopMap).bindPopup('Bus Stop Location').openPopup();
        showToast('Loaded stop for edit', 'info');
      });
    });
    stopListTbody.querySelectorAll('.delete-stop').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id; if (!confirm(`Delete ${id}?`)) return;
        db.ref(`public_transport/stops/${id}`).remove().then(() => { showToast('Deleted', 'success'); loadStopsList(); });
      });
    });

  } catch (e) { console.error(e); showToast('Failed to load stops', 'danger'); }
}
refreshStopsBtn.addEventListener('click', loadStopsList);

// Lost Bag aggregation:
// We'll listen to dedicated path public_transport/lost_bags and also to vehicle notifications (legacy)
const lostBagReports = {}; // key -> report

function renderLostBagTable() {
  lostBagTbody.innerHTML = '';
  const rows = Object.entries(lostBagReports).sort((a, b) => b[1].timestamp - a[1].timestamp);
  rows.forEach(([key, r]) => {
    const tr = document.createElement('tr');
    const time = new Date(r.timestamp).toLocaleString();
    const bus = r.busId || r.vehicleId || 'N/A';
    const desc = r.description || '';
    const loc = r.userLocation ? `${Number(r.userLocation[0]).toFixed(5)}, ${Number(r.userLocation[1]).toFixed(5)}` : 'N/A';
    tr.innerHTML = `<td>${time}</td><td>${bus}</td><td>${desc}</td><td>${loc}</td>
      <td>
        <button class="btn btn-sm btn-outline-success" data-k="${key}">Mark Resolved</button>
        <button class="btn btn-sm btn-outline-primary" data-k="${key}">View on Map</button>
      </td>`;
    lostBagTbody.appendChild(tr);
  });

  // attach events
  lostBagTbody.querySelectorAll('button').forEach(btn => {
    const k = btn.dataset.k;
    if (btn.textContent.includes('Resolved')) {
      btn.addEventListener('click', () => {
        // move to resolved (simple: remove)
        if (!confirm('Mark resolved and remove from list?')) return;
        // try removing from DB path (may not exist for legacy reports)
        db.ref(`public_transport/lost_bags/${k}`).remove().catch(() => { /* ignore */ })
          .finally(() => {
            delete lostBagReports[k]; renderLostBagTable(); showToast('Marked resolved', 'success');
          });
      });
    } else { // View on map
      btn.addEventListener('click', () => {
        const r = lostBagReports[k];
        if (r && r.userLocation && r.userLocation.length >= 2) {
          const latlng = [Number(r.userLocation[0]), Number(r.userLocation[1])];
          if (vehicleMap && typeof vehicleMap.flyTo === 'function') {
            vehicleMap.flyTo(latlng, 16);
            L.popup().setLatLng(latlng).setContent(`<strong>Lost bag reported</strong><br>${r.description || ''}`).openOn(vehicleMap);
          } else {
            showToast('Map not ready', 'warning');
          }
        } else {
          showToast('No user location available', 'warning');
        }
      });
    }
  });
}

// Listen for dedicated lost_bags location
db.ref('public_transport/lost_bags').on('child_added', snap => {
  const key = snap.key;
  const r = snap.val();
  if (!r) return;
  lostBagReports[key] = r;
  renderLostBagTable();
});
db.ref('public_transport/lost_bags').on('child_removed', snap => {
  delete lostBagReports[snap.key];
  renderLostBagTable();
});

// Also scan vehicle notifications for lost_bag items (legacy path)
db.ref('public_transport/vehicles').on('value', snap => {
  const vehicles = snap.val() || {};
  Object.entries(vehicles).forEach(([vid, v]) => {
    if (!v || !v.notifications) return;
    Object.entries(v.notifications).forEach(([nkey, note]) => {
      if (!note) return;
      if (note.type === 'lost_bag') {
        // create unique key combining vehicle and notification key
        const key = `veh_${vid}_${nkey}`;
        if (!lostBagReports[key]) {
          const report = {
            busId: vid,
            description: note.description || '',
            timestamp: note.timestamp || Date.now(),
            userLocation: note.userLocation || null,
            source: 'vehicle_notification'
          };
          lostBagReports[key] = report;
          renderLostBagTable();
        }
      }
    });
  });
});

// Live vehicles on map: draw markers and update them on change
function startLiveVehicleListener() {
  const vehiclesRef = db.ref('public_transport/vehicles');
  vehiclesRef.on('value', snap => {
    const vehicles = snap.val() || {};
    // update stats
    try {
      statVehicles.innerText = Object.keys(vehicles).length;
    } catch (e) {
      // fallback
      statVehicles.innerText = statVehicles.innerText || '0';
    }

    // remove markers for deleted
    Object.keys(liveMarkers).forEach(id => {
      if (!vehicles[id]) {
        try {
          if (vehicleMap && liveMarkers[id].marker) {
            vehicleMap.removeLayer(liveMarkers[id].marker);
          }
        } catch (e) { /* ignore */ }
        delete liveMarkers[id];
      }
    });

    Object.entries(vehicles).forEach(([vid, v]) => {
      const coords = parseGps(v.gps);
      if (!coords) return;
      const latlng = [coords[0], coords[1]];
      if (!liveMarkers[vid]) {
        try {
          const m = L.marker(latlng, { title: vid }).addTo(vehicleMap);
          m.bindPopup(`<strong>${vid}</strong><br>${v.routeName || ''}<br><small>${v.vehicleType || ''}</small>`);
          m.on('click', () => {
            // populate edit form for convenience
            publicVehicleId.value = vid; publicVehicleType.value = v.vehicleType || ''; publicVehicleGps.value = v.gps || ''; publicRouteName.value = v.routeName || '';
          });
          liveMarkers[vid] = { marker: m };
        } catch (e) {
          console.warn('Failed to add live marker', e);
        }
      } else {
        try {
          liveMarkers[vid].marker.setLatLng(latlng);
          liveMarkers[vid].marker.setPopupContent(`<strong>${vid}</strong><br>${v.routeName || ''}<br><small>${v.vehicleType || ''}</small>`);
        } catch (e) { console.warn('Failed to update marker', e); }
      }
    });
  });
}

// Simple stats loader (you may adapt path to your data model)
async function loadStats() {
  try {
    // companies count - approximate 1 company for this admin
    statCompanies.innerText = 1;

    if (!uid) return;
    const snap = await db.ref(`users/${uid}/vehicle/companies`).once('value');
    const companies = snap.val() || {};
    let vehicleCount = 0, deliveries = 0, alerts = 0;
    Object.values(companies).forEach(c => {
      if (!c) return;
      const vs = c.vehicle || {};
      try {
        vehicleCount += (vs && typeof vs === 'object') ? Object.keys(vs).length : 0;
      } catch (e) { /* ignore */ }
      Object.values(vs || {}).forEach(v => {
        const d = v.deliveries || {};
        try { deliveries += (d && typeof d === 'object') ? Object.keys(d).length : 0; } catch (e) { /* ignore */ }
        const lt = v.last_trigger;
        if (lt && lt.status === 'alert' && lt.time) {
          alerts++;
        }
      });
    });
    if (vehicleCount) statVehicles.innerText = vehicleCount;
    statDeliveries.innerText = deliveries;
    statAlerts.innerText = alerts;
  } catch (e) {
    console.error('loadStats', e);
  }
}

// Auth init
auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  uid = user.uid;
  try {
    const snap = await db.ref(`users/${uid}`).once('value');
    const me = snap.val();
    if (!me) { showToast('User record missing', 'danger'); auth.signOut(); return; }
    if (me.role !== 'company') { showToast('Unauthorized (not company)', 'danger'); auth.signOut(); return; }
    if (!me.approved) { showToast('Not approved yet', 'warning'); auth.signOut(); return; }
    companyName = me.companyName || 'default';
    currentUserEl.textContent = `${me.email || user.email} (${companyName})`;
    // initialize UI
    initMaps();
    await loadStats();
    await loadVehiclesList();
    await loadStopsList();
    startLiveVehicleListener();

  } catch (e) {
    console.error(e); showToast('Init failed', 'danger');
  }
});

// logout
logoutBtn.addEventListener('click', () => auth.signOut());

// Load initial vehicle & stop lists on page load (if not waiting for auth)
document.addEventListener('DOMContentLoaded', () => {
  initMaps();
  // optionally hide QR area until first generation
  if (lastQrArea) lastQrArea.style.display = 'none';
});

// Optional: periodically refresh stats
setInterval(loadStats, 60_000);
