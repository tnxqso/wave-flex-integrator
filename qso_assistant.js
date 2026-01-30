const { ipcRenderer } = require('electron');

// UI Elements
// NOTE: Assumes HTML uses <div id="callsignDisplay"> instead of input
const callDisplay = document.getElementById('callsignDisplay'); 
const radioStatusFooter = document.getElementById('radioStatusFooter');

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

// Stats Elements
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
const spotFlexBtn = document.getElementById('spotFlexBtn');
const spotDxClusterBtn = document.getElementById('spotDxClusterBtn'); 
const btnDxLink = document.getElementById('btnDxLink');
const dxComment = document.getElementById('dxComment');

let currentCallsign = '';
let currentBearingSP = null;
let currentBearingLP = null;
let currentImageUrl = '';
let currentGoogleMapsLink = '';
let appConfig = {};

// --- Initialize ---
window.onload = async () => {
    appConfig = await ipcRenderer.invoke('get-config');
    applyTheme(appConfig.application?.theme || 'system');
    resetUI(); 
};

// --- 1. Wavelog Live Metadata Listener (Primary Source) ---
ipcRenderer.on('wavelog-lookup', (event, data) => {
    console.log("Received live metadata from Wavelog:", data);
    
    // Direct mapping - No new lookup needed!
    // Wavelog has already done the heavy lifting via WebSocket.
    const mappedData = {
        callsign: data.callsign,
        dxcc_id: data.dxcc_id,
        name: data.name,
        gridsquare: data.grid || data.gridsquare,
        city: data.city,
        state: data.state,
        us_county: data.us_county, 
        
        // Use Wavelog's calculated bearing directly
        bearing: data.azimuth, 
        distance: data.distance,
        
        // Calculate LP locally based on Wavelog's azimuth
        bearing_lp: (data.azimuth + 180) % 360,
        distance_lp: Math.round(40075 - parseFloat(data.distance || 0)),

        // Extended status flags
        lotw_member: data.lotw_member === "active",
        lotw_days: data.lotw_days,
        eqsl_member: data.eqsl_member === "active",
        qsl_manager: data.qsl_manager,
        
        // Slot logic from Wavelog
        dxcc_confirmed_on_band_mode: data.slot_confirmed,
        
        // Pass radio status from backend
        radio_connected: data.radio_connected,
        test_mode: data.test_mode // Handle test mode if present
    };

    // Update UI immediately
    updateUI(mappedData);
});

// --- 2. Flex Spot Click (Secondary Source) ---
ipcRenderer.on('external-lookup', async (event, callsign) => {
    // If we click a spot on Flex, we might not be in Wavelog yet.
    // We perform a lookup to populate the Assistant.
    performLookup(callsign);
});

// --- Event Listeners ---

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

// DX Spot (Cluster)
if (spotDxClusterBtn) {
    spotDxClusterBtn.addEventListener('click', async () => {
        const comment = dxComment.value;
        
        // Disable immediately to prevent double-clicks while processing
        spotDxClusterBtn.disabled = true;
        
        const res = await ipcRenderer.invoke('send-dx-spot', { callsign: currentCallsign, comment });
        
        if(res.success) {
            flashButton(spotDxClusterBtn);
            dxComment.value = ''; 
            // Keep disabled after success to prevent double spotting on same callsign.
            // It will be re-enabled automatically when updateUI() runs for the next callsign.
            spotDxClusterBtn.disabled = true; 
        } else {
            alert("Error: " + res.error);
            // Re-enable if it failed, so the user can try again
            spotDxClusterBtn.disabled = false; 
        }
    });
}

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

/**
 * Performs a lookup via Main Process (Wavelog API/QRZ).
 * Only used when triggered by Flex Spot click, NOT by Wavelog Live.
 */
async function performLookup(callsign) {
    if (!callsign) return;

    if(callDisplay) callDisplay.innerText = callsign;
    document.body.style.cursor = 'wait';

    try {
        const result = await ipcRenderer.invoke('lookup-callsign', callsign);
        
        if (result) {
            updateUI(result);
        } else {
            // Visual feedback for not found
            if(callDisplay) {
                callDisplay.style.color = "#dc3545"; // Red
                setTimeout(() => callDisplay.style.color = "#0dcaf0", 2000);
            }
        }
    } catch (err) {
        console.error(err);
    } finally {
        document.body.style.cursor = 'default';
    }
}

function updateUI(data) {
    currentCallsign = data.callsign;
    
    // Update LCD Display
    if(callDisplay) {
        callDisplay.innerText = currentCallsign || '---';
        callDisplay.style.color = "#0dcaf0"; // Cyan/Blue
    }
    
    currentBearingSP = data.bearing; 
    currentBearingLP = data.bearing_lp;

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

    // Handle Radio Status & Buttons
    // Allow spotting if radio connected OR in test mode
    const isRadioConnected = data.radio_connected === true;
    const isTestMode = data.test_mode === true;
    const canSpot = isRadioConnected || isTestMode;

    if (canSpot) {
        if(spotDxClusterBtn) spotDxClusterBtn.disabled = false;
        dxComment.disabled = false;
        dxComment.placeholder = "DX Comment (e.g. 5 up)";
    } else {
        if(spotDxClusterBtn) spotDxClusterBtn.disabled = true;
        dxComment.disabled = true;
        dxComment.placeholder = "Radio Disconnected";
    }

    // Flex Spot Button: ONLY if real radio is connected (Test mode doesn't help here)
    if (spotFlexBtn) {
        spotFlexBtn.disabled = !isRadioConnected;
    }

    // Show warning footer if disconnected (and not in test mode)
    if(radioStatusFooter) {
        radioStatusFooter.style.display = (isRadioConnected || isTestMode) ? 'none' : 'block';
    }

    // Header Info
    let displayText = data.dxcc || '';
    
    // Construct Location String (City, State - County)
    let locString = data.city || '';
    if (data.state) locString += (locString ? `, ${data.state}` : data.state);
    if (data.us_county) locString += ` - ${data.us_county}`;
    
    if (data.name) {
        displayText += ` - ${data.name}`;
        if (locString) displayText += ` (${locString})`;
    }
    dxccName.innerText = displayText || 'Unknown';

    // Flag logic 
    if (data.dxcc_flag) {
        const isoCode = getIsoCodeFromEmoji(data.dxcc_flag);
        if (isoCode) {
            flagIcon.className = `fi fi-${isoCode} me-2`;
            flagIcon.innerText = ''; 
        } else {
            flagIcon.className = 'fi me-2';
            flagIcon.innerText = data.dxcc_flag; 
        }
    } else {
        flagIcon.className = 'd-none'; 
    }

    // Stats Logic (Imperial vs Metric)
    let distSP = data.distance;
    let distLP = data.distance_lp;
    let unit = 'km';

    if (appConfig.application?.useImperial) {
        if (distSP) distSP = Math.round(distSP * 0.621371);
        if (distLP) distLP = Math.round(distLP * 0.621371);
        unit = 'mi';
    }

    // Header Bearing
    bearingValue.innerText = data.bearing ? `${data.bearing}°` : '---';
    distanceValue.innerText = distSP ? `${distSP} ${unit}` : '';

    // Extended Stats Row
    valGrid.innerText = data.gridsquare || '---';
    
    valBear.innerText = data.bearing ? `${data.bearing}°` : '-';
    valDist.innerText = distSP ? `${distSP} ${unit}` : '-';

    valBearLP.innerText = data.bearing_lp ? `${data.bearing_lp}°` : '-';
    valDistLP.innerText = distLP ? `${distLP} ${unit}` : '-';

    // Rotor Button Labels
    document.getElementById('rotBearSP').innerText = data.bearing ? `${data.bearing}°` : '';
    document.getElementById('rotBearLP').innerText = data.bearing_lp ? `${data.bearing_lp}°` : '';

    // Badges
    updateBadge(statusDxcc, data.dxcc_confirmed, "DXCC CNF", "NEW DXCC");
    
    // Slot Status (Band/Mode)
    if (data.dxcc_confirmed_on_band_mode !== undefined) {
        statusSlot.style.display = 'flex';
        updateBadge(statusSlot, data.dxcc_confirmed_on_band_mode, "SLOT CNF", "NEW SLOT");
    } else {
        statusSlot.style.display = 'none';
    }

    // LoTW Status with Days
    if (data.lotw_member) {
        statusLotw.className = 'status-badge status-active';
        statusLotw.style.backgroundColor = ''; 
        
        if (data.lotw_days !== null && data.lotw_days !== undefined) {
            statusLotw.innerText = `LOTW (${data.lotw_days}D)`;
            
            // Warning color for old uploads (> 1 year)
            if (parseInt(data.lotw_days) > 365) {
                statusLotw.style.backgroundColor = '#d63384'; 
                statusLotw.title = "Warning: Last upload > 1 year ago";
            }
        } else {
            statusLotw.innerText = "LOTW";
        }
    } else {
        statusLotw.className = 'status-badge status-none';
        statusLotw.style.backgroundColor = ''; 
        statusLotw.innerText = "NO LOTW";
    }

    // OQRS
    if (data.qsl_manager && data.qsl_manager.toUpperCase().includes('OQRS')) {
        statusOqrs.className = 'status-badge status-active';
        statusOqrs.innerText = "OQRS";
    } else {
        statusOqrs.className = 'status-badge status-none';
        statusOqrs.innerText = "NO OQRS";
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
    
    if(callDisplay) {
        callDisplay.innerText = "WAITING...";
        callDisplay.style.color = "#6c757d";
    }
    
    // Disable buttons on reset
    if(spotDxClusterBtn) spotDxClusterBtn.disabled = true;
    if(spotFlexBtn) spotFlexBtn.disabled = true;
    dxComment.disabled = true;
    if(radioStatusFooter) radioStatusFooter.style.display = 'none'; 
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