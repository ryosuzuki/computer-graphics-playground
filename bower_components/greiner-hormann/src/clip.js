var Polygon = require('./polygon');

/**
 * Clip driver
 * @api
 * @param  {Array.<Array.<Number>>} polygonA
 * @param  {Array.<Array.<Number>>} polygonB
 * @param  {Boolean}                sourceForwards
 * @param  {Boolean}                clipForwards
 * @return {Array.<Array.<Number>>}
 */
module.exports = function(polygonA, polygonB, eA, eB) {
    var result, source = new Polygon(polygonA),
        clip = new Polygon(polygonB),
        result = source.clip(clip, eA, eB);

    return result;
};
