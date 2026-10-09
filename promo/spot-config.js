// Loads promo/<spot>/spot.json. A spot with "base": "<other spot>" reuses that
// spot's scene choreography: the base's keys are the defaults, and its scene
// list becomes srcScenes, the source timeline the composition is written in.
// "extraScenes" on the base are scenes the composition has but the base's own
// cut doesn't play (e.g. chat): available to other spots, invisible in the base.
const fs = require('fs');

module.exports = function loadSpot(root, spot) {
    const own = JSON.parse(fs.readFileSync(`${root}/${spot}/spot.json`, 'utf8'));
    const base = own.base ? JSON.parse(fs.readFileSync(`${root}/${own.base}/spot.json`, 'utf8')) : own;
    const srcScenes = [...base.scenes, ...(base.extraScenes ?? [])];
    return own.base ? { ...base, ...own, srcScenes } : { ...own, srcScenes };
};
