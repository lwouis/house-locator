const GoogleMapsApiKey = '' // you need to use a GoogleMaps API key here to display the map

const controlsDiv = document.getElementById('controls')! as HTMLDivElement
const openExternalA = document.getElementById('open-external')! as HTMLAnchorElement
const googleMapsLogo = () => document.querySelector('#map > div > div > div:nth-child(15) > div > a')! as HTMLAnchorElement
const cityInput = () => document.getElementById('city')! as HTMLSelectElement
const spanningTwoInput = document.getElementById('spanning-two')! as HTMLInputElement
const surfaceInput = () => document.getElementById('surface')! as HTMLInputElement
const energyClassInput = () => document.getElementById('energy-class')! as HTMLSelectElement
const emissionsClassInput = () => document.getElementById('emissions-class')! as HTMLSelectElement
const energyInput = () => document.getElementById('energy')! as HTMLInputElement
const emissionsInput = () => document.getElementById('emissions')! as HTMLInputElement
// const dpeDateInput = () => document.getElementById('dpe-date')! as HTMLInputElement
const resultsDiv = document.getElementById('results')! as HTMLDivElement
const resultsCountSpan = document.getElementById('count')! as HTMLSpanElement
const resultsPreviousButton = document.getElementById('previous')! as HTMLButtonElement
const resultsNextButton = document.getElementById('next')! as HTMLButtonElement
let currentMatchingParcel = 0
let cycleNext: Listener
let cyclePrevious: Listener

function loadScriptAsPromise(url: string): Promise<unknown> {
  return new Promise((ok, ko) => {
    const script = document.createElement('script');
    document.body.appendChild(script);
    script.onload = ok;
    script.onerror = ko;
    script.async = true;
    script.src = url;
  });
}

function loadAssets(): Promise<[DataMap[], Dpe[], unknown]> {
  const cities = ['montauban', 'albi']
  const cities$: Promise<DataMap[]> = Promise.all(cities.map(city => Promise.all([
    Promise.resolve(city),
    fetch(`data/${city}/parcelles-map.json`).then(x => x.json()),
    fetch(`data/${city}/contenances-map.json`).then(x => x.json()),
  ]).then(([city, parcellesMap, contenancesMap]) => ({city, parcellesMap, contenancesMap}))))
  const googleMaps$ = loadScriptAsPromise(`https://maps.googleapis.com/maps/api/js?key=${GoogleMapsApiKey}&v=weekly`);
  const dpes$ = fetch('data/dpe-v2-logements-existants.geojson').then(x => x.json()).then(x => x.features)
  return Promise.all([cities$, dpes$, googleMaps$])
}

async function loadMap(): Promise<google.maps.Map> {
  const geoloc = await new google.maps.Geocoder().geocode({'address': 'Gaillac'})
  return new google.maps.Map(document.getElementById('map') as HTMLElement, {
    center: geoloc.results![0].geometry.location,
    zoom: 16,
    tilt: 0,
    mapTypeId: 'hybrid',
    fullscreenControl: false,
    gestureHandling: 'greedy',
  });
}

function findMatchingParcellesInCity(dataMaps: DataMap[], city: string, surface: number, spanningTwo: boolean) {
  const dataMap = dataMaps.find(d => d.city === city)!
  const matches = dataMap.contenancesMap[surface].filter(x => x.length === (spanningTwo ? 2 : 1))
  return matches.map(x => x.map(y => dataMap.parcellesMap[y]))
}

function findMatchingParcelles(dataMaps: DataMap[], city: string, surface: Surface, spanningTwo: boolean): Parcelle[][] {
  return findMatchingParcellesInCity(dataMaps, city, surface, spanningTwo)
}

function drawMatchingParcelles(map: google.maps.Map, parcelles: Parcelle[][]) {
  map.data.setStyle(() => {
    return {
      fillOpacity: 0.3,
      fillColor: 'white',
      strokeColor: 'red',
      strokeWeight: 3,
    }
  });
  map.data.addGeoJson({type: 'FeatureCollection', features: parcelles.flat()});
}

function drawDpeMarkers(map: google.maps.Map, dpe: Dpe[]) {
  let matchingDpe = dpe
  if (energyClassInput().value) {
    matchingDpe = matchingDpe.filter(x => x.properties.Etiquette_DPE === energyClassInput().value)
  }
  if (emissionsClassInput().value) {
    matchingDpe = matchingDpe.filter(x => x.properties.Etiquette_GES === emissionsClassInput().value)
  }
  // if (dpeDateInput().value) {
  //   matchingDpe = matchingDpe.filter(x => x.properties.Date_établissement_DPE === dpeDateInput().value)
  // }
  if (energyInput().value) {
    matchingDpe = matchingDpe.filter(x => x.properties['Conso_5_usages_par_m²_é_primaire'] === energyInput().valueAsNumber)
  }
  if (emissionsInput().value) {
    matchingDpe = matchingDpe.filter(x => x.properties['Emission_GES_5_usages_par_m²'] === emissionsInput().valueAsNumber)
  }
  map.data.addGeoJson({type: 'FeatureCollection', features: matchingDpe});
}

function cycleMatchingParcel(step: number, matchingParcelles: Parcelle[][], map: google.maps.Map) {
  currentMatchingParcel = (currentMatchingParcel + step) % matchingParcelles.length
  resultsCountSpan.innerHTML = `${currentMatchingParcel + 1}/${matchingParcelles.length}`
  panToLatLng(matchingParcelles, map)
}

function panToLatLng(matchingParcelles: Parcelle[][], map: google.maps.Map) {
  const points = matchingParcelles[currentMatchingParcel].flatMap(x => x.geometry.coordinates[0])
  if (points) {
    const bounds = new google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(pointToLatLngLiteral(point)))
    map.panTo(bounds.getCenter())
  }
}

function fitBounds(matchingParcelles: Parcelle[][], map: google.maps.Map) {
  const bounds = new google.maps.LatLngBounds();
  matchingParcelles.forEach((matchingParcelle) => {
    matchingParcelle.forEach(x => {
      x.geometry.coordinates[0].forEach(point => {
        bounds.extend(pointToLatLngLiteral(point))
      })
    })
  })
  map.fitBounds(bounds)
}

function pointToLatLngLiteral(point: Point): google.maps.LatLngLiteral {
  return {lat: point[1], lng: point[0]}
}

function setupControls(dataMaps: DataMap[], dpe: Dpe[], map: google.maps.Map) {
  map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(controlsDiv);
  controlsDiv.style.display = 'flex'
  setTimeout(() => {
    surfaceInput().focus();
    surfaceInput().select()
  }, 400)
  surfaceInput().form!.addEventListener('submit', (e) => {
    e.preventDefault()
    map.data.forEach(feature => map.data.remove(feature));
    if (surfaceInput().value) {
      const matchingParcelles = findMatchingParcelles(dataMaps, cityInput().value, surfaceInput().valueAsNumber, spanningTwoInput.checked)
      if (matchingParcelles.length === 0) {
        resultsDiv.style.display = 'none'
      } else {
        currentMatchingParcel = 0
        resultsDiv.style.display = 'flex'
        resultsCountSpan.innerHTML = `${currentMatchingParcel + 1}/${matchingParcelles.length}`
        resultsNextButton.removeEventListener('click', cycleNext)
        resultsPreviousButton.removeEventListener('click', cyclePrevious)
        cycleNext = () => cycleMatchingParcel(1, matchingParcelles, map)
        cyclePrevious = () => cycleMatchingParcel(-1 + matchingParcelles.length, matchingParcelles, map)
        resultsNextButton.addEventListener('click', cycleNext)
        resultsPreviousButton.addEventListener('click', cyclePrevious)
        fitBounds(matchingParcelles, map)
      }
      drawMatchingParcelles(map, matchingParcelles)
    } else {
      resultsDiv.style.display = 'none'
    }
    if (energyClassInput().value || energyInput().value || emissionsClassInput().value || emissionsInput().value) {
      drawDpeMarkers(map, dpe)
    }
  }, true)
  const infoWindow = new google.maps.InfoWindow({pixelOffset: new google.maps.Size(0, -40)});
  map.data.addListener('click', (e: google.maps.Data.MouseEvent) => {
    infoWindow.close()
    if (e.feature.getGeometry()?.getType() === 'Point') {
      let properties = '<ul>'
      e.feature.forEachProperty((v, k) => properties += `<li><strong>${k}</strong> : ${v}</li>`)
      properties += '</ul>'
      let point!: google.maps.LatLng
      e.feature.getGeometry()!.forEachLatLng(x => point = x)
      infoWindow.setContent(properties);
      infoWindow.setPosition(point);
      infoWindow.open(map);
    } else {
      const bounds = new google.maps.LatLngBounds();
      e.feature.getGeometry()?.forEachLatLng(ll => bounds.extend(ll))
      map.fitBounds(bounds)
    }
  })
  map.controls[google.maps.ControlPosition.TOP_RIGHT].push(openExternalA);
  openExternalA.style.display = 'flex'
  openExternalA.addEventListener('click', () => openExternalA.href = googleMapsLogo().href)
}

function listenToExtension(map: google.maps.Map) {
  chrome.runtime.onMessage.addListener(async (message) => {
    const {city, surface, energyClass, emissionsClass/*, dpeDate*/, energy, emissions} = JSON.parse(message)
    if (city) {
      cityInput().value = city
      const geoloc = await new google.maps.Geocoder().geocode({'address': city});
      map.setCenter(geoloc.results[0].geometry.location)
    }
    if (surface) {
      surfaceInput().value = surface
    }
    if (energyClass) {
      energyClassInput().value = energyClass
    }
    if (emissionsClass) {
      emissionsClassInput().value = emissionsClass
    }
    // if (dpeDate) {
    //   dpeDateInput().value = dpeDate
    // }
    if (energy) {
      energyInput().value = energy
    }
    if (emissions) {
      emissionsInput().value = emissions
    }
  });
  chrome.tabs.getCurrent(tab => {
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, 'ready')
    }
  })
}

(async () => {
  const [dataMaps, dpe] = await loadAssets()
  const map = await loadMap()
  setupControls(dataMaps, dpe, map)
  listenToExtension(map)
})()

interface Dpe {
  'type': 'Feature',
  'id': string, //'MizvwV7LgJtPYwwzPocRV',
  'geometry': {
    // 'type': 'Point',
    'coordinates': Point
  },
  'properties': {
    'Adresse_(BAN)': '18 Allée des Mimosas 81600 Gaillac',
    'Surface_habitable_logement': 100,
    'Etiquette_GES': 'D',
    'Année_construction': 1966,
    'Emission_GES_5_usages_par_m²': 47,
    'Date_établissement_DPE': '2022-02-07',
    'Code_INSEE_(BAN)': '81099',
    'Conso_5_usages_par_m²_é_primaire': 252,
    'Adresse_brute': '18 allée des Mimosas',
    'Etiquette_DPE': 'E',
    '_id': 'JlvgP1Va3Fknz5T0b0OQi'
  }
}

interface Parcelle {
  type: 'Feature',
  id: string,
  geometry: {
    // type: 'Polygon',
    coordinates: [Point[]]
  },
  properties: {
    id: ParcelleId,
    commune: string, //'81099'
    prefixe: string, //'000'
    section: string, //'AB'
    numero: string, //'256'
    contenance: Surface, //30170
    arpente: boolean,
    created: string, //'2004-07-13'
    updated: string, //'2014-03-05'
  }
}

type ParcelleId = string

type ParcellesMap = {[id: ParcelleId]: Parcelle}

type ContenancesMap = {[contenance: number]: ParcelleId[][]}

type Point = number[]

type Surface = number

type Listener = (this: HTMLButtonElement, ev: MouseEvent) => any

interface DataMap {
  city: string,
  parcellesMap: ParcellesMap
  contenancesMap: ContenancesMap
}
