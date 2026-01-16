const { ipcRenderer } = require('electron');

// UI Elements
const callInput = document.getElementById('callsignInput');
const lookupBtn = document.getElementById('lookupBtn');

// Layout Containers
const headerData = document.getElementById('headerData'); // NYTT ID
const mediaRow = document.getElementById('mediaRow');
const controlsRow = document.getElementById('controlsRow');

// Data Elements
const dxccName = document.getElementById('dxccName');
const flagIcon = document.getElementById('flagIcon');
const bearingValue = document.getElementById('bearingValue');
const distanceValue = document.getElementById('distanceValue');

// Badges
const statusDxcc = document.getElementById('statusDxcc');
const statusSlot = document.getElementById('statusSlot');
const statusLotw = document.getElementById('statusLotw');
const statusOqrs = document.getElementById('statusOqrs');

// Media
const profileImg = document.getElementById('profileImg');
const noImageLabel = document.getElementById('noImageLabel');
const mapFrame = document.getElementById('mapFrame');
const profileImgContainer = document.getElementById('profileImgContainer');
const mapContainer = document.getElementById('mapContainer');

// Buttons
const rotateBtn = document.getElementById('rotateBtn');
const logBtn = document.getElementById('logBtn');
const spotFlexBtn = document.getElementById('spotFlexBtn');
const spotClusterBtn = document.getElementById('spotClusterBtn');

let currentCallsign = '';
let currentBearing = null;
let currentImageUrl = '';
let currentGoogleMapsLink = '';
let appConfig = {};

// --- Initialize ---
window.onload = async () => {
    appConfig = await ipcRenderer.invoke('get-config');
    applyTheme(appConfig.application?.theme || 'system');
    callInput.focus();
    resetUI(); 
};

// --- Event Listeners ---
callInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performLookup();
});

callInput.addEventListener('input', () => {
    if (currentCallsign) resetUI();
});

// Rotate
rotateBtn.addEventListener('click', () => {
    if (currentBearing !== null) {
        ipcRenderer.invoke('rotate-rotor', currentBearing);
        const originalHtml = rotateBtn.innerHTML;
        rotateBtn.innerHTML = '<i class="bi bi-check"></i>';
        setTimeout(() => rotateBtn.innerHTML = originalHtml, 1500);
    }
});

// Log
logBtn.addEventListener('click', () => {
    if (currentCallsign) ipcRenderer.invoke('log-qso', currentCallsign);
});

// Maps & Image
mapContainer.addEventListener('click', () => {
    if (currentGoogleMapsLink) ipcRenderer.invoke('open-external-link', currentGoogleMapsLink);
});

profileImgContainer.addEventListener('click', () => {
    if (currentImageUrl) ipcRenderer.invoke('open-image-window', currentImageUrl);
});

// --- Logic ---

async function performLookup() {
    let rawCall = callInput.value.trim().toUpperCase();
    if (!rawCall) return;

    if (!/^(?=.*\d)[A-Z0-9/]{3,}$/.test(rawCall)) {
        // Simple invalid indication (red border)
        callInput.classList.add('is-invalid');
        setTimeout(() => callInput.classList.remove('is-invalid'), 2000);
        return;
    }

    callInput.disabled = true;
    document.body.style.cursor = 'wait';

    try {
        const result = await ipcRenderer.invoke('lookup-callsign', rawCall);
        
        if (result) {
            updateUI(result);
        } else {
            // Not Found Indication inside input? or allow header to show error?
            // Let's flash the input red for simplicity in compact mode
            callInput.classList.add('is-invalid');
            setTimeout(() => callInput.classList.remove('is-invalid'), 2000);
        }
    } catch (err) {
        console.error(err);
    } finally {
        callInput.disabled = false;
        callInput.focus();
        document.body.style.cursor = 'default';
    }
}

function updateUI(data) {
    currentCallsign = data.callsign;
    currentBearing = data.bearing; 

    // SHOW Data Containers
    headerData.classList.remove('d-none');
    headerData.classList.add('d-flex'); // Restore flex behavior
    mediaRow.classList.remove('d-none');
    controlsRow.classList.remove('d-none');

    // Header Info
    let displayText = data.dxcc || 'Unknown';
    if (data.name) {
        displayText += ` - ${data.name}`;
        if (data.location) displayText += ` (${data.location})`;
    }
    dxccName.innerText = displayText;

    // Flag
    if (data.dxcc_flag) {
        const isoCode = getIsoCodeFromEmoji(data.dxcc_flag);
        if (isoCode) {
            flagIcon.className = `fi fi-${isoCode} me-2`;
            flagIcon.innerText = ''; 
        } else {
            flagIcon.className = 'fi me-2';
            flagIcon.innerText = data.dxcc_flag; 
        }
    }

    // Stats (Bearing/Dist)
    bearingValue.innerText = data.bearing ? `${data.bearing}°` : '---';
    
    // Imperial Check
    if (data.distance) {
        let dist = data.distance;
        let unit = 'km';
        if (appConfig.application && appConfig.application.useImperial) {
            dist = Math.round(dist * 0.621371);
            unit = 'mi';
        }
        distanceValue.innerText = `${dist} ${unit}`;
    } else {
        distanceValue.innerText = '';
    }

    // Badges
    updateBadge(statusDxcc, data.dxcc_confirmed, "DXCC Cnf", "New DXCC");
    
    if (data.radio_connected) {
        statusSlot.style.display = 'flex';
        updateBadge(statusSlot, data.dxcc_confirmed_on_band_mode, "Slot Cnf", "New Slot");
    } else {
        statusSlot.style.display = 'none';
    }

    if (data.lotw_member) {
        statusLotw.className = 'status-badge status-active';
        statusLotw.innerText = "LoTW";
    } else {
        statusLotw.className = 'status-badge status-none';
        statusLotw.innerText = "No LoTW";
    }

    if (data.qsl_manager && data.qsl_manager.includes('OQRS')) {
        statusOqrs.className = 'status-badge status-active';
        statusOqrs.innerText = "OQRS";
    } else {
        statusOqrs.className = 'status-badge status-none';
        statusOqrs.innerText = "No OQRS";
    }

    // Media
    if (data.image) {
        currentImageUrl = data.image;
        profileImg.src = data.image;
        profileImg.classList.remove('d-none');
        noImageLabel.classList.add('d-none');
    } else {
        currentImageUrl = '';
        profileImg.src = '';
        profileImg.classList.add('d-none');
        noImageLabel.classList.remove('d-none');
    }

    // Map
    let mapLat = 0, mapLon = 0, hasCoords = false;
    if (data.lat && data.lon) {
        mapLat = parseFloat(data.lat);
        mapLon = parseFloat(data.lon);
        hasCoords = true;
    } else if (data.latlng && data.latlng.length === 2) {
        mapLat = data.latlng[0];
        mapLon = data.latlng[1];
        hasCoords = true;
    } else if (data.dxcc_lat) {
        mapLat = parseFloat(data.dxcc_lat);
        mapLon = parseFloat(data.dxcc_long);
        hasCoords = true;
    }

    if (hasCoords) {
        const bbox = `${mapLon-2},${mapLat-2},${mapLon+2},${mapLat+2}`;
        mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${mapLat},${mapLon}`;
        currentGoogleMapsLink = `https://www.google.com/maps/search/?api=1&query=${mapLat},${mapLon}`;
    } else {
        mapFrame.src = 'about:blank';
        currentGoogleMapsLink = '';
    }
}

function resetUI() {
    currentCallsign = '';
    currentBearing = null;
    currentImageUrl = '';
    
    // Hide Data Containers
    headerData.classList.add('d-none');
    headerData.classList.remove('d-flex');
    mediaRow.classList.add('d-none');
    controlsRow.classList.add('d-none');

    // Reset internal values
    dxccName.innerText = '---';
    bearingValue.innerText = '---';
    profileImg.src = '';
    mapFrame.src = 'about:blank';
}

function updateBadge(el, isConfirmed, textConf, textNeed) {
    if (isConfirmed) {
        el.className = 'status-badge status-active';
        el.innerText = textConf;
    } else {
        el.className = 'status-badge status-needed';
        el.innerText = textNeed;
    }
}

function getIsoCodeFromEmoji(emoji) {
    if (!emoji || emoji.length < 4) return null;
    const codePoints = Array.from(emoji).map(c => c.codePointAt(0));
    const base = 0x1F1E6;
    const char1 = String.fromCharCode(codePoints[0] - base + 65);
    const char2 = String.fromCharCode(codePoints[1] - base + 65);
    const code = char1 + char2;
    return /^[A-Z]{2}$/.test(code) ? code.toLowerCase() : null;
}

function applyTheme(theme) {
    if (theme === 'system') {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-bs-theme', 'light');
      }
    } else {
      document.documentElement.setAttribute('data-bs-theme', theme);
    }
}