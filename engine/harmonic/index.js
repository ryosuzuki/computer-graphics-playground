var repl = require('repl');
var ffi = require('ffi');
var ref = require('ref');
var _ = require('lodash');
var ArrayType = require('ref-array');
var StructType = require('ref-struct');

var compute = {
  getHarmonicField: getHarmonicField,
}
var lib = ffi.Library(__dirname + '/compute', {
  'getHarmonicField':   ['void', ['string', 'pointer']],
});

var int = ref.types.int;
var double = ref.types.double;
var DoubleArray = ArrayType(double);
var Result = {};
Result.field = StructType({
  'phi': DoubleArray
})

function getHarmonicField (json) {
  /*
  var json = {
    uniq:     geometry.uniq,
    faces:    geometry.faces,
    map:      geometry.map,
    p:        0,
    p:        100,
  };
  */
  console.log('Start getField');
  var size = json.size
  var result = new Result.field({
    phi: new DoubleArray(size),
  });
  console.log('Get result from C++');
  lib.getHarmonicField(JSON.stringify(json), result.ref());
  console.log('Start converting sparse Laplacian');
  var phi = new Array(size);
  for (var i=0; i<size; i++) {
    phi[i] = result.phi[i];
  }
  return { phi: phi }
}

module.exports = compute;
