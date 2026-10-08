// Loads promo/<spot>/spot.json. A spot with "base": "<other spot>" reuses that
// spot's scene choreography: the base's keys are the defaults, and its scene
// list becomes srcScenes, the source timeline the composition is written in.
const fs = require('fs');

module.exports = function loadSpot(root, spot) {
    const own = JSON.parse(fs.readFileSync(`${root}/${spot}/spot.json`, 'utf8'));
    if (!own.base) return { ...own, srcScenes: own.scenes };
    const base = JSON.parse(fs.readFileSync(`${root}/${own.base}/spot.json`, 'utf8'));
    return { ...base, ...own, srcScenes: base.scenes };
};
