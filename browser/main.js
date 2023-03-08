"use strict";
const GoogleMapsApiKey = ''; // you need to use a GoogleMaps API key here to display the map
const controlsDiv = document.getElementById('controls');
const openExternalA = document.getElementById('open-external');
const googleMapsLogo = () => document.querySelector('#map > div > div > div:nth-child(15) > div > a');
const cityInput = () => document.getElementById('city');
const spanningTwoInput = document.getElementById('spanning-two');
const surfaceInput = () => document.getElementById('surface');
const energyClassInput = () => document.getElementById('energy-class');
const emissionsClassInput = () => document.getElementById('emissions-class');
const energyInput = () => document.getElementById('energy');
const emissionsInput = () => document.getElementById('emissions');
// const dpeDateInput = () => document.getElementById('dpe-date')! as HTMLInputElement
const resultsDiv = document.getElementById('results');
const resultsCountSpan = document.getElementById('count');
const resultsPreviousButton = document.getElementById('previous');
const resultsNextButton = document.getElementById('next');
let currentMatchingParcel = 0;
let cycleNext;
let cyclePrevious;
function loadScriptAsPromise(url) {
    return new Promise((ok, ko) => {
        const script = document.createElement('script');
        document.body.appendChild(script);
        script.onload = ok;
        script.onerror = ko;
        script.async = true;
        script.src = url;
    });
}
function loadAssets() {
    const cities = ['montauban', 'albi'];
    const cities$ = Promise.all(cities.map(city => Promise.all([
        Promise.resolve(city),
        fetch(`data/${city}/parcelles-map.json`).then(x => x.json()),
        fetch(`data/${city}/contenances-map.json`).then(x => x.json()),
    ]).then(([city, parcellesMap, contenancesMap]) => ({ city, parcellesMap, contenancesMap }))));
    const googleMaps$ = loadScriptAsPromise(`https://maps.googleapis.com/maps/api/js?key=${GoogleMapsApiKey}&v=weekly`);
    const dpes$ = fetch('data/dpe-v2-logements-existants.geojson').then(x => x.json()).then(x => x.features);
    return Promise.all([cities$, dpes$, googleMaps$]);
}
async function loadMap() {
    const geoloc = await new google.maps.Geocoder().geocode({ 'address': 'Gaillac' });
    return new google.maps.Map(document.getElementById('map'), {
        center: geoloc.results[0].geometry.location,
        zoom: 16,
        tilt: 0,
        mapTypeId: 'hybrid',
        fullscreenControl: false,
        gestureHandling: 'greedy',
    });
}
function findMatchingParcellesInCity(dataMaps, city, surface, spanningTwo) {
    const dataMap = dataMaps.find(d => d.city === city);
    const matches = dataMap.contenancesMap[surface].filter(x => x.length === (spanningTwo ? 2 : 1));
    return matches.map(x => x.map(y => dataMap.parcellesMap[y]));
}
function findMatchingParcelles(dataMaps, city, surface, spanningTwo) {
    return findMatchingParcellesInCity(dataMaps, city, surface, spanningTwo);
}
function drawMatchingParcelles(map, parcelles) {
    map.data.setStyle(() => {
        return {
            fillOpacity: 0.3,
            fillColor: 'white',
            strokeColor: 'red',
            strokeWeight: 3,
        };
    });
    map.data.addGeoJson({ type: 'FeatureCollection', features: parcelles.flat() });
}
function drawDpeMarkers(map, dpe) {
    let matchingDpe = dpe;
    if (energyClassInput().value) {
        matchingDpe = matchingDpe.filter(x => x.properties.Etiquette_DPE === energyClassInput().value);
    }
    if (emissionsClassInput().value) {
        matchingDpe = matchingDpe.filter(x => x.properties.Etiquette_GES === emissionsClassInput().value);
    }
    // if (dpeDateInput().value) {
    //   matchingDpe = matchingDpe.filter(x => x.properties.Date_établissement_DPE === dpeDateInput().value)
    // }
    if (energyInput().value) {
        matchingDpe = matchingDpe.filter(x => x.properties['Conso_5_usages_par_m²_é_primaire'] === energyInput().valueAsNumber);
    }
    if (emissionsInput().value) {
        matchingDpe = matchingDpe.filter(x => x.properties['Emission_GES_5_usages_par_m²'] === emissionsInput().valueAsNumber);
    }
    map.data.addGeoJson({ type: 'FeatureCollection', features: matchingDpe });
}
function cycleMatchingParcel(step, matchingParcelles, map) {
    currentMatchingParcel = (currentMatchingParcel + step) % matchingParcelles.length;
    resultsCountSpan.innerHTML = `${currentMatchingParcel + 1}/${matchingParcelles.length}`;
    panToLatLng(matchingParcelles, map);
}
function panToLatLng(matchingParcelles, map) {
    const points = matchingParcelles[currentMatchingParcel].flatMap(x => x.geometry.coordinates[0]);
    if (points) {
        const bounds = new google.maps.LatLngBounds();
        points.forEach((point) => bounds.extend(pointToLatLngLiteral(point)));
        map.panTo(bounds.getCenter());
    }
}
function fitBounds(matchingParcelles, map) {
    const bounds = new google.maps.LatLngBounds();
    matchingParcelles.forEach((matchingParcelle) => {
        matchingParcelle.forEach(x => {
            x.geometry.coordinates[0].forEach(point => {
                bounds.extend(pointToLatLngLiteral(point));
            });
        });
    });
    map.fitBounds(bounds);
}
function pointToLatLngLiteral(point) {
    return { lat: point[1], lng: point[0] };
}
function setupControls(dataMaps, dpe, map) {
    map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(controlsDiv);
    controlsDiv.style.display = 'flex';
    setTimeout(() => {
        surfaceInput().focus();
        surfaceInput().select();
    }, 400);
    surfaceInput().form.addEventListener('submit', (e) => {
        e.preventDefault();
        map.data.forEach(feature => map.data.remove(feature));
        if (surfaceInput().value) {
            const matchingParcelles = findMatchingParcelles(dataMaps, cityInput().value, surfaceInput().valueAsNumber, spanningTwoInput.checked);
            if (matchingParcelles.length === 0) {
                resultsDiv.style.display = 'none';
            }
            else {
                currentMatchingParcel = 0;
                resultsDiv.style.display = 'flex';
                resultsCountSpan.innerHTML = `${currentMatchingParcel + 1}/${matchingParcelles.length}`;
                resultsNextButton.removeEventListener('click', cycleNext);
                resultsPreviousButton.removeEventListener('click', cyclePrevious);
                cycleNext = () => cycleMatchingParcel(1, matchingParcelles, map);
                cyclePrevious = () => cycleMatchingParcel(-1 + matchingParcelles.length, matchingParcelles, map);
                resultsNextButton.addEventListener('click', cycleNext);
                resultsPreviousButton.addEventListener('click', cyclePrevious);
                fitBounds(matchingParcelles, map);
            }
            drawMatchingParcelles(map, matchingParcelles);
        }
        else {
            resultsDiv.style.display = 'none';
        }
        if (energyClassInput().value || energyInput().value || emissionsClassInput().value || emissionsInput().value) {
            drawDpeMarkers(map, dpe);
        }
    }, true);
    const infoWindow = new google.maps.InfoWindow({ pixelOffset: new google.maps.Size(0, -40) });
    map.data.addListener('click', (e) => {
        infoWindow.close();
        if (e.feature.getGeometry()?.getType() === 'Point') {
            let properties = '<ul>';
            e.feature.forEachProperty((v, k) => properties += `<li><strong>${k}</strong> : ${v}</li>`);
            properties += '</ul>';
            let point;
            e.feature.getGeometry().forEachLatLng(x => point = x);
            infoWindow.setContent(properties);
            infoWindow.setPosition(point);
            infoWindow.open(map);
        }
        else {
            const bounds = new google.maps.LatLngBounds();
            e.feature.getGeometry()?.forEachLatLng(ll => bounds.extend(ll));
            map.fitBounds(bounds);
        }
    });
    map.controls[google.maps.ControlPosition.TOP_RIGHT].push(openExternalA);
    openExternalA.style.display = 'flex';
    openExternalA.addEventListener('click', () => openExternalA.href = googleMapsLogo().href);
}
function listenToExtension(map) {
    chrome.runtime.onMessage.addListener(async (message) => {
        const { city, surface, energyClass, emissionsClass /*, dpeDate*/, energy, emissions } = JSON.parse(message);
        if (city) {
            cityInput().value = city;
            const geoloc = await new google.maps.Geocoder().geocode({ 'address': city });
            map.setCenter(geoloc.results[0].geometry.location);
        }
        if (surface) {
            surfaceInput().value = surface;
        }
        if (energyClass) {
            energyClassInput().value = energyClass;
        }
        if (emissionsClass) {
            emissionsClassInput().value = emissionsClass;
        }
        // if (dpeDate) {
        //   dpeDateInput().value = dpeDate
        // }
        if (energy) {
            energyInput().value = energy;
        }
        if (emissions) {
            emissionsInput().value = emissions;
        }
    });
    chrome.tabs.getCurrent(tab => {
        if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, 'ready');
        }
    });
}
(async () => {
    const [dataMaps, dpe] = await loadAssets();
    const map = await loadMap();
    setupControls(dataMaps, dpe, map);
    listenToExtension(map);
})();
