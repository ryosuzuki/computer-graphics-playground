var ffi = require('ffi');
var ref = require('ref');
var _ = require('lodash');
var ArrayType = require('ref-array');
var StructType = require('ref-struct');

var compute = {
  getLaplacian: getLaplacian,
  getMapping: getMapping
}
var lib = ffi.Library(__dirname + '/mylib', {
  'getLaplacian': ['int', ['string', 'pointer']],
  'getMapping': ['int', ['string', 'pointer']],
});

var int = ref.types.int;
var double = ref.types.double;
var IntArray = ArrayType(int);
var DoubleArray = ArrayType(double);
var Result = {};
Result.laplacian = StructType({
  'row': IntArray,
  'col': IntArray,
  'val': DoubleArray
})
Result.mapping = StructType({
  'uv': DoubleArray
})

var repl = require('repl');


function getLaplacian (json) {
  var uniq = json.uniq;
  console.log('Start getLaplacian');
  var n = uniq.length;
  n = 500;
  var result = new Result.laplacian({
    nRow: int,
    nCol: int,
    row: new IntArray(n),
    col: new IntArray(n),
    val: new DoubleArray(n)
  });
  console.log('Get result from C++');
  lib.getLaplacian(JSON.stringify(json), result.ref());
  // console.log('Start converting in Node');
  // var laplacian = [];
  // for (var i=0; i<result.L.length; i++) {
  //   laplacian.push(result.L[i])
  // }
  // console.log('Finish');
  // return { laplacian: laplacian }

  repl.start('> ').context.r = result;
  return result;
}



function getMapping (json) {
  /*
  var json = {
    uniq:     geometry.uniq,
    faces:    geometry.faces,
    map:      geometry.map,
    boundary: geometry.boundary
  };
  */
  var uniq = json.uniq;
  console.log('Start getMapping');
  var row = uniq.length;
  var col = 2;
  var result = new Result.mapping({
    uv: new DoubleArray(row * col)
  });
  lib.getMapping(JSON.stringify(json), result.ref());

  repl.start('> ').context.r = result;


  console.log('Get result from C++');
  console.log('Start converting in Node');
  for (var i=0; i<uniq.length; i++) {
    var u = result.uv[2*i + 0];
    var v = result.uv[2*i + 1];
    uniq[i].uv = { u: u, v: v };
  }
  console.log('Finish');
  return { uniq: uniq };
}


module.exports = compute;
