const { ipcRenderer } = require('electron');

// UI Elements
const callInput = document.getElementById('callsignInput');
const lookupBtn = document.getElementById('lookupBtn');

// Layout Containers
const headerData = document.getElementById('headerData'); 
const mediaRow = document.getElementById('mediaRow');
const controlsRow = document.getElementById('controlsRow');
const statsRow = document.getElementById('statsRow');
const dxRow = document.getElementById('dxRow');      

// Data Elements
const dxccName = document.getElementById('dxccName');
const flagIcon = document.getElementById('flagIcon');
const bearingValue = document.getElementById('bearingValue');
const distanceValue = document.getElementById('distanceValue');

// Stats Elements (NEW)
const valGrid = document.getElementById('valGrid');
const valBear = document.getElementById('valBear');
const valDist = document.getElementById('valDist');
const valBearLP = document.getElementById('valBearLP');
const valDistLP = document.getElementById('valDistLP');

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
const rotateSP = document.getElementById('rotateBtnSP');
const rotateLP = document.getElementById('rotateBtnLP');
const logBtn = document.getElementById('logBtn');
const spotFlexBtn = document.getElementById('spotFlexBtn');
const btnSendDx = document.getElementById('btnSendDx');
const btnDxLink = document.getElementById('btnDxLink');
const dxComment = document.getElementById('dxComment');

let currentCallsign = '';
let currentBearingSP = null;
let currentBearingLP = null;
let currentImageUrl = '';
let currentGoogleMapsLink = '';
let appConfig = {};
let isExternalLookup = false; // Flag to prevent recursion

// --- Initialize ---
window.onload = async () => {
    appConfig = await ipcRenderer.invoke('get-config');
    applyTheme(appConfig.application?.theme || 'system');
    callInput.focus();
    resetUI(); 
};

// --- External Trigger (Flex Click) ---
ipcRenderer.on('external-lookup', (event, callsign) => {
    callInput.value = callsign;
    isExternalLookup = true; // Mark source
    performLookup();
});

// --- Event Listeners ---
callInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performLookup();
});

callInput.addEventListener('input', () => {
    if (currentCallsign) resetUI();
});

// Rotor Buttons
rotateSP.addEventListener('click', () => {
    if (currentBearingSP !== null) {
        ipcRenderer.invoke('rotate-rotor', currentBearingSP);
        flashButton(rotateSP);
    }
});

rotateLP.addEventListener('click', () => {
    if (currentBearingLP !== null) {
        ipcRenderer.invoke('rotate-rotor', currentBearingLP);
        flashButton(rotateLP);
    }
});

function flashButton(btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="bi bi-check"></i>';
    setTimeout(() => btn.innerHTML = originalHtml, 1000);
}

// Log
logBtn.addEventListener('click', () => {
    if (currentCallsign) ipcRenderer.invoke('log-qso', currentCallsign);
});

// DX Spot
btnSendDx.addEventListener('click', async () => {
    const comment = dxComment.value;
    // Send to main process
    const res = await ipcRenderer.invoke('send-dx-spot', { callsign: currentCallsign, comment });
    if(res.success) {
        flashButton(btnSendDx);
        dxComment.value = ''; // Clear comment
    } else {
        alert("Error: " + res.error);
    }
});

btnDxLink.addEventListener('click', () => {
    ipcRenderer.invoke('open-external-link', 'https://dxwatch.com/');
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

            // Auto Log Logic (Only if NOT from external click)
            if (appConfig.application?.autoLogQso && !isExternalLookup) {
                 ipcRenderer.invoke('log-qso', rawCall);
            }
        } else {
            // Not Found logic (Optional visual feedback)
            callInput.classList.add('is-invalid');
            setTimeout(() => callInput.classList.remove('is-invalid'), 2000);
        }
    } catch (err) {
        console.error(err);
    } finally {
        callInput.disabled = false;
        callInput.focus();
        document.body.style.cursor = 'default';
        isExternalLookup = false; // Reset flag
    }
}

function updateUI(data) {
    currentCallsign = data.callsign;
    currentBearingSP = data.bearing; 
    currentBearingLP = data.bearing_lp; // From main.js

    // SHOW Data Containers
    headerData.classList.remove('d-none');
    statsRow.classList.remove('d-none');
    dxRow.classList.remove('d-none');   
    controlsRow.classList.remove('d-none');

    // Show Media?
    if (appConfig.application?.showQsoMedia) {
        mediaRow.classList.remove('d-none');
    } else {
        mediaRow.classList.add('d-none');
    }

    // Show Log Button?
    if (appConfig.application?.autoLogQso) {
        logBtn.style.display = 'none';
    } else {
        logBtn.style.display = 'flex';
    }

    // Enable DX Button if radio connected
    if (data.radio_connected) {
        btnSendDx.disabled = false;
        dxComment.disabled = false;
        dxComment.placeholder = "DX Comment (e.g. 5 up)";
    } else {
        btnSendDx.disabled = true;
        dxComment.disabled = true;
        dxComment.placeholder = "Radio Disconnected";
    }

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

    // Stats Logic (Imperial vs Metric)
    let distSP = data.distance;
    let distLP = data.distance_lp;
    let unit = 'km';

    if (appConfig.application?.useImperial) {
        // Convert to miles if requested
        if (distSP) distSP = Math.round(distSP * 0.621371);
        if (distLP) distLP = Math.round(distLP * 0.621371);
        unit = 'mi';
    }

    // Header Bearing
    bearingValue.innerText = data.bearing ? `${data.bearing}°` : '---';
    distanceValue.innerText = distSP ? `${distSP} ${unit}` : '';

    // Extended Stats Row
    valGrid.innerText = data.gridsquare || '---';
    
    // Short Path Stats
    valBear.innerText = data.bearing ? `${data.bearing}°` : '-';
    valDist.innerText = distSP ? `${distSP} ${unit}` : '-';

    // Long Path Stats
    valBearLP.innerText = data.bearing_lp ? `${data.bearing_lp}°` : '-';
    valDistLP.innerText = distLP ? `${distLP} ${unit}` : '-';

    // Rotor Button Labels
    document.getElementById('rotBearSP').innerText = data.bearing ? `${data.bearing}°` : '';
    document.getElementById('rotBearLP').innerText = data.bearing_lp ? `${data.bearing_lp}°` : '';

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
    currentBearingSP = null;
    currentBearingLP = null;
    currentImageUrl = '';
    
    headerData.classList.add('d-none');
    statsRow.classList.add('d-none');
    mediaRow.classList.add('d-none');
    dxRow.classList.add('d-none');
    controlsRow.classList.add('d-none');

    dxccName.innerText = '---';
    bearingValue.innerText = '---';
    distanceValue.innerText = '';
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