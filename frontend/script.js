const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const statusButton = document.getElementById('statusButton');
const statusDiv = document.getElementById('status');
const telemetryDataPre = document.getElementById('telemetryData');

const backendUrl = 'http://127.0.0.1:5000'; // Your Flask backend URL

// --- Map Variables ---
let map = null;
let droneMarker = null;
let initialCenterSet = false; // Track if map centered on first fix
let flightPathCoordinates = []; // Array to store [lat, lon] points for the trail
let flightPathPolyline = null;  // Leaflet Polyline object

// --- State Variables ---
let isConnected = false;
let statusInterval = null; // To hold the interval timer for fetching status

// --- Map Initialization ---
function initMap() {
    // Check if map is already initialized
    if (map) return;

    // Initialize the map - Start zoomed out, will center on first drone location
    // Using coordinates near Volos, Greece as a fallback center if needed later
    map = L.map('map').setView([39.36, 22.94], 5); // Start relatively zoomed out

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    console.log("Map initialized");
}

// --- UI Update Functions ---
function updateStatus(message, isError = false) {
    statusDiv.innerHTML = `<strong>Status:</strong> ${message}`;
    statusDiv.style.color = isError ? 'red' : 'black';
}

function updateTelemetry(data) {
    // Update Text Telemetry
    if (data && data.is_connected) {
        telemetryDataPre.textContent = JSON.stringify({
            Mode: data.mode,
            Armed: data.armed,
            Latitude: data.lat,
            Longitude: data.lon,
            Altitude: data.alt,
            Airspeed: data.airspeed,
            Groundspeed: data.groundspeed,
            Heading: data.heading,
            Battery: data.battery_voltage ? `${data.battery_voltage}V` : 'N/A'
        }, null, 2); // Pretty print JSON
    } else {
        telemetryDataPre.textContent = 'Disconnected or no data available.';
    }

    if (map && data && data.is_connected) {
        const lat = data.lat;
        const lon = data.lon;

        if (typeof lat === 'number' && typeof lon === 'number') {
            const droneLatLng = [lat, lon];

            // Update Marker (existing logic)
            if (droneMarker) {
                droneMarker.setLatLng(droneLatLng);
            } else {
                droneMarker = L.marker(droneLatLng).addTo(map).bindPopup(`Drone Location`);
                console.log("Drone marker created at:", droneLatLng);
            }
            if (!initialCenterSet) {
                map.setView(droneLatLng, 17);
                initialCenterSet = true;
                console.log("Map centered on initial drone location.");
            }
             if (droneMarker) {
                 droneMarker.setPopupContent(`Drone Location<br>Lat: ${lat.toFixed(6)}, Lon: ${lon.toFixed(6)}<br>Alt: ${data.alt?.toFixed(2)}m | Mode: ${data.mode}`);
            }

            // ----> Start: Add point to flight path trail <----
            // Optional: Add a check to prevent adding points if the drone hasn't moved significantly
            const lastCoord = flightPathCoordinates.length > 0 ? flightPathCoordinates[flightPathCoordinates.length - 1] : null;
            // Simple check: Add if it's the first point or if lat/lon differs from the last point
            if (!lastCoord || lastCoord[0] !== lat || lastCoord[1] !== lon) {

                flightPathCoordinates.push(droneLatLng); // Add new coordinate to history

                if (flightPathPolyline) {
                    // If polyline exists, add the new point
                    flightPathPolyline.addLatLng(droneLatLng);
                } else {
                    // If polyline doesn't exist, create it (needs at least one point)
                    flightPathPolyline = L.polyline(flightPathCoordinates, {
                        color: 'blue',  // Trail color
                        weight: 3,       // Trail thickness
                        opacity: 0.7     // Trail opacity
                    }).addTo(map);
                    console.log("Flight path polyline created.");
                }
            }
            // ----> End: Add point to flight path trail <----

        } // End if valid lat/lon
    } // End if map and connected
}


function setUIConnected(connected) {
    isConnected = connected;
    connectButton.disabled = connected;
    disconnectButton.disabled = !connected;
    statusButton.disabled = !connected;
    // Enable/disable other command buttons here later

    if (connected) {
        // ----> Start: Clear previous flight path on new connection <----
        flightPathCoordinates = []; // Clear the history
        if (flightPathPolyline) {
            map.removeLayer(flightPathPolyline); // Remove old line from map
            flightPathPolyline = null;
        }
        // ----> End: Clear previous flight path <----

        updateStatus('Connected');
        fetchStatus(); // Fetch immediately
        if (!statusInterval) {
            statusInterval = setInterval(fetchStatus, 100); // Poll every 2 seconds
        }
    } else {
        updateStatus('Disconnected');
        updateTelemetry(null); // Clear telemetry text

        // Stop polling
        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }

        // Clean up map marker
        if (droneMarker) {
            map.removeLayer(droneMarker);
            droneMarker = null;
            console.log("Drone marker removed.");
        }
        initialCenterSet = false; // Reset centering flag

        // ----> Start: Clear flight path on disconnect <----
        flightPathCoordinates = []; // Clear the history
        if (flightPathPolyline) {
            map.removeLayer(flightPathPolyline); // Remove line from map
            flightPathPolyline = null;
        }
         // ----> End: Clear flight path <----

        // Optional: Reset map view to initial state on disconnect
        if (map) {
             map.setView([39.36, 22.94], 5); // Reset to initial wider view
        }
    }
}


// --- API Call Functions ---
async function connectToDrone() {
    updateStatus('Attempting connection...');
    try {
        const response = await fetch(`${backendUrl}/api/connect`, { method: 'POST' });
        const data = await response.json();

        if (response.ok && data.status === 'success') {
            setUIConnected(true);
        } else {
            updateStatus(`Connection Failed: ${data.message}`, true);
            setUIConnected(false);
        }
    } catch (error) {
        console.error('Connection Error:', error);
        updateStatus(`Connection Error: ${error.message}`, true);
        setUIConnected(false);
    }
}

async function disconnectFromDrone() {
    updateStatus('Disconnecting...');
    try {
        const response = await fetch(`${backendUrl}/api/disconnect`, { method: 'POST' });
        const data = await response.json();

        if (response.ok && data.status === 'success') {
            setUIConnected(false); // Let setUIConnected handle UI and map cleanup
        } else {
            updateStatus(`Disconnect Attempt Message: ${data.message}`, true);
             setUIConnected(false); // Assume disconnected anyway for UI consistency
        }
    } catch (error) {
        console.error('Disconnect Error:', error);
        updateStatus(`Disconnect Error: ${error.message}`, true);
        setUIConnected(false); // Assume disconnected on error
    }
}

async function fetchStatus() {
    if (!isConnected) return;

    try {
        const response = await fetch(`${backendUrl}/api/status`, { method: 'GET' });
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            // Call updateTelemetry which now handles both text and map
            updateTelemetry(result.data);

            if (!result.data.is_connected) {
                console.warn("Backend reports vehicle disconnected.");
                setUIConnected(false);
                updateStatus("Connection lost (reported by backend)", true);
            }
        } else {
            updateStatus(`Error fetching status: ${result.message}`, true);
        }
    } catch (error) {
        console.error('Status Fetch Error:', error);
        updateStatus(`Status Fetch Error: ${error.message}`, true);
        // If fetching fails, you might want to stop polling or indicate stale data
        // clearInterval(statusInterval); statusInterval = null; // Example: stop polling on error
    }
}

// --- Event Listeners ---
connectButton.addEventListener('click', connectToDrone);
disconnectButton.addEventListener('click', disconnectFromDrone);
statusButton.addEventListener('click', fetchStatus); // Manual status fetch

// --- Initialization ---
// Ensure map is initialized after the DOM is ready
document.addEventListener('DOMContentLoaded', (event) => {
    initMap(); // Initialize the map
    setUIConnected(false); // Set initial UI state after map div exists
});