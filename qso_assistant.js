const { ipcRenderer } = require('electron');

// UI Elements
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
    resetUI(); 

    try {
        appConfig = await ipcRenderer.invoke('get-config');
        if (appConfig.application?.theme) {
            applyTheme(appConfig.application.theme);
        }
    } catch (err) {
        console.error("Error loading config:", err);
        appConfig = {}; 
    }
};

// --- 1. Wavelog Live Metadata Listener (Primary Source) ---
ipcRenderer.on('wavelog-lookup', (event, data) => {
    // Direct mapping from WebSocket Payload
    const mappedData = {
        callsign: data.callsign,
        dxcc_id: data.dxcc_id,
        name: data.name,
        gridsquare: data.grid || data.gridsquare,
        city: data.city,
        state: data.state,
        us_county: data.us_county, 
        
        bearing: data.azimuth, 
        distance: data.distance,
        
        bearing_lp: (data.azimuth + 180) % 360,
        distance_lp: Math.round(40075 - parseFloat(data.distance || 0)),

        lotw_member: data.lotw_member === "active",
        lotw_days: data.lotw_days,
        eqsl_member: data.eqsl_member === "active",
        qsl_manager: data.qsl_manager,
        
        dxcc_confirmed_on_band_mode: data.slot_confirmed,
        
        radio_connected: data.radio_connected,
        test_mode: data.test_mode,
        
        // WS usually lacks image and precise coords, so we pass what we have
        image: data.image, 
        lat: data.lat,
        lon: data.lon
    };

    // 1. Update UI immediately with what we have (Text + Map via Grid calc)
    updateUI(mappedData);

    // 2. Fetch missing rich media (Image) if needed
    // Only if user has enabled "Show Media" AND we are missing the image
    if (appConfig.application?.showQsoMedia && !mappedData.image && mappedData.callsign) {
        console.log("Media enabled but missing in WebSocket. Triggering background lookup...");
        performLookup(mappedData.callsign); 
    }
});

// --- 2. Flex Spot Click (Secondary Source) ---
ipcRenderer.on('external-lookup', async (event, callsign) => {
    performLookup(callsign);
});

// --- Event Listeners ---

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

if (spotDxClusterBtn) {
    spotDxClusterBtn.addEventListener('click', async () => {
        const comment = dxComment.value;
        spotDxClusterBtn.disabled = true;
        const res = await ipcRenderer.invoke('send-dx-spot', { callsign: currentCallsign, comment });
        
        if(res.success) {
            flashButton(spotDxClusterBtn);
            dxComment.value = ''; 
            spotDxClusterBtn.disabled = true; 
        } else {
            alert("Error: " + res.error);
            spotDxClusterBtn.disabled = false; 
        }
    });
}

btnDxLink.addEventListener('click', () => {
    ipcRenderer.invoke('open-external-link', 'https://dxwatch.com/');
});

mapContainer.addEventListener('click', () => {
    if (currentGoogleMapsLink) ipcRenderer.invoke('open-external-link', currentGoogleMapsLink);
});

profileImgContainer.addEventListener('click', () => {
    if (currentImageUrl) ipcRenderer.invoke('open-image-window', currentImageUrl);
});

// --- Logic ---

/**
 * Performs a FULL lookup via Main Process (Wavelog API/QRZ).
 */
async function performLookup(callsign) {
    if (!callsign) return;

    try {
        const result = await ipcRenderer.invoke('lookup-callsign', callsign);
        
        if (result) {
            result.radio_connected = await ipcRenderer.invoke('get-radio-status'); // Ensure status is fresh
            updateUI(result);
        } else {
            if(callDisplay) {
                callDisplay.style.color = "#dc3545"; 
                setTimeout(() => callDisplay.style.color = "#0dcaf0", 2000);
            }
        }
    } catch (err) {
        console.error(err);
    }
}

function updateUI(data) {
    currentCallsign = data.callsign;
    
    if(callDisplay) {
        callDisplay.innerText = currentCallsign || '---';
        callDisplay.style.color = "#0dcaf0"; 
    }
    
    currentBearingSP = data.bearing; 
    currentBearingLP = data.bearing_lp;

    headerData.classList.remove('d-none');
    statsRow.classList.remove('d-none');
    dxRow.classList.remove('d-none');   
    controlsRow.classList.remove('d-none');

    const rotorEnabled = appConfig.rotator && appConfig.rotator.enabled;
    
    if (rotorEnabled) {
        rotateSP.style.display = 'flex';
        rotateLP.style.display = 'flex';
        controlsRow.style.display = 'grid';
        controlsRow.style.gridTemplateColumns = 'repeat(4, 1fr)';
        if(spotFlexBtn) {
            spotFlexBtn.style.gridColumn = 'span 2';
            spotFlexBtn.style.width = '100%'; 
        }
    } else {
        rotateSP.style.display = 'none';
        rotateLP.style.display = 'none';
        controlsRow.style.display = 'flex';
        controlsRow.style.justifyContent = 'center';
        if(spotFlexBtn) {
            spotFlexBtn.style.gridColumn = 'auto';
            spotFlexBtn.style.width = '50%'; 
        }
    }

    if (appConfig.application?.showQsoMedia) {
        mediaRow.classList.remove('d-none');
    } else {
        mediaRow.classList.add('d-none');
    }

    const isRadioConnected = data.radio_connected === true;
    const isTestMode = data.test_mode === true;
    const canSpot = isRadioConnected || isTestMode;
    const clusterEnabled = appConfig.dxCluster && appConfig.dxCluster.host;

    if (canSpot && clusterEnabled) {
        if(spotDxClusterBtn) {
             spotDxClusterBtn.disabled = false;
             spotDxClusterBtn.title = "Send Spot to Cluster";
        }
        dxComment.disabled = false;
        dxComment.setAttribute("placeholder", "DX Comment (e.g. 5 up)");
    } else {
        if(spotDxClusterBtn) {
            spotDxClusterBtn.disabled = true;
            const reason = !canSpot ? "Radio Disconnected" : "DX Cluster Not Configured";
            spotDxClusterBtn.title = reason;
        }
        dxComment.disabled = true;
        const placeholder = !canSpot ? "Radio Disconnected" : "DX Cluster Disabled";
        dxComment.setAttribute("placeholder", placeholder);
    }

    if (spotFlexBtn) {
        spotFlexBtn.disabled = !isRadioConnected;
    }

    if(radioStatusFooter) {
        radioStatusFooter.style.display = (isRadioConnected || isTestMode) ? 'none' : 'block';
    }

    let displayText = data.dxcc || '';
    let locString = data.city || '';
    if (data.state) locString += (locString ? `, ${data.state}` : data.state);
    if (data.us_county) locString += ` - ${data.us_county}`;
    
    if (data.name) {
        displayText += ` - ${data.name}`;
        if (locString) displayText += ` (${locString})`;
    }
    dxccName.innerText = displayText || 'Unknown';

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

    let distSP = data.distance;
    let distLP = data.distance_lp;
    let unit = 'km';

    if (appConfig.application?.useImperial) {
        if (distSP) distSP = Math.round(distSP * 0.621371);
        if (distLP) distLP = Math.round(distLP * 0.621371);
        unit = 'mi';
    }

    bearingValue.innerText = data.bearing ? `${data.bearing}°` : '---';
    distanceValue.innerText = distSP ? `${distSP} ${unit}` : '';

    valGrid.innerText = data.gridsquare || '---';
    valBear.innerText = data.bearing ? `${data.bearing}°` : '-';
    valDist.innerText = distSP ? `${distSP} ${unit}` : '-';
    valBearLP.innerText = data.bearing_lp ? `${data.bearing_lp}°` : '-';
    valDistLP.innerText = distLP ? `${distLP} ${unit}` : '-';

    document.getElementById('rotBearSP').innerText = data.bearing ? `${data.bearing}°` : '';
    document.getElementById('rotBearLP').innerText = data.bearing_lp ? `${data.bearing_lp}°` : '';

    updateBadge(statusDxcc, data.dxcc_confirmed, "DXCC CNF", "NEW DXCC");
    
    if (data.dxcc_confirmed_on_band_mode !== undefined) {
        statusSlot.style.display = 'flex';
        updateBadge(statusSlot, data.dxcc_confirmed_on_band_mode, "SLOT CNF", "NEW SLOT");
    } else {
        statusSlot.style.display = 'none';
    }

    if (data.lotw_member) {
        statusLotw.className = 'status-badge status-active';
        statusLotw.style.backgroundColor = ''; 
        if (data.lotw_days !== null && data.lotw_days !== undefined) {
            statusLotw.innerText = `LOTW (${data.lotw_days}D)`;
            if (parseInt(data.lotw_days) > 365) {
                statusLotw.style.backgroundColor = '#d63384'; 
            }
        } else {
            statusLotw.innerText = "LOTW";
        }
    } else {
        statusLotw.className = 'status-badge status-none';
        statusLotw.style.backgroundColor = ''; 
        statusLotw.innerText = "NO LOTW";
    }

    if (data.qsl_manager && data.qsl_manager.toUpperCase().includes('OQRS')) {
        statusOqrs.className = 'status-badge status-active';
        statusOqrs.innerText = "OQRS";
    } else {
        statusOqrs.className = 'status-badge status-none';
        statusOqrs.innerText = "NO OQRS";
    }

    // --- Media Logic ---
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

    // --- Map Logic with Grid Fallback ---
    let mapLat = 0, mapLon = 0, hasCoords = false;
    
    // 1. Try explicit Lat/Lon (from API)
    if (data.lat && data.lon) {
        mapLat = parseFloat(data.lat);
        mapLon = parseFloat(data.lon);
        hasCoords = true;
    } else if (data.latlng && data.latlng.length === 2) {
        mapLat = data.latlng[0];
        mapLon = data.latlng[1];
        hasCoords = true;
    } 
    // 2. Fallback: Try to calculate from Grid Square (Local)
    else if (data.gridsquare) {
        const coords = gridToLatLon(data.gridsquare);
        if (coords) {
            mapLat = coords.lat;
            mapLon = coords.lon;
            hasCoords = true;
        }
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

/**
 * Converts Maidenhead Grid Square (e.g. JO57VT) to Lat/Lon.
 */
function gridToLatLon(grid) {
    if (!grid || grid.length < 4) return null;
    
    const adjGrid = grid.toUpperCase();
    
    // Field (JO)
    const lonField = adjGrid.charCodeAt(0) - 'A'.charCodeAt(0);
    const latField = adjGrid.charCodeAt(1) - 'A'.charCodeAt(0);
    
    // Square (57)
    const lonSquare = parseInt(adjGrid[2]);
    const latSquare = parseInt(adjGrid[3]);
    
    let lon = (lonField * 20) + (lonSquare * 2) - 180;
    let lat = (latField * 10) + latSquare - 90;
    
    // Center of 4-char square
    let lonCenter = 1; 
    let latCenter = 0.5;

    // Subsquare (VT) - Optional
    if (adjGrid.length >= 6) {
        const lonSub = adjGrid.charCodeAt(4) - 'A'.charCodeAt(0);
        const latSub = adjGrid.charCodeAt(5) - 'A'.charCodeAt(0);
        
        lon += (lonSub * (2/24));
        lat += (latSub * (1/24));
        
        // Center of 6-char square
        lonCenter = (2/24) / 2;
        latCenter = (1/24) / 2;
    }

    return { 
        lat: lat + latCenter, 
        lon: lon + lonCenter 
    };
}