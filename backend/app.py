import time
import collections
import collections.abc
collections.MutableMapping = collections.abc.MutableMapping # Fix for newer Python versions with dronekit

from flask import Flask, jsonify, request
from flask_cors import CORS # Import CORS
from dronekit import connect, VehicleMode, APIException
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO)

# --- Global Variables ---
# Using globals is simple for starting, but consider better state management for complex apps
vehicle = None
connection_string = 'udp:127.0.0.1:14550' # Default SITL address

# --- Flask App Setup ---
app = Flask(__name__)
CORS(app) # Enable CORS for all routes, allowing requests from your frontend

# --- API Endpoints ---
@app.route('/')
def index():
    """Basic route to check if backend is running."""
    return jsonify({"message": "GCS Backend Running!"})

@app.route('/api/connect', methods=['POST'])
def connect_drone():
    """Attempts to connect to the drone via DroneKit."""
    global vehicle
    global connection_string # Allow modification if needed via request later

    if vehicle:
         logging.info("Already connected.")
         return jsonify({"status": "success", "message": "Already connected"})

    # Optionally get connection string from request (e.g., for different simulations/drones)
    # data = request.json
    # conn_str = data.get('connection_string', default_connection_string)

    logging.info(f"Attempting connection to {connection_string}...")
    try:
        # Attempt connection
        # IMPORTANT: connect() can block, consider running in a thread/async for responsive UI
        vehicle = connect(connection_string, wait_ready=True, timeout=60) # Increased timeout

        if vehicle:
            logging.info("Connection Successful!")
            logging.info(f"  Mode: {vehicle.mode.name}")
            logging.info(f"  Armed: {vehicle.armed}")
            logging.info(f"  Altitude: {vehicle.location.global_relative_frame.alt if vehicle.location.global_relative_frame else 'N/A'}")
            return jsonify({"status": "success", "message": "Connected to Vehicle"})
        else:
            logging.error("Connection attempt returned None.")
            vehicle = None # Ensure vehicle is None if connection failed
            return jsonify({"status": "error", "message": "Failed to connect (vehicle object is None)"}), 500

    except APIException as e:
        logging.error(f"DroneKit API Exception: {e}")
        vehicle = None
        return jsonify({"status": "error", "message": f"DroneKit API Error: {e}"}), 500
    except TimeoutError as e:
         logging.error(f"Connection timed out: {e}")
         vehicle = None
         return jsonify({"status": "error", "message": f"Connection timed out after 60 seconds."}), 500
    except Exception as e:
        logging.error(f"An unexpected error occurred during connection: {e}")
        vehicle = None
        return jsonify({"status": "error", "message": f"Unexpected Error: {e}"}), 500

@app.route('/api/disconnect', methods=['POST'])
def disconnect_drone():
    """Disconnects the DroneKit vehicle object."""
    global vehicle
    if vehicle:
        logging.info("Closing vehicle connection...")
        vehicle.close()
        vehicle = None
        logging.info("Vehicle connection closed.")
        return jsonify({"status": "success", "message": "Disconnected"})
    else:
        logging.info("No active vehicle connection to disconnect.")
        return jsonify({"status": "success", "message": "Already disconnected"})

# --- Add more command endpoints later (e.g., /api/arm, /api/takeoff) ---
# Example placeholder:
@app.route('/api/status')
def get_status():
    """Gets basic vehicle status if connected."""
    if vehicle:
         try:
             status = {
                 "is_connected": True,
                 "mode": vehicle.mode.name,
                 "armed": vehicle.armed,
                 "lat": vehicle.location.global_relative_frame.lat if vehicle.location.global_relative_frame else None,
                 "lon": vehicle.location.global_relative_frame.lon if vehicle.location.global_relative_frame else None,
                 "alt": vehicle.location.global_relative_frame.alt if vehicle.location.global_relative_frame else None,
                 "airspeed": vehicle.airspeed,
                 "groundspeed": vehicle.groundspeed,
                 "heading": vehicle.heading,
                 "battery_voltage": vehicle.battery.voltage if vehicle.battery else None,
             }
             return jsonify({"status": "success", "data": status})
         except Exception as e:
             logging.error(f"Error fetching status: {e}")
             return jsonify({"status": "error", "message": f"Error fetching status: {e}"}), 500
    else:
        return jsonify({"status": "success", "data": {"is_connected": False}})


# --- Main Execution ---
if __name__ == '__main__':
    # Run on 0.0.0.0 to be accessible from other devices on the network if needed,
    # otherwise use 127.0.0.1 for local access only.
    # Debug=True auto-reloads on code changes, but disable for production.
    app.run(host='127.0.0.1', port=5000, debug=True)