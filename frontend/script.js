const connectButton = document.getElementById('connectButton');
const disconnectButton = document.getElementById('disconnectButton');
const statusButton = document.getElementById('statusButton');
const statusDiv = document.getElementById('status');
const telemetryDataPre = document.getElementById('telemetryData');

const backendUrl = 'http://127.0.0.1:5000'; // Your Flask backend URL

let isConnected = false;
let statusInterval = null; // To hold the interval timer for fetching status

// --- UI Update Functions ---
function updateStatus(message, isError = false) {
    statusDiv.innerHTML = `<strong>Status:</strong> ${message}`;
    statusDiv.style.color = isError ? 'red' : 'black';
}

function updateTelemetry(data) {
    if (data && data.is_connected) {
        // Format the telemetry data nicely
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
}

function setUIConnected(connected) {
    isConnected = connected;
    connectButton.disabled = connected;
    disconnectButton.disabled = !connected;
    statusButton.disabled = !connected;
    // Enable/disable other command buttons here later
    // armButton.disabled = !connected;
    // takeoffButton.disabled = !connected;

    if (connected) {
        updateStatus('Connected');
        // Start polling for status updates
        fetchStatus(); // Fetch immediately
        if (!statusInterval) {
             // Update status every 2 seconds (adjust interval as needed)
            statusInterval = setInterval(fetchStatus, 2000);
        }
    } else {
        updateStatus('Disconnected');
        updateTelemetry(null); // Clear telemetry
        // Stop polling for status updates
        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
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
            setUIConnected(false);
        } else {
            // Even if disconnect fails, update UI assuming disconnected
            updateStatus(`Disconnect Attempt Message: ${data.message}`, true);
             setUIConnected(false);
        }
    } catch (error) {
        console.error('Disconnect Error:', error);
        updateStatus(`Disconnect Error: ${error.message}`, true);
        setUIConnected(false); // Assume disconnected on error
    }
}

 async function fetchStatus() {
    if (!isConnected) return; // Don't fetch if not connected

    try {
        const response = await fetch(`${backendUrl}/api/status`, { method: 'GET' });
        const result = await response.json();

        if (response.ok && result.status === 'success') {
            updateTelemetry(result.data);
            if (!result.data.is_connected) {
                // Backend reported disconnected (e.g. connection lost)
                console.warn("Backend reports vehicle disconnected.");
                setUIConnected(false);
                updateStatus("Connection lost (reported by backend)", true);
            }
        } else {
            updateStatus(`Error fetching status: ${result.message}`, true);
            // Optional: Decide if you want to consider this a disconnect
            // setUIConnected(false);
        }
    } catch (error) {
        console.error('Status Fetch Error:', error);
        updateStatus(`Status Fetch Error: ${error.message}`, true);
        // If fetching status fails repeatedly, maybe assume disconnected
        // setUIConnected(false);
    }
}

// --- Event Listeners ---
connectButton.addEventListener('click', connectToDrone);
disconnectButton.addEventListener('click', disconnectFromDrone);
statusButton.addEventListener('click', fetchStatus); // Manual status fetch

// --- Initial State ---
setUIConnected(false); // Set initial UI state