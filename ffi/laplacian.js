
var repl = require('repl');
var ffi = require('ffi');
var ref = require('ref');
var _ = require('lodash');
var Q = require('q');

var ArrayType = require('ref-array');
var int = ref.types.int;
var double = ref.types.double;
var IntArray = ArrayType(int);
var ArrayArray = ArrayType(IntArray);

var THREE = require('three');
var ms = require('./mesh-segmentation');

var geometry = new THREE.CylinderGeometry(100, 100, 100, 3000);
var faces = geometry.faces;
var vertices;
var map;
var edges;
var uniq;
var boundary;

function init () {
  geometry = ms.computeUniq(geometry);
  // geometry = ms.computeLaplacian(geometry);
  // geometry = ms.computeHarmonicField(geometry);
  vertices = geometry.vertices;
  map = geometry.map;
  edges = geometry.edges;
  uniq = geometry.uniq;
}

function getLoop () {
  var id = 10;
  var checked = [];
  var current;
  while (true) {
    current = uniq[id];
    var remains = _.pullAll(current.edges, checked);
    if (remains.length <= 0) break;
    id = remains[0];
    checked = _.union(checked, [id]);
  }
  boundary = checked;
}

function calculate () {
  var StructType = require('ref-struct');
  var DoubleArray = ArrayType(double);
  var Result = StructType({
    'uv': DoubleArray
  })
  var uv_row = uniq.length;
  var uv_col = 2;
  var result = new Result({
    uv: new DoubleArray(uv_row * uv_col)
  });
  var lib = ffi.Library('mylib', {
    'parseJSON': [int, ['string', 'pointer']],
  });

  var json = {
    uniq: uniq,
    faces: faces,
    map: map,
    boundary: boundary
  }
  var str = JSON.stringify(json);
  lib.parseJSON(str, result.ref());

  for (var i=0; i<uniq.length; i++) {
    uniq[i]
  }
  repl.start('> ').context.uniq = uniq;
}

Q.fcall(init)
.then(getLoop)
.then(calculate)

