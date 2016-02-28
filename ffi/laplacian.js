var repl = require('repl');
var ffi = require('ffi');
var ref = require('ref');
var ArrayType = require('ref-array');
var int = ref.types.int;
var double = ref.types.double;
var IntArray = ArrayType(int);
var ArrayArray = ArrayType(IntArray);
// var DoubleArray = ArrayType(double);

// var funcPtr = ffi.Function('void', ['int']);
var lib = ffi.Library('mylib', {
  'parseJSON': [int, ['string']],
  // 'createMatrix': [IntArray, [IntArray, IntArray, ArrayArray] ]
});

var THREE = require('three');
var ms = require('./mesh-segmentation');

var geometry = new THREE.CylinderGeometry(1, 1, 2, 20);
var faces = geometry.faces;

geometry = ms.computeUniq(geometry);
// geometry = ms.computeLaplacian(geometry);
// geometry = ms.computeHarmonicField(geometry);
var vertices = geometry.vertices;
var map = geometry.map;
var edges = geometry.map;
var uniq = geometry.uniq;

var positions = uniq.map( function (v) {

})

var json = {
  uniq: uniq,
  faces: faces
}
var result;
var str = JSON.stringify(json);
lib.parseJSON(str);

// console.log(uniq);
// var faces = new IntArray(sample.cells);
// var uniq = new IntArray(sample.positions);
// var result = lib.createMatrix(vertices, faces, edges);

repl.start('> ').context.r = geometry;
