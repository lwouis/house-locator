"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cities = void 0;
const topojson_1 = require("topojson");
const promises_1 = require("fs/promises");
const https_1 = require("https");
const zlib_1 = require("zlib");
const fs_1 = require("fs");
const dataFolderPath = __dirname + '/../browser/data/';
exports.cities = {
    'montauban': 82121,
    'albi': 81004,
};
function computeTopology(parcelles) {
    return (0, topojson_1.topology)({ parcelles: parcelles });
}
function computeNeighbors(topology) {
    return (0, topojson_1.neighbors)(topology.objects.parcelles.geometries);
}
function computeContenancesMap(parcelles, topology, neighbors) {
    const contenancesMap = {};
    parcelles.features.forEach(parcelle => {
        if (contenancesMap[parcelle.properties.contenance]) {
            contenancesMap[parcelle.properties.contenance].push([parcelle.id]);
        }
        else {
            contenancesMap[parcelle.properties.contenance] = [[parcelle.id]];
        }
    });
    topology.objects.parcelles.geometries.forEach((parcelle, i) => {
        neighbors[i].forEach(neighborIndex => {
            const neighbor = topology.objects.parcelles.geometries[neighborIndex];
            const combinedContenance = parcelle.properties.contenance + neighbor.properties.contenance;
            const orderedPair = [parcelle.id, neighbor.id].sort();
            if (contenancesMap[combinedContenance]) {
                if (!contenancesMap[combinedContenance].some(x => x[0] === orderedPair[0] && (x.length === 1 || x[1] === orderedPair[1]))) {
                    contenancesMap[combinedContenance].push(orderedPair);
                }
            }
            else {
                contenancesMap[combinedContenance] = [orderedPair];
            }
        });
    });
    return contenancesMap;
}
function computeParcellesMap(parcelles) {
    const parcellesMap = {};
    parcelles.features.forEach(parcelle => {
        parcellesMap[parcelle.id] = parcelle;
    });
    return parcellesMap;
}
async function writeToFile(path, json) {
    return (0, promises_1.writeFile)(dataFolderPath + path, JSON.stringify(json), 'utf8');
}
async function downloadAndUnzip(url) {
    return new Promise((ok, ko) => {
        const buffer = [];
        (0, https_1.get)(url, res => {
            const gunzip = (0, zlib_1.createGunzip)();
            res.pipe(gunzip);
            gunzip.on('data', data => {
                buffer.push(data.toString());
            }).on('end', () => {
                ok(JSON.parse(buffer.join('')));
            }).on('error', e => {
                ko(e);
            });
        }).on('error', e => {
            ko(e);
        });
    });
}
async function download(url, fileName) {
    const file = (0, fs_1.createWriteStream)(dataFolderPath + fileName, 'utf8');
    (0, https_1.get)(url, response => {
        response.pipe(file);
        file.on('finish', () => file.close());
    });
}
async function downloadAndPreprocessParcellesDataForCommune(name, code) {
    // Cadastre data simplified by Etalab
    // https://cadastre.data.gouv.fr/datasets/cadastre-etalab
    const parcelles = await downloadAndUnzip(`https://cadastre.data.gouv.fr/data/etalab-cadastre/2022-10-01/geojson/communes/${Math.floor(code / 1000)}/${code}/cadastre-${code}-parcelles.json.gz`);
    const promises = [];
    promises.push(writeToFile(`${name}/parcelles.json`, parcelles));
    const topology = computeTopology(parcelles);
    // promises.push(writeToFile(`${name}/topology.json`, topology))
    const neighbors = computeNeighbors(topology);
    // promises.push(writeToFile(`${name}/neighbors.json`, neighbors))
    const contenancesMap = computeContenancesMap(parcelles, topology, neighbors);
    promises.push(writeToFile(`${name}/contenances-map.json`, contenancesMap));
    const parcellesMap = computeParcellesMap(parcelles);
    promises.push(writeToFile(`${name}/parcelles-map.json`, parcellesMap));
    return Promise.all(promises);
}
async function downloadDpeData() {
    // ADEME DPE data starting from July 2021
    // https://data.ademe.fr/datasets/dpe-v2-logements-existants
    // query made using the UI here: https://data.ademe.fr/datasets/dpe-v2-logements-existants/full?cols=Code_INSEE_%28BAN%29,Adresse_%28BAN%29,Adresse_brute,Ann%C3%A9e_construction,Surface_habitable_logement,Etiquette_GES,Etiquette_DPE,Conso_5_usages_par_m%C2%B2_%C3%A9_primaire,Emission_GES_5_usages_par_m%C2%B2,Date_%C3%A9tablissement_DPE&Type_b%C3%A2timent_eq=maison
    const url = `https://data.ademe.fr/data-fair/api/v1/datasets/dpe-v2-logements-existants/lines?size=10000&page=1&q_mode=simple&qs=(Type_b%C3%A2timent:(%22maison%22))+AND+(Code_INSEE_%5C(BAN%5C).text:${Object.values(exports.cities).join('%5C+')})&select=Code_INSEE_(BAN),Adresse_(BAN),Adresse_brute,Ann%C3%A9e_construction,Surface_habitable_logement,Etiquette_GES,Etiquette_DPE,Conso_5_usages_par_m%C2%B2_%C3%A9_primaire,Emission_GES_5_usages_par_m%C2%B2,Date_%C3%A9tablissement_DPE&format=geojson`;
    return download(url, 'dpe-v2-logements-existants.geojson');
}
async function downloadAndPreprocessParcellesData() {
    return Promise.all(Object.entries(exports.cities).map(([name, code]) => {
        (0, fs_1.mkdirSync)(`${dataFolderPath}/${name}`, { recursive: true });
        return downloadAndPreprocessParcellesDataForCommune(name, code);
    }));
}
(async () => {
    await Promise.all([
        downloadDpeData(),
        downloadAndPreprocessParcellesData(),
    ]);
})();
