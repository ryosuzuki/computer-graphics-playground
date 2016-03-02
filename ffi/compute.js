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
  'getMapping':   ['int', ['string', 'pointer']],
});

var int = ref.types.int;
var double = ref.types.double;
var IntArray = ArrayType(int);
var DoubleArray = ArrayType(double);
var Result = {};
Result.laplacian = StructType({
  'size': int,
  'count': int,
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
    size: 0,
    count: 0,
    row: new IntArray(n),
    col: new IntArray(n),
    val: new DoubleArray(n)
  });
  console.log('Get result from C++');
  lib.getLaplacian(JSON.stringify(json), result.ref());
  console.log('Start converting sparse Laplacian');

  var count = result.count;
  var size = result.size;
  console.log('count: ' + count);
  console.log('size: ' + size);
  var ccsCol = [0];
  var prev = 0;
  for (var i=0; i<count; i++) {
    var current = result.col[i];
    var diff = current - prev;
    for (var c=0; c<diff; c++) {
      ccsCol.push(i);
    }
    prev = current;
  }
  ccsCol.push(count);
  var ccsRow = new Array(count);
  var ccsVal = new Array(count);
  for (var i=0; i<count; i++) {
    ccsRow[i] = result.row[i];
    ccsVal[i] = result.val[i];
  }
  var ccsL = new Array(3);
  ccsL[0] = ccsCol;
  ccsL[1] = ccsRow;
  ccsL[2] = ccsVal;
  result.ccsL = ccsL;
  console.log('Finish');
  // return { ccsL: ccsL }
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



function test () {
  var result = {};
  result.col = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5];
  result.row = [0, 1, 0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5];
  result.val = [2,-1,-1, 2,-1,-1, 2,-1,-1, 2,-1,-1, 2,-1,-1, 2];
  var count = 16;
  var size = 6;
  var ccsCol = [0];
  var prev = 0;
  for (var i=0; i<count; i++) {
    var current = result.col[i];
    var diff = current - prev;
    for (var c=0; c<diff; c++) {
      ccsCol.push(i);
    }
    prev = current;
  }
  ccsCol.push(count);

  var ccsRow = new Array(count);
  var ccsVal = new Array(count);
  for (var i=0; i<count; i++) {
    ccsRow[i] = result.row[i];
    ccsVal[i] = result.val[i];
  }
  var ccsL = new Array(3);
  ccsL[0] = ccsCol;
  ccsL[1] = ccsRow;
  ccsL[2] = ccsVal;
  result.ccsL = ccsL;
  /*
  result.ccsL should be
  [0, 2, 5, 8, 11, 14, 16]
  [0, 1, 0, 1, 2, 1, 2, 3, 2, 3, 4, 3, 4, 5, 4, 5]
  [2,-1,-1, 2,-1,-1, 2,-1,-1, 2,-1,-1, 2,-1,-1, 2]
  */
}

