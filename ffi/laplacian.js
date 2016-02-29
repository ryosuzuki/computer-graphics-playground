
var repl = require('repl');
var ffi = require('ffi');
var ref = require('ref');
var ArrayType = require('ref-array');
var int = ref.types.int;
var double = ref.types.double;
var IntArray = ArrayType(int);
var ArrayArray = ArrayType(IntArray);

var THREE = require('three');
var ms = require('./mesh-segmentation');

var geometry = new THREE.CylinderGeometry(1, 1, 1, 100);
var faces = geometry.faces;

geometry = ms.computeUniq(geometry);
// geometry = ms.computeLaplacian(geometry);
// geometry = ms.computeHarmonicField(geometry);
var vertices = geometry.vertices;
var map = geometry.map;
var edges = geometry.map;
var uniq = geometry.uniq;


var json = {
  uniq: uniq,
  faces: faces,
  map: map
}
var StructType = require('ref-struct');
var DoubleArray = ArrayType(double);
var Result = StructType({
  'array': DoubleArray
})

var n = 10;
var result = new Result({
  array: new DoubleArray(n)
});
var lib = ffi.Library('mylib', {
  'parseJSON': [int, ['string', 'pointer']],
});
var str = JSON.stringify(json);
lib.parseJSON(str, result.ref());

// var faces = new IntArray(sample.cells);
// var uniq = new IntArray(sample.positions);
// var result = lib.createMatrix(vertices, faces, edges);

// repl.start('> ').context.geo = geometry;
