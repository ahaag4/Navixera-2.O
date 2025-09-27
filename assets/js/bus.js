(function () {
  'use strict';

  // Firebase Configuration
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
  const db = firebase.database();
  const functions = firebase.functions ? firebase.functions() : null;

  // DOM Element Caching
  const dom = {
    loader: document.getElementById('loader'),
    locateBtn: document.getElementById('locateBtn'),
    showBusStopsBtn: document.getElementById('showBusStopsBtn'),
    searchVehicleInput: document.getElementById('searchVehicle'),
    searchVehicleBtn: document.getElementById('searchVehicleBtn'),
    searchRouteFrom: document.getElementById('searchRouteFrom'),
    searchRouteTo: document.getElementById('searchRouteTo'),
    searchRouteBtn: document.getElementById('searchRouteBtn'),
    searchResults: document.getElementById('searchResults'),
    vehicleDetails: document.getElementById('vehicleDetails'),
    vehicleTitle: document.getElementById('vehicleTitle'),
    vehicleInfo: document.getElementById('vehicleInfo'),
    stopList: document.getElementById('stopList'),
    closeSidebarBtn: document.getElementById('closeSidebarBtn'),
    busStopPanel: document.getElementById('busStopPanel'),
    busStopContent: document.getElementById('busStopContent'),
    closeBusStopPanelBtn: document.getElementById('closeBusStopPanelBtn'),
    toastContainer: document.querySelector('.toast-container'),
    busAlertSelect: document.getElementById('busAlertSelect'),
    setAlertBtn: document.getElementById('setAlertBtn'),
    lostBagBtn: document.getElementById('lostBagBtn'),
    lostBagBusSelect: document.getElementById('lostBagBusSelect'),
    reportLostBagBtn: document.getElementById('reportLostBagBtn'),
    bagDescription: document.getElementById('bagDescription'),
    confirmLocation: document.getElementById('confirmLocation')
  };

  // State & Map Variables
  let map;
  const markers = {};
  let stopMarkers = {};
  let markerGroup = L.featureGroup();
  let routeLayer = L.featureGroup();
  let userLocationMarker = null;
  let userLocation = null;
  let vehiclesData = {};
  let busStops = [];
  let busAlerts = {};
  let alertCheckInterval = null;
  const alertSound = new Audio('https://freesound.org/data/previews/66/66157_634166-lq.mp3');

  // Custom Bus Icon
  const createBusIcon = (color = '#2563eb') => {
    return L.divIcon({
      className: 'bus-marker',
      html: `<div class="bus-icon" style="background-color: ${color}">
              <i class="bi bi-bus-front"></i>
            </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  };

  const stopIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });

  const userLocationIcon = L.divIcon({
    className: 'user-location-icon',
    html: `<div class="user-dot"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12]
  });

  // Helper Functions
  const showLoader = () => dom.loader && dom.loader.classList && dom.loader.classList.remove('hidden');
  const hideLoader = () => dom.loader && dom.loader.classList && dom.loader.classList.add('hidden');

  const showToast = (message, type = 'info', ttl = 3500) => {
    try {
      if (!dom.toastContainer) {
        console.warn('No toast container found. Message:', message);
        return;
      }
      const toastEl = document.createElement('div');
      toastEl.className = `toast align-items-center text-bg-${type} border-0 show`;
      toastEl.setAttribute('role', 'alert');
      toastEl.setAttribute('aria-live', 'assertive');
      toastEl.innerHTML = `
        <div class="d-flex">
          <div class="toast-body d-flex align-items-center">
            <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'warning' ? 'bi-exclamation-triangle-fill' : type === 'danger' ? 'bi-x-circle-fill' : 'bi-info-circle-fill'} me-2"></i>
            ${message}
          </div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>`;
      dom.toastContainer.appendChild(toastEl);
      const toast = new bootstrap.Toast(toastEl, { delay: ttl });
      toast.show();
      toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    } catch (e) {
      console.error('showToast error', e);
    }
  };

  const parseGps = (gps) => {
    if (!gps) return null;
    if (typeof gps === 'object' && gps.latitude != null && gps.longitude != null) {
      return [Number(gps.latitude), Number(gps.longitude)];
    }
    const parts = String(gps).split(',').map(s => parseFloat(s.trim()));
    if (parts.length < 2 || !isFinite(parts[0]) || !isFinite(parts[1]) || (parts[0] === 0 && parts[1] === 0)) {
      return null;
    }
    return [parts[0], parts[1]];
  };

  const formatDistance = (distance) => {
    if (!isFinite(distance)) return 'N/A';
    if (distance < 1) {
      return `${Math.round(distance * 1000)} m`;
    }
    return `${distance.toFixed(2)} km`;
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Backend ETA Caller (optional; will fall back if functions not available)
  const getETA = async (vehicle, previousCoords, previousTime) => {
    if (!functions) {
      return { eta: 'N/A', nextStop: 'N/A', speed: 0 };
    }
    try {
      const calculateETA = functions.httpsCallable('calculateETA');
      const result = await calculateETA({ vehicle, previousCoords, previousTime });
      return result.data || { eta: 'N/A', nextStop: 'N/A', speed: 0 };
    } catch (err) {
      console.error('ETA calculation error:', err);
      // don't spam toasts; optional single warning
      return { eta: 'N/A', nextStop: 'N/A', speed: 0 };
    }
  };

  // Map Functions
  const initMap = () => {
    map = L.map('map').setView([19.0760, 72.8777], 12); // Centered on Mumbai
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    markerGroup.addTo(map);
    routeLayer.addTo(map);
  };

  const locateUser = () => {
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by your browser.", "warning");
      return Promise.reject("Geolocation not supported");
    }
    showToast("Locating you...", "info");
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          userLocation = [latitude, longitude];
          if (userLocationMarker) {
            userLocationMarker.setLatLng(userLocation);
          } else {
            userLocationMarker = L.marker(userLocation, { icon: userLocationIcon }).addTo(map);
            userLocationMarker.bindPopup("<b>You are here</b>");
          }
          map.flyTo(userLocation, 16);
          setTimeout(() => userLocationMarker.openPopup(), 1000);
          findNearestBusStops();
          resolve();
        },
        (err) => {
          showToast("Unable to retrieve your location. Please check permissions.", "danger");
          reject(err);
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
      );
    });
  };

  const findNearestBusStops = () => {
    if (!userLocation || !Array.isArray(busStops) || busStops.length === 0) {
      showToast("Location or bus stops data not available.", "warning");
      return;
    }
    busStops.forEach(stop => {
      const coords = parseGps(stop.gps);
      if (coords) {
        stop.distance = calculateDistance(userLocation[0], userLocation[1], coords[0], coords[1]);
      } else {
        stop.distance = Infinity;
      }
    });
    busStops.sort((a, b) => a.distance - b.distance);
    if (busStops.length > 0 && busStops[0].distance !== Infinity) {
      showBusStopPanel(busStops[0]);
    } else {
      showToast("No valid bus stops found.", "warning");
    }
  };

  const showBusStopPanel = (stop) => {
    dom.busStopContent.innerHTML = `
      <div class="bus-stop-header">
        <h6 class="bus-stop-title">${stop.name || 'Unnamed Stop'}</h6>
        <a href="#" class="see-all-link" id="seeAllStops">
          See all stops <i class="bi bi-arrow-right"></i>
        </a>
      </div>
      <div class="bus-stop-item">
        <div class="bus-stop-name">${stop.name || 'Unnamed Stop'}</div>
        <div class="bus-stop-distance">
          <i class="bi bi-geo-alt"></i> ${formatDistance(stop.distance)} away
        </div>
      </div>
      ${(stop.vehicles || []).map(v => `
        <div class="bus-route">
          <h6 class="bus-route-title">${v.type || 'Unknown'}</h6>
          <div class="bus-route-item">
            <div class="bus-number">
              <i class="bi bi-bus-front"></i> ${v.vehicleId || ''}
            </div>
            <div class="bus-destination">${v.routeName || 'N/A'}</div>
            <div class="bus-timings">${v.timings || 'Timings not available'}</div>
          </div>
        </div>
      `).join('') || '<div class="text-muted p-3 text-center"><i class="bi bi-info-circle"></i> No vehicles available at this stop.</div>'}
    `;
    dom.busStopPanel.classList.add('is-visible');

    // Handle "See all stops" click
    const seeAllLink = dom.busStopContent.querySelector('#seeAllStops');
    if (seeAllLink) {
      seeAllLink.addEventListener('click', (e) => {
        e.preventDefault();
        showAllStops();
      });
    }
  };

  const showAllStops = () => {
    // Ensure each stop has distance calculated (if userLocation present)
    if (userLocation) {
      busStops.forEach(stop => {
        const coords = parseGps(stop.gps);
        stop.distance = coords ? calculateDistance(userLocation[0], userLocation[1], coords[0], coords[1]) : Infinity;
      });
      busStops.sort((a, b) => a.distance - b.distance);
    }

    dom.busStopContent.innerHTML = `
      <div class="bus-stop-header">
        <h6 class="bus-stop-title">All Bus Stops</h6>
      </div>
      <ul class="list-group list-group-flush">
        ${busStops.map(stop => `
          <li class="list-group-item" data-stop-id="${stop.id}">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                <strong>${stop.name || 'Unnamed Stop'}</strong><br>
                <small class="text-success"><i class="bi bi-geo-alt"></i> ${formatDistance(stop.distance)}</small>
              </div>
              <button class="btn btn-sm btn-outline-primary view-stop-btn">
                <i class="bi bi-geo-alt"></i> View
              </button>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
    dom.busStopPanel.classList.add('is-visible');

    // Add event listeners for view buttons
    dom.busStopContent.querySelectorAll('.view-stop-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stopId = btn.closest('.list-group-item').dataset.stopId;
        const stop = busStops.find(s => s.id == stopId);
        if (stop) {
          const coords = parseGps(stop.gps);
          if (coords) {
            map.flyTo(coords, 16);
            if (stopMarkers[stop.id]) {
              setTimeout(() => stopMarkers[stop.id].openPopup(), 1000);
            }
          } else {
            showToast('Stop has no valid coordinates.', 'warning');
          }
        }
      });
    });
  };

  const drawVehicleRoute = (vehicle) => {
    routeLayer.clearLayers();
    Object.values(stopMarkers).forEach(marker => {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    });
    stopMarkers = {};
    const routePath = (vehicle.fullRoutePath || []).map(parseGps).filter(Boolean);
    if (routePath.length > 1) {
      L.polyline(routePath, { color: '#2563eb', weight: 5, opacity: 0.8 }).addTo(routeLayer);
    }
    const stops = vehicle.stops || [];
    stops.forEach((stop, index) => {
      const coords = parseGps(stop.gps);
      if (coords) {
        const marker = L.marker(coords, { icon: stopIcon }).addTo(routeLayer);
        marker.bindPopup(`
          <strong>Stop ${index + 1}:</strong> ${stop.name || 'Unnamed Stop'}<br>
          <small>Click to view on map</small>
        `);
        marker.on('click', () => {
          // nothing extra
        });
        stopMarkers[stop.id || `stop-${index}`] = marker;
        L.circleMarker(coords, {
          radius: 6,
          color: '#10b981',
          fillColor: '#fff',
          fillOpacity: 1,
          weight: 2
        }).addTo(routeLayer);
      }
    });
  };

  // UI Update Functions
  const showVehicleDetails = async (vid, vehicle) => {
    dom.vehicleTitle.textContent = `Vehicle: ${vid}`;

    // Calculate ETA for the detailed view
    let etaInfoForDetails = { eta: 'Calculating...', nextStop: 'N/A', speed: 0 };
    if (markers[vid]) {
      etaInfoForDetails = await getETA(vehicle, markers[vid].prevCoords, markers[vid].prevTime);
    }

    const status = etaInfoForDetails.speed > 5 ? 'Moving' : 'Stopped';

    // Create battery indicator
    const batteryLevel = vehicle.battery ?? 0;
    let batteryColor = 'success';
    let batteryIcon = 'bi-battery-full';

    if (batteryLevel < 20) {
      batteryColor = 'danger';
      batteryIcon = 'bi-battery';
    } else if (batteryLevel < 50) {
      batteryColor = 'warning';
      batteryIcon = 'bi-battery-half';
    }

    dom.vehicleInfo.innerHTML = `
      <div class="d-flex flex-wrap gap-3 mb-3">
        <div class="d-flex align-items-center">
          <i class="bi bi-bus-front text-primary me-2"></i>
          <span>${vehicle.vehicleType || 'Unknown'}</span>
        </div>
        <div class="d-flex align-items-center">
          <i class="bi bi-signpost text-primary me-2"></i>
          <span>${vehicle.routeName || 'N/A'}</span>
        </div>
        <div class="d-flex align-items-center">
          <i class="bi ${batteryIcon} text-${batteryColor} me-2"></i>
          <span>${batteryLevel}%</span>
        </div>
      </div>
      <div class="d-flex flex-wrap gap-3">
        <div class="d-flex align-items-center">
          <i class="bi bi-building text-primary me-2"></i>
          <span>${vehicle.companyName || 'N/A'}</span>
        </div>
        <div class="d-flex align-items-center">
          <i class="bi bi-speedometer2 text-primary me-2"></i>
          <span>${etaInfoForDetails.speed || 'N/A'} km/h</span>
        </div>
        <div class="d-flex align-items-center">
          <i class="bi bi-info-circle text-primary me-2"></i>
          <span>Status: ${status}</span>
        </div>
      </div>
      <div class="eta-info-panel mt-3">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>Next Stop:</strong> ${etaInfoForDetails.nextStop}<br>
            <small>AI-Powered Prediction</small>
          </div>
          <span class="eta-badge">${etaInfoForDetails.eta}</span>
        </div>
      </div>
    `;

    dom.stopList.innerHTML = '';
    const stops = vehicle.stops || [];
    if (stops.length > 0) {
      stops.forEach((stop, index) => {
        const li = document.createElement('li');
        li.className = 'list-group-item';
        li.innerHTML = `
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <strong>Stop ${index + 1}:</strong> ${stop.name || 'Unnamed Stop'}
            </div>
            <button class="btn btn-sm btn-outline-primary view-stop-btn" data-index="${index}">
              <i class="bi bi-geo-alt"></i> View
            </button>
          </div>
        `;
        dom.stopList.appendChild(li);
        li.querySelector('.view-stop-btn').addEventListener('click', () => {
          const coords = parseGps(stop.gps);
          if (coords) {
            map.flyTo(coords, 16);
            const key = stop.id || `stop-${index}`;
            if (stopMarkers[key]) {
              setTimeout(() => stopMarkers[key].openPopup(), 1000);
            }
          } else {
            showToast('Stop location not available.', 'warning');
          }
        });
      });
    } else {
      dom.stopList.innerHTML = '<li class="list-group-item text-muted text-center py-3"><i class="bi bi-info-circle"></i> No stops available.</li>';
    }
    drawVehicleRoute(vehicle);
    dom.vehicleDetails.classList.add('is-visible');
  };

  const hideVehicleDetails = () => {
    dom.vehicleDetails.classList.remove('is-visible');
    routeLayer.clearLayers();
    Object.values(stopMarkers).forEach(marker => {
      if (map.hasLayer(marker)) map.removeLayer(marker);
    });
    stopMarkers = {};
  };

  const hideBusStopPanel = () => dom.busStopPanel.classList.remove('is-visible');

  // Bus Alert Functions
  const updateBusAlertDropdown = () => {
    if (dom.busAlertSelect) dom.busAlertSelect.innerHTML = '<option value="">Select a bus to track</option>';
    if (dom.lostBagBusSelect) dom.lostBagBusSelect.innerHTML = '<option value="">Select the bus you were on</option>';

    Object.keys(vehiclesData).forEach(vid => {
      const routeName = vehiclesData[vid].routeName || 'Unknown Route';
      if (dom.busAlertSelect) {
        const option = document.createElement('option');
        option.value = vid;
        option.textContent = `${vid} - ${routeName}`;
        dom.busAlertSelect.appendChild(option);
      }
      if (dom.lostBagBusSelect) {
        const option2 = document.createElement('option');
        option2.value = vid;
        option2.textContent = `${vid} - ${routeName}`;
        dom.lostBagBusSelect.appendChild(option2);
      }
    });
  };

  const setBusAlert = () => {
    const selectedBus = dom.busAlertSelect ? dom.busAlertSelect.value : '';
    if (!selectedBus) {
      showToast('Please select a bus first.', 'warning');
      return;
    }

    busAlerts[selectedBus] = true;
    localStorage.setItem('busAlerts', JSON.stringify(busAlerts));
    showToast(`Alert set for bus ${selectedBus}. You'll be notified when it arrives near you.`, 'success');

    // Add visual indicator to the bus marker
    if (markers[selectedBus]) {
      markers[selectedBus].marker.setIcon(createBusIcon('#f59e0b'));
    }
  };

  const checkBusAlerts = () => {
    if (!userLocation) return;

    Object.keys(busAlerts).forEach(vid => {
      if (vehiclesData[vid] && markers[vid]) {
        const busCoords = parseGps(vehiclesData[vid].gps);
        if (busCoords) {
          const distance = calculateDistance(
            userLocation[0], userLocation[1],
            busCoords[0], busCoords[1]
          );

          // Notify if bus is within 500 meters
          if (distance < 0.5) {
            showToast(`Bus ${vid} is approaching! It's ${formatDistance(distance)} away.`, 'success', 5000);
            alertSound.play().catch(e => console.log('Audio play error', e));

            // Remove the alert after notifying
            delete busAlerts[vid];
            localStorage.setItem('busAlerts', JSON.stringify(busAlerts));

            // Reset bus icon color
            if (markers[vid]) {
              markers[vid].marker.setIcon(createBusIcon());
            }
          }
        }
      }
    });
  };

  // Lost Bag Function
  const reportLostBag = () => {
    const selectedBus = dom.lostBagBusSelect ? dom.lostBagBusSelect.value : '';
    const description = dom.bagDescription ? dom.bagDescription.value.trim() : '';
    const confirmed = dom.confirmLocation ? dom.confirmLocation.checked : false;

    if (!selectedBus || !description) {
      showToast('Please select a bus and describe your bag.', 'warning');
      return;
    }

    if (!confirmed) {
      showToast('Please confirm that you are near the bus.', 'warning');
      return;
    }

    // Check if user is actually near the bus
    if (!userLocation || !vehiclesData[selectedBus]) {
      showToast('Unable to verify your location.', 'danger');
      return;
    }

    const busCoords = parseGps(vehiclesData[selectedBus].gps);
    if (!busCoords) {
      showToast('Unable to get bus location.', 'danger');
      return;
    }

    const distance = calculateDistance(
      userLocation[0], userLocation[1],
      busCoords[0], busCoords[1]
    );

    if (distance > 0.5) {
      showToast('You are not near the selected bus. Please move closer to report a lost bag.', 'warning');
      return;
    }

    // Send notification to driver/database
    db.ref(`public_transport/vehicles/${selectedBus}/notifications`).push({
      type: 'lost_bag',
      description: description,
      timestamp: Date.now(),
      userLocation: userLocation
    }).then(() => {
      showToast('Driver notified about your lost bag.', 'success');
      // hide modal if using bootstrap modal with id lostBagModal
      const modalEl = document.getElementById('lostBagModal');
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();
      }
    }).catch(err => {
      console.error('Error reporting lost bag:', err);
      showToast('Failed to report lost bag. Please try again.', 'danger');
    });
  };

  // Data & Business Logic
  const loadPublicVehicles = () => {
    const vehiclesRef = db.ref('public_transport/vehicles');
    vehiclesRef.on('value', async snap => {
      hideLoader();
      vehiclesData = snap.val() || {};
      const presentVehicleIds = new Set();
      const bounds = [];

      // Add new & update existing markers
      Object.entries(vehiclesData).forEach(([vid, v]) => {
        presentVehicleIds.add(vid);
        const newCoords = parseGps(v.gps);
        if (newCoords) {
          bounds.push(newCoords);
          if (!markers[vid]) {
            const iconColor = busAlerts[vid] ? '#f59e0b' : '#2563eb';
            const marker = L.marker(newCoords, { icon: createBusIcon(iconColor), title: vid }).addTo(markerGroup);
            marker.bindPopup(`
              <strong>${vid}</strong><br>
              ${v.vehicleType || 'Unknown'}<br>
              ${v.routeName ? `Route: ${v.routeName}` : ''}<br>
              <span class="text-success"><i class="bi bi-clock"></i> ETA: Calculating...</span>
              ${busAlerts[vid] ? '<div class="alert-badge">Alert Set</div>' : ''}
            `);
            marker.on('click', () => showVehicleDetails(vid, v));
            markers[vid] = {
              marker,
              prevCoords: newCoords,
              prevTime: v.lastUpdated || Date.now()
            };
          } else {
            const { marker } = markers[vid];
            marker.setLatLng(newCoords);

            // Update icon based on alert status
            const iconColor = busAlerts[vid] ? '#f59e0b' : '#2563eb';
            marker.setIcon(createBusIcon(iconColor));

            marker.setPopupContent(`
              <strong>${vid}</strong><br>
              ${v.vehicleType || 'Unknown'}<br>
              ${v.routeName ? `Route: ${v.routeName}` : ''}<br>
              <span class="text-success"><i class="bi bi-clock"></i> ETA: Calculating...</span>
              ${busAlerts[vid] ? '<div class="alert-badge">Alert Set</div>' : ''}
            `);
            markers[vid].prevCoords = newCoords;
            markers[vid].prevTime = v.lastUpdated || Date.now();
          }
        }
      });

      // Remove markers for vehicles no longer present
      Object.keys(markers).forEach(vid => {
        if (!presentVehicleIds.has(vid)) {
          try {
            markerGroup.removeLayer(markers[vid].marker);
          } catch (e) { /* ignore */ }
          delete markers[vid];
        }
      });

      // Fit map to bounds if helpful
      if (bounds.length && map && map.getZoom && map.getZoom() <= 12) {
        try {
          map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        } catch (e) {
          console.error("Error fitting bounds:", e);
        }
      }

      // Update dropdowns with current vehicles
      updateBusAlertDropdown();

      // Update ETAs asynchronously (do not block UI)
      (async () => {
        for (const vid of presentVehicleIds) {
          try {
            if (!markers[vid]) continue;
            const { marker, prevCoords, prevTime } = markers[vid];
            const v = vehiclesData[vid];
            const etaInfo = await getETA(v, prevCoords, prevTime);
            const status = etaInfo.speed > 5 ? 'Moving' : 'Stopped';
            if (marker && marker.setPopupContent) {
              marker.setPopupContent(`
                <strong>${vid}</strong><br>
                ${v.vehicleType || 'Unknown'}<br>
                ${v.routeName ? `Route: ${v.routeName}` : ''}<br>
                Status: ${status}<br>
                <span class="text-success"><i class="bi bi-clock"></i> ETA: ${etaInfo.eta}</span>
                ${busAlerts[vid] ? '<div class="alert-badge">Alert Set</div>' : ''}
              `);
            }
          } catch (e) {
            console.error('ETA update error for', vid, e);
          }
        }
      })();

    }, err => {
      console.error('Vehicles listener error:', err);
      showToast('Failed to load vehicles.', 'danger');
      hideLoader();
    });
  };

  const loadBusStops = () => {
    const stopsRef = db.ref('public_transport/stops');
    stopsRef.once('value', snap => {
      const stops = snap.val() || {};
      busStops = Object.entries(stops).map(([id, stop]) => ({
        id,
        name: stop.name,
        gps: stop.gps,
        vehicles: stop.vehicles || []
      }));
      busStops.forEach(stop => {
        const coords = parseGps(stop.gps);
        if (coords) {
          const marker = L.marker(coords, { icon: stopIcon }).addTo(map);
          marker.bindPopup(`
            <strong>${stop.name}</strong><br>
            <small>Click for more info</small>
          `);
          marker.on('click', () => showBusStopPanel(stop));
          stopMarkers[stop.id] = marker;
        }
      });
      if (userLocation) {
        findNearestBusStops();
      }
    }, err => {
      console.error('Bus stops listener error:', err);
      showToast('Failed to load bus stops.', 'danger');
    });
  };

  const searchByVehicleNumber = () => {
    const query = dom.searchVehicleInput ? dom.searchVehicleInput.value.trim().toUpperCase() : '';
    if (!query) {
      showToast('Please enter a vehicle number.', 'warning');
      return;
    }
    // try to find in local vehiclesData
    const foundVid = Object.keys(vehiclesData).find(vid => vid.toUpperCase().includes(query));
    if (foundVid) {
      if (markers[foundVid]) {
        const { marker } = markers[foundVid];
        map.flyTo(marker.getLatLng(), 16);
        marker.openPopup();
        showVehicleDetails(foundVid, vehiclesData[foundVid]);
      } else {
        const coords = parseGps(vehiclesData[foundVid].gps);
        if (coords) {
          map.flyTo(coords, 16);
          showVehicleDetails(foundVid, vehiclesData[foundVid]);
        } else {
          showToast('Vehicle has no valid location.', 'warning');
        }
      }
    } else {
      showToast('Vehicle not found.', 'warning');
    }
  };

  const searchByRoute = async () => {
    const from = dom.searchRouteFrom ? dom.searchRouteFrom.value.trim().toLowerCase() : '';
    const to = dom.searchRouteTo ? dom.searchRouteTo.value.trim().toLowerCase() : '';
    if (!from || !to) {
      showToast('Enter both "From" and "To" locations.', 'warning');
      return;
    }
    dom.searchResults.innerHTML = '<div class="text-center p-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Searching...</div>';
    const results = [];
    Object.entries(vehiclesData).forEach(([vid, v]) => {
      const stops = (v.stops || []).map(s => s.name ? s.name.toLowerCase() : '');
      const hasFrom = stops.some(s => s.includes(from));
      const hasTo = stops.some(s => s.includes(to));
      if (hasFrom && hasTo) {
        results.push({ vid, vehicle: v });
      }
    });
    dom.searchResults.innerHTML = '';
    if (results.length > 0) {
      for (const { vid, vehicle } of results) {
        let etaInfo = { eta: 'Calculating...', nextStop: 'N/A' };
        if (markers[vid]) {
          const { prevCoords, prevTime } = markers[vid];
          etaInfo = await getETA(vehicle, prevCoords, prevTime);
        }

        const div = document.createElement('div');
        div.className = 'vehicle-item p-3 border-bottom';
        div.innerHTML = `
          <div class="d-flex justify-content-between align-items-start">
            <div class="d-flex align-items-center">
              <i class="bi bi-bus-front text-primary me-2"></i>
              <div>
                <strong>${vid}</strong> - ${vehicle.routeName || 'N/A'}<br>
                <small class="text-muted">${vehicle.vehicleType || 'Unknown'}</small>
              </div>
            </div>
            <span class="eta-badge">${etaInfo.eta}</span>
          </div>
        `;
        div.addEventListener('click', () => {
          if (markers[vid]) {
            const { marker } = markers[vid];
            map.flyTo(marker.getLatLng(), 16);
            marker.openPopup();
            showVehicleDetails(vid, vehicle);
          } else {
            const coords = parseGps(vehicle.gps);
            if (coords) {
              map.flyTo(coords, 16);
              showVehicleDetails(vid, vehicle);
            } else {
              showToast('Vehicle location not available.', 'warning');
            }
          }
        });
        dom.searchResults.appendChild(div);
      }
    } else {
      dom.searchResults.innerHTML = '<div class="text-muted p-3 text-center"><i class="bi bi-exclamation-circle"></i> No routes found.</div>';
    }
  };

  // Event Listeners
  const addEventListeners = () => {
    if (dom.locateBtn) dom.locateBtn.addEventListener('click', locateUser);
    if (dom.showBusStopsBtn) dom.showBusStopsBtn.addEventListener('click', () => {
      if (userLocation) {
        findNearestBusStops();
      } else {
        showToast("Please enable location services first.", "warning");
        locateUser();
      }
    });
    if (dom.searchVehicleBtn) dom.searchVehicleBtn.addEventListener('click', searchByVehicleNumber);
    if (dom.searchRouteBtn) dom.searchRouteBtn.addEventListener('click', searchByRoute);
    if (dom.closeSidebarBtn) dom.closeSidebarBtn.addEventListener('click', hideVehicleDetails);
    if (dom.closeBusStopPanelBtn) dom.closeBusStopPanelBtn.addEventListener('click', hideBusStopPanel);
    if (dom.searchVehicleInput) dom.searchVehicleInput.addEventListener('keypress', e => { if (e.key === 'Enter') searchByVehicleNumber(); });
    if (dom.searchRouteFrom) dom.searchRouteFrom.addEventListener('keypress', e => { if (e.key === 'Enter') searchByRoute(); });
    if (dom.searchRouteTo) dom.searchRouteTo.addEventListener('keypress', e => { if (e.key === 'Enter') searchByRoute(); });

    // Alerts and lost bag
    if (dom.setAlertBtn) dom.setAlertBtn.addEventListener('click', setBusAlert);
    if (dom.reportLostBagBtn) dom.reportLostBagBtn.addEventListener('click', reportLostBag);
  };

  // Initialization
  document.addEventListener('DOMContentLoaded', () => {
    showLoader();

    // Load any saved bus alerts
    const savedAlerts = localStorage.getItem('busAlerts');
    if (savedAlerts) {
      try { busAlerts = JSON.parse(savedAlerts); } catch (e) { busAlerts = {}; }
    }

    initMap();
    loadPublicVehicles();
    loadBusStops();
    addEventListeners();

    // Start checking for bus alerts
    alertCheckInterval = setInterval(checkBusAlerts, 10000); // Check every 10 seconds

    // initial locate, but don't block if fails
    locateUser().catch(() => {
      console.log("Initial geolocation attempt failed; user can manually trigger location.");
      hideLoader();
    });
  });
})();
