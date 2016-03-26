var repl = require('repl');
var ffi = require('ffi');
var ref = require('ref');
var _ = require('lodash');
var ArrayType = require('ref-array');
var StructType = require('ref-struct');

var dgpc = {
  getMapping: getMapping,
}
var lib = ffi.Library(__dirname + '/dgpc', {
  'getMapping':   ['void', ['string', 'int', 'pointer']],
});

var int = ref.types.int;
var double = ref.types.double;
var IntArray = ArrayType(int);
var DoubleArray = ArrayType(double);
var Result = {};
Result.mapping = StructType({
  'n': int,
  'id': IntArray,
  'r': DoubleArray,
  'theta': DoubleArray
})

var fs = require('fs');

function getMapping (filename, size, start) {
  console.log('Start getMapping');
  var result = new Result.mapping({
    n: int,
    id: new IntArray(size),
    r: new IntArray(size),
    theta: new IntArray(size)
  });
  lib.getMapping(filename, start, result.ref());

  console.log('Get result from C++');
  console.log('Start converting in Node');
  var uv = {};
  for (var i=0; i<result.n; i++) {
    var id = result.id[i]
    var r = result.r[i]
    var theta = result.theta[i]
    var u = r * Math.cos(theta) + 0.5;
    var v = r * Math.sin(theta) + 0.5;
    uv[id] = { r: r, theta: theta, u: u, v: v };
  }
  console.log('Finish');
  return { uv: uv };
}

module.exports = dgpc;

