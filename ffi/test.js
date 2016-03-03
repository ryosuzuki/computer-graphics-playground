var compute = require('./compute');
var ms = require('./mesh-segmentation');
var Q = require('q');
var repl = require('repl');
var THREE = require('three');
var geometry = new THREE.CylinderGeometry(10, 10, 10, 30);

function startRepl (geometry) {
  var json = {
    uniq: geometry.uniq,
    faces: geometry.faces,
    map: geometry.map,
    boundary: geometry.boundary,
    p: 0,
    q: geometry.uniq.length -1
  };
  var result = compute.getField(json);
  // var result = compute.getMapping(json);
  // console.log(result);
  // repl.start('> ').context.r = result;
}

Q.fcall(ms.computeUniq(geometry))
.then(ms.getBoundary(geometry))
.then(startRepl(geometry))





