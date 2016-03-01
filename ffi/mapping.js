var ffi = require('ffi');
var ref = require('ref');
var ArrayType = require('ref-array');
var StructType = require('ref-struct');

function mapping (json) {
  /*
  var json = {
    uniq:     geometry.uniq,
    faces:    geometry.faces,
    map:      geometry.map,
    boundary: geometry.boundary
  };
  */
  var uniq = json.uniq;
  console.log('Start mapping');
  var double = ref.types.double;
  var DoubleArray = ArrayType(double);
  var Result = StructType({
    'uv': DoubleArray
  })
  var uv_row = uniq.length;
  var uv_col = 2;
  var result = new Result({
    uv: new DoubleArray(uv_row * uv_col)
  });
  var lib = ffi.Library(__dirname + '/mylib', {
    'parseJSON': ['int', ['string', 'pointer']],
  });
  lib.parseJSON(JSON.stringify(json), result.ref());
  for (var i=0; i<uniq.length; i++) {
    var u = result.uv[2*i + 0];
    var v = result.uv[2*i + 1];
    uniq[i].uv = { u: u, v: v };
  }
  return { uniq: uniq };
}

module.exports = mapping;
