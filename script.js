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
        window.location.href = 'login.html';
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
}

// Clear sign markers
function clearSignMarkers() {
    signMarkers.forEach(marker => map.removeLayer(marker));
    signMarkers.length = 0;
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

// Load parking signs using the NYC Open Data API
function loadParkingSigns(lat, lng) {
    // Clear existing markers
    clearSignMarkers();
    
    // Show loading indicator
    loadingIndicator.style.display = 'block';
    
    // Search radius in meters (increase for more results)
    const radius = 200;
    
    // Option 1: Using NYC Open Data API directly (may have CORS issues)
    const apiUrl = `https://data.cityofnewyork.us/resource/xswq-wnv9.json?$where=within_circle(location, ${lat}, ${lng}, ${radius})&$limit=50`;
    
    // Option 2: For testing/demo, use sample data if API doesn't work
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
                        // Attempt to extract location data - this can vary based on API response format
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
    
    showStatus(`Displaying ${sampleSigns.length} sample parking signs (API data unavailable).`);
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
