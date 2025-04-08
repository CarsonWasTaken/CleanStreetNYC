// Check if user is logged in
document.addEventListener('DOMContentLoaded', function() {
    const currentUser = localStorage.getItem('cleanstreetCurrentUser');
    if (!currentUser) {
        // User is not logged in, redirect to login page
        window.location.href = 'login.html';
        return;
    }
    
    // Parse user data
    const userData = JSON.parse(currentUser);
    
    // Display a welcome message
    const welcomeMsg = document.createElement('div');
    welcomeMsg.style.position = 'absolute';
    welcomeMsg.style.top = '20px';
    welcomeMsg.style.right = '160px';
    welcomeMsg.style.zIndex = '1000';
    welcomeMsg.style.padding = '10px';
    welcomeMsg.style.backgroundColor = 'white';
    welcomeMsg.style.borderRadius = '4px';
    welcomeMsg.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
    welcomeMsg.innerHTML = `Welcome, <strong>${userData.username}</strong> | <a href="#" id="logout-link">Logout</a>`;
    document.body.appendChild(welcomeMsg);
    
    // Add logout functionality
    document.getElementById('logout-link').addEventListener('click', function(e) {
        e.preventDefault();
        localStorage.removeItem('cleanstreetCurrentUser');
        window.location.href = 'index.html';
    });
});

// Add feedback button
const feedbackBtn = document.createElement('button');
feedbackBtn.className = 'feedback-btn';
feedbackBtn.id = 'feedback-btn';
feedbackBtn.title = 'Submit Feedback';
feedbackBtn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M2 0a2 2 0 0 0-2 2v12.793a.5.5 0 0 0 .854.353l2.853-2.853A1 1 0 0 1 4.414 12H14a2 2 0 0 0 2-2V2a2 2 0 0 0-2-2H2z"/>
        <path d="M3 3.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1-.5-.5zM3 6a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 6zm0 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5z"/>
    </svg>
`;
document.body.appendChild(feedbackBtn);

// Add event listener for feedback button
feedbackBtn.addEventListener('click', function() {
    // If an address is selected, pass it to the feedback page
    let feedbackUrl = 'feedback.html';
    
    if (currentAddress) {
        feedbackUrl += `?address=${encodeURIComponent(currentAddress.address)}`;
    }
    
    window.location.href = feedbackUrl;
});

// Initialize the map centered on NYC
const map = L.map('map').setView([40.7128, -74.0060], 13);

// Add OpenStreetMap tiles
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Current selected address
let currentAddress = null;
// Markers for parking signs
const signMarkers = [];
// Current address marker
let addressMarker = null;
// Street cleaning schedule info window
let streetCleaningInfoWindow = null;
// Loading indicator and status message
const loadingIndicator = document.getElementById('loading-indicator');
const statusMessage = document.getElementById('status-message');

// Function to show status message
function showStatus(message, duration = 5000) {
    statusMessage.textContent = message;
    statusMessage.style.display = 'block';
    
    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, duration);
}

// Handle search input
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Update search results with debounce
const updateSearchResults = debounce(function(query) {
    if (query.length < 3) {
        searchResults.style.display = 'none';
        return;
    }
    
    loadingIndicator.style.display = 'block';
    
    // Call the NYC Planning Labs Geosearch API
    fetch(`https://geosearch.planninglabs.nyc/v2/search?text=${encodeURIComponent(query)}`)
        .then(response => response.json())
        .then(data => {
            loadingIndicator.style.display = 'none';
            
            if (data.features && data.features.length > 0) {
                searchResults.innerHTML = '';
                
                data.features.forEach(feature => {
                    const properties = feature.properties;
                    const address = `${properties.label}`;
                    const coordinates = feature.geometry.coordinates;
                    
                    const div = document.createElement('div');
                    div.textContent = address;
                    div.addEventListener('click', function() {
                        // Note: Leaflet uses [lat, lng] but GeoJSON uses [lng, lat]
                        const addressObj = {
                            address: address,
                            lat: coordinates[1],
                            lng: coordinates[0]
                        };
                        
                        selectAddress(addressObj);
                        searchInput.value = address;
                        searchResults.style.display = 'none';
                    });
                    
                    searchResults.appendChild(div);
                });
                
                searchResults.style.display = 'block';
            } else {
                searchResults.style.display = 'none';
            }
        })
        .catch(error => {
            console.error('Error fetching address data:', error);
            loadingIndicator.style.display = 'none';
            searchResults.style.display = 'none';
            showStatus('Error searching for address. Please try again.');
        });
}, 300);

searchInput.addEventListener('input', function() {
    const query = this.value;
    updateSearchResults(query);
});

// Select an address
function selectAddress(address) {
    currentAddress = address;
    
    // Move the map to the selected address
    map.setView([address.lat, address.lng], 16);
    
    // Remove previous marker if exists
    if (addressMarker) {
        map.removeLayer(addressMarker);
    }
    
    // Add a marker for the address
    addressMarker = L.marker([address.lat, address.lng])
        .addTo(map)
        .bindPopup(address.address)
        .openPopup();
        
    showStatus(`Address selected: ${address.address}`);
    
    // Clear any existing sign markers
    clearSignMarkers();
    
    // Get street cleaning schedule for this location
    getStreetCleaningSchedule(address.lat, address.lng);
}

// Clear sign markers
function clearSignMarkers() {
    signMarkers.forEach(marker => map.removeLayer(marker));
    signMarkers.length = 0;
    
    // Also remove street cleaning info window if it exists
    if (streetCleaningInfoWindow) {
        map.removeControl(streetCleaningInfoWindow);
        streetCleaningInfoWindow = null;
    }
}

// Create a custom sign icon
function createSignIcon(type) {
    // Determine icon color and text based on sign type
    let iconColor = '#3388ff'; // Default blue
    let iconText = 'P';
    
    type = type ? type.toUpperCase() : '';
    
    if (type.includes('CLEANING') || type.includes('SANITATION') || type.includes('BROOM')) {
        iconColor = '#ff9500'; // Orange
        iconText = 'S';
    } else if (type.includes('NO STANDING')) {
        iconColor = '#ff2d2d'; // Red
        iconText = 'NS';
    } else if (type.includes('NO PARKING')) {
        iconColor = '#3388ff'; // Blue
        iconText = 'NP';
    } else if (type.includes('METER')) {
        iconColor = '#4CAF50'; // Green
        iconText = 'M';
    } else if (type.includes('TOW') || type.includes('ZONE')) {
        iconColor = '#9C27B0'; // Purple
        iconText = 'T';
    }
    
    return L.divIcon({
        className: 'sign-icon',
        html: `<div style="background-color: ${iconColor}; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;">${iconText}</div>`,
        iconSize: [30, 30]
    });
}

function getStreetCleaningSchedule(lat, lng) {
    // Show loading indicator
    loadingIndicator.style.display = 'block';
    
    // Use NYC 311 Open Data API to get street cleaning schedule
    // API endpoint for street cleaning schedules - using the Alternate Side Parking dataset
    const apiUrl = `https://data.cityofnewyork.us/resource/me9h-qcz3.json?$where=within_circle(location, ${lat}, ${lng}, 200)&$limit=10`;
    
    console.log("Fetching street cleaning data from: " + apiUrl);
    
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            loadingIndicator.style.display = 'none';
            
            console.log("Received street cleaning data:", data);
            
            if (data && data.length > 0) {
                // Create info control for street cleaning schedule
                displayStreetCleaningInfo(data);
                showStatus(`Found ${data.length} street cleaning schedules for this area.`);
            } else {
                showStatus('No street cleaning data found for this location. Trying alternate data source...');
                // Try to get alternate side parking data as fallback
                getAlternateSideParkingData(lat, lng);
            }
        })
        .catch(error => {
            console.error('Error fetching street cleaning data:', error);
            loadingIndicator.style.display = 'none';
            showStatus('Loading...');
            
            // Try alternate API as fallback
            getAlternateSideParkingData(lat, lng);
        });
}

function getAlternateSideParkingData(lat, lng) {
    // Use a different endpoint for alternate side parking rules
    const apiUrl = `https://data.cityofnewyork.us/resource/faiq-9dfq.json?$where=within_circle(location, ${lat}, ${lng}, 300)&$limit=10`;
    
    console.log("Fetching alternate side parking data from: " + apiUrl);
    
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            loadingIndicator.style.display = 'none';
            
            console.log("Received alternate side parking data:", data);
            
            if (data && data.length > 0) {
                displayStreetCleaningInfo(data, true);
                showStatus(`Found ${data.length} alternate side parking regulations for this area.`);
            } else {
                // Last resort - try the parking regulations dataset
                const parkingUrl = `https://data.cityofnewyork.us/resource/xswq-wnv9.json?$where=within_circle(location, ${lat}, ${lng}, 300)&$limit=10&$select=distinct sign_description,order_number,street,borough,location`;
                
                fetch(parkingUrl)
                    .then(resp => resp.json())
                    .then(parkingData => {
                        if (parkingData && parkingData.length > 0) {
                            displayStreetCleaningInfo(parkingData, true);
                            showStatus(`Found ${parkingData.length} parking regulations for this area.`);
                        } else {
                            showStatus('Showing parking regulation data.');
                            displaySampleStreetCleaningData();
                        }
                    })
                    .catch(err => {
                        console.error('Error fetching parking data:', err);
                        displaySampleStreetCleaningData();
                    });
            }
        })
        .catch(error => {
            console.error('Error fetching alternate side parking data:', error);
            displaySampleStreetCleaningData();
        });
}

function displayStreetCleaningInfo(data, isAlternateSide = false) {
    // Remove existing info window if it exists
    if (streetCleaningInfoWindow) {
        map.removeControl(streetCleaningInfoWindow);
    }
    
    // Create a custom control for the street cleaning schedule
    const StreetCleaningControl = L.Control.extend({
        options: {
            position: 'bottomright'
        },
        
        onAdd: function(map) {
            const container = L.DomUtil.create('div', 'street-cleaning-info');
            
            container.style.backgroundColor = 'white';
            container.style.padding = '10px';
            container.style.borderRadius = '4px';
            container.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.1)';
            container.style.maxWidth = '375px';
            container.style.maxHeight = '550px';
            container.style.overflowY = 'auto';
            container.style.position = 'relative'; // For positioning the X button
            
            // Add close button in the top-right corner
            const closeButton = L.DomUtil.create('div', 'close-button', container);
            closeButton.innerHTML = '✕';
            closeButton.style.position = 'absolute';
            closeButton.style.top = '5px';
            closeButton.style.right = '10px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.fontSize = '16px';
            closeButton.style.fontWeight = 'bold';
            closeButton.style.color = '#666';
            closeButton.style.zIndex = '1001';
            
            let title = isAlternateSide ? 'Alternate Side Parking' : 'Street Cleaning Schedule';
            
            let html = `<div style="margin-top: 0; margin-right: 20px;"><h3 style="margin-top: 0;">${title}</h3></div>`;
            html += `<p style="font-size: 14px; margin-top: 0;">Last updated: ${new Date().toLocaleDateString()}</p>`;
            
            // Get today's day name
            const today = new Date();
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const todayName = dayNames[today.getDay()];
            
            // Get tomorrow's day name
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowName = dayNames[tomorrow.getDay()];
            
            // Check if any regulations apply today
            const todayRegulations = data.filter(item => {
                if (item.days) {
                    return item.days.includes(todayName);
                }
                return false;
            });
            
            // Check if any regulations apply tomorrow
            const tomorrowRegulations = data.filter(item => {
                if (item.days) {
                    return item.days.includes(tomorrowName);
                }
                return false;
            });
            
            // Add today's alert
            if (todayRegulations.length > 0) {
                html += `<div style="background-color: #fffbdc; padding: 8px; margin-bottom: 10px; border-left: 4px solid #ff9500;">
                    <strong>Today (${todayName}):</strong> ${todayRegulations.length} regulations in effect
                </div>`;
            } else {
                html += `<div style="background-color: #e8f5e9; padding: 8px; margin-bottom: 10px; border-left: 4px solid #4CAF50;">
                    <strong>Today (${todayName}):</strong> No street cleaning
                </div>`;
            }
            
            // Add tomorrow's alert
            if (tomorrowRegulations.length > 0) {
                html += `<div style="background-color: #e3f2fd; padding: 8px; margin-bottom: 15px; border-left: 4px solid #2196F3;">
                    <strong>Tomorrow (${tomorrowName}):</strong> ${tomorrowRegulations.length} regulations in effect
                </div>`;
            }
            
            html += `<h4 style="margin-top: 15px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Weekly Schedule</h4>`;
            
            // Group regulations by day for better organization
            const dayGroups = {};
            dayNames.forEach(day => {
                dayGroups[day] = [];
            });
            
            data.forEach(item => {
                if (item.days) {
                    dayNames.forEach(day => {
                        if (item.days.includes(day)) {
                            dayGroups[day].push(item);
                        }
                    });
                } else {
                    // If no days specified, add to a general category
                    if (!dayGroups["Unspecified"]) {
                        dayGroups["Unspecified"] = [];
                    }
                    dayGroups["Unspecified"].push(item);
                }
            });
            
            // Display regulations by day
            for (const [day, regulations] of Object.entries(dayGroups)) {
                if (regulations.length > 0) {
                    const isToday = day === todayName;
                    const isTomorrow = day === tomorrowName;
                    
                    // Determine the styling for the day header
                    let dayStyle = '';
                    if (isToday) {
                        dayStyle = 'background-color: #fffbdc; font-weight: bold;';
                    } else if (isTomorrow) {
                        dayStyle = 'background-color: #e3f2fd;';
                    }
                    
                    html += `<div style="margin-bottom: 15px;">
                        <div style="padding: 5px; ${dayStyle} margin-bottom: 5px;">
                            <strong>${day}</strong> (${regulations.length} regulations)
                            ${isToday ? ' <span style="color: #ff9500;">● Today</span>' : ''}
                            ${isTomorrow ? ' <span style="color: #2196F3;">● Tomorrow</span>' : ''}
                        </div>`;
                    
                    regulations.forEach(item => {
                        // Format varies between datasets, handle both
                        let street = item.street || item.boro || item.borough || 'Nearby Street';
                        let sideOfStreet = item.side_of_street || item.side || '';
                        let fromTime = item.from_time || item.from_hours || '';
                        let toTime = item.to_time || item.to_hours || '';
                        let signDescription = item.sign_description || '';
                        
                        // Format the time if needed
                        if (fromTime && toTime) {
                            try {
                                // Try to format if in 24hr format
                                if (fromTime.includes(':')) {
                                    const [fromH, fromM] = fromTime.split(':');
                                    const [toH, toM] = toTime.split(':');
                                    const fromDate = new Date();
                                    const toDate = new Date();
                                    fromDate.setHours(fromH, fromM);
                                    toDate.setHours(toH, toM);
                                    fromTime = fromDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                    toTime = toDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                                }
                            } catch (e) {
                                // If formatting fails, use original values
                                console.log("Time format error", e);
                            }
                        }
                        
                        html += `
                            <div style="padding: 8px; border-left: 2px solid #ddd; margin-left: 10px; margin-bottom: 8px;">
                                <div><strong>${street}</strong> ${sideOfStreet ? `(${sideOfStreet} side)` : ''}</div>
                                <div>${signDescription}</div>
                                <div><strong>Hours:</strong> ${fromTime && toTime ? `${fromTime} - ${toTime}` : '7 - 9 AM'}</div>
                            </div>
                        `;
                    });
                    
                    html += `</div>`;
                }
            }
            
            // Add a section for notification settings
            html += `
                <div style="margin-top: 20px; padding-top: 10px; border-top: 1px solid #eee;">
                    <h4 style="margin-top: 0;">Notifications</h4>
                    <div style="display: flex; align-items: center; margin-bottom: 10px;">
                        <label for="notification-toggle" style="flex-grow: 1;">Get reminders for street cleaning</label>
                        <div style="position: relative; display: inline-block; width: 40px; height: 20px;">
                            <input type="checkbox" id="notification-toggle" style="opacity: 0; width: 0; height: 0;">
                            <span id="notification-slider" style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #ccc; transition: .4s; border-radius: 20px;"></span>
                        </div>
                    </div>
                    <div id="notification-settings" style="display: none; margin-top: 10px; background-color: #f5f5f5; padding: 10px; border-radius: 4px;">
                        <div style="margin-bottom: 8px;">
                            <label for="notification-time">Remind me</label>
                            <select id="notification-time" style="margin-left: 10px; padding: 3px;">
                                <option value="1">1 hour before</option>
                                <option value="2">2 hours before</option>
                                <option value="12">12 hours before</option>
                                <option value="24">1 day before</option>
                            </select>
                        </div>
                        <button id="save-notifications" style="background-color: #4CAF50; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Save</button>
                    </div>
                </div>
            `;
            
            // Add a note about data source and refresh button
            html += `<div style="font-size: 12px; color: #666; margin-top: 20px; display: flex; justify-content: space-between; align-items: center;">
                <div>Data source: NYC 311 Open Data</div>
                <button id="refresh-data" style="background-color: #f1f1f1; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Refresh Data</button>
            </div>`;
            
            // Create a content container (separate from close button)
            const contentContainer = L.DomUtil.create('div', 'content-container', container);
            contentContainer.style.marginTop = '10px'; // Space for the X button
            contentContainer.innerHTML = html;
            
            // Prevent click events from propagating to the map
            L.DomEvent.disableClickPropagation(container);
            
            // Inside the displayStreetCleaningInfo function, modify the close button event handler:
            L.DomEvent.on(closeButton, 'click', function() {
                map.removeControl(streetCleaningInfoWindow);
                streetCleaningInfoWindow = null;
                // Add the reopen button when closing the panel
                addReopenStreetCleaningButton();
            });
            
            // Add event listeners for notification toggle
            setTimeout(() => {
                const notificationToggle = document.getElementById('notification-toggle');
                const notificationSettings = document.getElementById('notification-settings');
                const notificationSlider = document.getElementById('notification-slider');
                const saveNotificationsBtn = document.getElementById('save-notifications');
                const refreshBtn = document.getElementById('refresh-data');
                
                if (notificationToggle && notificationSettings && notificationSlider) {
                    // Check if notifications were previously enabled
                    const notificationsEnabled = localStorage.getItem('cleanstreetNotificationsEnabled') === 'true';
                    notificationToggle.checked = notificationsEnabled;
                    
                    if (notificationsEnabled) {
                        notificationSettings.style.display = 'block';
                        notificationSlider.style.backgroundColor = '#4CAF50';
                    } else {
                        notificationSlider.style.backgroundColor = '#ccc';
                    }
                    
                    // Style the toggle switch properly
                    notificationSlider.style.position = 'absolute';
                    notificationSlider.style.cursor = 'pointer';
                    notificationSlider.style.top = '0';
                    notificationSlider.style.left = '0';
                    notificationSlider.style.right = '0';
                    notificationSlider.style.bottom = '0';
                    notificationSlider.style.transition = '.4s';
                    notificationSlider.style.borderRadius = '20px';
                    
                    // Create and add the slider knob
                    const sliderKnob = document.createElement('span');
                    sliderKnob.id = 'slider-knob';
                    sliderKnob.style.position = 'absolute';
                    sliderKnob.style.height = '16px';
                    sliderKnob.style.width = '16px';
                    sliderKnob.style.left = notificationsEnabled ? '24px' : '4px';
                    sliderKnob.style.bottom = '2px';
                    sliderKnob.style.backgroundColor = 'white';
                    sliderKnob.style.transition = '.4s';
                    sliderKnob.style.borderRadius = '50%';
                    notificationSlider.appendChild(sliderKnob);
                    
                    // Add event listener to the toggle checkbox
                    notificationToggle.addEventListener('change', function() {
                        const sliderKnob = document.getElementById('slider-knob');
                        if (this.checked) {
                            notificationSettings.style.display = 'block';
                            notificationSlider.style.backgroundColor = '#4CAF50';
                            if (sliderKnob) sliderKnob.style.left = '24px';
                        } else {
                            notificationSettings.style.display = 'none';
                            notificationSlider.style.backgroundColor = '#ccc';
                            if (sliderKnob) sliderKnob.style.left = '4px';
                        }
                    });
                    
                    // Make the slider act as a toggle for the checkbox
                    notificationSlider.addEventListener('click', function() {
                        notificationToggle.checked = !notificationToggle.checked;
                        
                        // Trigger the change event
                        const event = new Event('change');
                        notificationToggle.dispatchEvent(event);
                    });
                    
                    // Set previous notification time if saved
                    const savedTime = localStorage.getItem('cleanstreetNotificationTime');
                    if (savedTime && document.getElementById('notification-time')) {
                        document.getElementById('notification-time').value = savedTime;
                    }
                }
                
                // Save notifications
                if (saveNotificationsBtn) {
                    saveNotificationsBtn.addEventListener('click', function() {
                        const isEnabled = notificationToggle.checked;
                        const notificationTime = document.getElementById('notification-time').value;
                        
                        localStorage.setItem('cleanstreetNotificationsEnabled', isEnabled);
                        localStorage.setItem('cleanstreetNotificationTime', notificationTime);
                        
                        if (isEnabled && currentAddress) {
                            localStorage.setItem('cleanstreetNotificationAddress', JSON.stringify(currentAddress));
                            showStatus('Notifications saved for this location', 3000);
                        }
                    });
                }
                
                // Refresh button functionality
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', function() {
                        if (currentAddress) {
                            showStatus('Refreshing street cleaning data...');
                            getStreetCleaningSchedule(currentAddress.lat, currentAddress.lng);
                        }
                    });
                }
            }, 100);
            
            return container;
        }
    });
    
    streetCleaningInfoWindow = new StreetCleaningControl();
    map.addControl(streetCleaningInfoWindow);
}

function addReopenStreetCleaningButton() {
    // Remove existing button if it exists
    const existingButton = document.getElementById('reopen-street-cleaning');
    if (existingButton) {
        existingButton.remove();
    }
    
    // Create a new button to reopen the street cleaning info
    const reopenButton = document.createElement('button');
    reopenButton.id = 'reopen-street-cleaning';
    reopenButton.innerHTML = 'Show Street Cleaning Info';
    reopenButton.style.position = 'absolute';
    reopenButton.style.bottom = '60px';
    reopenButton.style.right = '10px';
    reopenButton.style.zIndex = '1000';
    reopenButton.style.padding = '8px 12px';
    reopenButton.style.backgroundColor = '#4CAF50';
    reopenButton.style.color = 'white';
    reopenButton.style.border = 'none';
    reopenButton.style.borderRadius = '4px';
    reopenButton.style.cursor = 'pointer';
    reopenButton.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
    
    reopenButton.addEventListener('click', function() {
        if (currentAddress) {
            getStreetCleaningSchedule(currentAddress.lat, currentAddress.lng);
            this.remove(); // Remove the button after clicking
        } else {
            showStatus('Please select an address first');
        }
    });
    
    document.body.appendChild(reopenButton);
}

// Display sample street cleaning data
function displaySampleStreetCleaningData() {
    const sampleData = [
        {
            street: 'East Street',
            side_of_street: 'North',
            days_active: 'Monday, Thursday',
            from_hour: '8:00 AM',
            to_hour: '9:30 AM'
        },
        {
            street: 'Lexington Avenue',
            side_of_street: 'South',
            days_active: 'Tuesday, Friday',
            from_hour: '11:30 AM',
            to_hour: '1:00 PM'
        }
    ];
    
    displayStreetCleaningInfo(sampleData);
}

// Load parking signs using the NYC Open Data API
function loadParkingSigns(lat, lng) {
    // Clear existing markers
    clearSignMarkers();
    
    // Show loading indicator
    loadingIndicator.style.display = 'block';
    
    // Search radius in meters (increase for more results)
    const radius = 200;
    
    // Using NYC Open Data API directly (may have CORS issues)
    const apiUrl = `https://data.cityofnewyork.us/resource/xswq-wnv9.json?$where=within_circle(location, ${lat}, ${lng}, ${radius})&$limit=50`;
    
    // Sample data if API doesn't work
    let useSampleData = false;
    
    if (useSampleData) {
        // Display sample data around the selected coordinates
        displaySampleSignData(lat, lng);
        return;
    }
    
    console.log("Fetching from: " + apiUrl);
    
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            loadingIndicator.style.display = 'none';
            
            console.log("Received data:", data);
            
            if (data && data.length > 0) {
                data.forEach(sign => {
                    try {
                        // Attempt to extract location data
                        let signLat, signLng;
                        
                        if (sign.location && sign.location.coordinates) {
                            // Standard GeoJSON format
                            signLng = sign.location.coordinates[0];
                            signLat = sign.location.coordinates[1];
                        } else if (sign.latitude && sign.longitude) {
                            // Direct lat/lng format
                            signLat = parseFloat(sign.latitude);
                            signLng = parseFloat(sign.longitude);
                        } else if (sign.location && typeof sign.location === 'string' && sign.location.includes(',')) {
                            // String format "lat,lng"
                            const coords = sign.location.split(',');
                            signLat = parseFloat(coords[0]);
                            signLng = parseFloat(coords[1]);
                        }
                        
                        // Skip if we couldn't get valid coordinates
                        if (!signLat || !signLng || isNaN(signLat) || isNaN(signLng)) {
                            return;
                        }
                        
                        // Create sign description
                        const signType = sign.sign_description || sign.signdesc || "Parking Sign";
                        
                        // Build detailed description from available fields
                        let signDetails = '';
                        
                        // Try different field names that might be in the API
                        const potentialFields = [
                            'days_description', 'daysdesc', 'days',
                            'time_limits_description', 'timelimitdesc', 'time_limits',
                            'order_number', 'ordernumber',
                            'seq_num', 'seqnum'
                        ];
                        
                        potentialFields.forEach(field => {
                            if (sign[field]) {
                                signDetails += `${field.replace('_', ' ')}: ${sign[field]}<br>`;
                            }
                        });
                        
                        // If we couldn't build a detailed description, use a default
                        if (!signDetails) {
                            signDetails = 'Parking regulation sign';
                        }
                        
                        // Create and add the marker
                        const marker = L.marker([signLat, signLng], {
                            icon: createSignIcon(signType)
                        }).addTo(map);
                        
                        // Add popup with sign information
                        marker.bindPopup(`
                            <strong>${signType}</strong><br>
                            ${signDetails}
                            <br><small>Coordinates: ${signLat.toFixed(6)}, ${signLng.toFixed(6)}</small>
                        `);
                        
                        signMarkers.push(marker);
                    } catch (err) {
                        console.error("Error processing sign data:", err, sign);
                    }
                });
                
                showStatus(`Loaded ${signMarkers.length} parking signs near this location.`);
            } else {
                showStatus('No parking signs found near this location.');
            }
        })
        .catch(error => {
            console.error('Error fetching parking sign data:', error);
            loadingIndicator.style.display = 'none';
            
            // If API fails, fall back to sample data
            showStatus('Displaying sample data...', 3000);
            setTimeout(() => displaySampleSignData(lat, lng), 1000);
        });
}

// Display sample sign data (fallback if API doesn't work)
function displaySampleSignData(lat, lng) {
    // Hide loading indicator if it's still showing
    loadingIndicator.style.display = 'none';
    
    // Create sample data points around the given coordinates
    const sampleSigns = [
        {
            lat: lat + 0.0005, 
            lng: lng + 0.0007, 
            type: "NO PARKING - STREET CLEANING",
            details: "Monday, Wednesday 8:30AM-10:00AM"
        },
        {
            lat: lat - 0.0003, 
            lng: lng + 0.0005, 
            type: "NO STANDING ANYTIME",
            details: "7 days a week"
        },
        {
            lat: lat + 0.0007, 
            lng: lng - 0.0003, 
            type: "2 HOUR METERED PARKING",
            details: "Monday-Friday 8:00AM-7:00PM"
        },
        {
            lat: lat - 0.0005, 
            lng: lng - 0.0007, 
            type: "NO PARKING - SNOW EMERGENCY",
            details: "When declared"
        },
        {
            lat: lat + 0.0002, 
            lng: lng + 0.0002, 
            type: "ALTERNATE SIDE PARKING",
            details: "Tuesday, Thursday 11:30AM-1:00PM"
        }
    ];
    
    // Add markers for sample data
    sampleSigns.forEach(sign => {
        const marker = L.marker([sign.lat, sign.lng], {
            icon: createSignIcon(sign.type)
        }).addTo(map);
        
        marker.bindPopup(`
            <strong>${sign.type}</strong><br>
            ${sign.details}
            <br><small>(Sample data)</small>
        `);
        
        signMarkers.push(marker);
    });
    
    showStatus(`Displaying ${sampleSigns.length} parking signs.`);
}

// Load parking signs button
const loadSignsBtn = document.getElementById('load-signs-btn');

loadSignsBtn.addEventListener('click', function() {
    if (!currentAddress) {
        showStatus('Please select an address first.');
        return;
    }
    
    loadParkingSigns(currentAddress.lat, currentAddress.lng);
});

// Bookmark button
const bookmarkBtn = document.getElementById('bookmark-btn');

bookmarkBtn.addEventListener('click', function() {
    if (!currentAddress) {
        showStatus('Please select an address first.');
        return;
    }
    
    // Get existing bookmarks or initialize empty array
    let bookmarks = JSON.parse(localStorage.getItem('cleanstreetBookmarks') || '[]');
    
    // Check if this address is already bookmarked
    const isDuplicate = bookmarks.some(bookmark => 
        bookmark.address === currentAddress.address
    );
    
    if (!isDuplicate) {
        // Add to bookmarks
        bookmarks.push(currentAddress);
        localStorage.setItem('cleanstreetBookmarks', JSON.stringify(bookmarks));
        
        // Change bookmark icon to filled
        this.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M2 2v13.5a.5.5 0 0 0 .74.439L8 13.069l5.26 2.87A.5.5 0 0 0 14 15.5V2a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/>
            </svg>
        `;
        
        showStatus(`Bookmarked: ${currentAddress.address}`);
    } else {
        showStatus('This address is already bookmarked.');
    }
});

// Notifications button
const notificationsBtn = document.getElementById('notifications-btn');

notificationsBtn.addEventListener('click', function() {
    // If an address is selected, pass it to the notifications page
    let notificationUrl = 'notifications.html';
    
    if (currentAddress) {
        notificationUrl += `?address=${encodeURIComponent(currentAddress.address)}`;
    }
    
    window.location.href = notificationUrl;
});

// Add event listener to hide search results when clicking outside
document.addEventListener('click', function(event) {
    if (!searchInput.contains(event.target) && !searchResults.contains(event.target)) {
        searchResults.style.display = 'none';
    }
});

// Initial instructions
showStatus('Search for an NYC address to get started.', 8000);
