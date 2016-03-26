var ffi = require('ffi');
var ref = require('ref');
var _ = require('lodash');
var ArrayType = require('ref-array');
var StructType = require('ref-struct');

var compute = {
  getBoundary: getBoundary,
  getField: getField,
  getMapping: getMapping,
  getLaplacian: getLaplacian,

}
var lib = ffi.Library(__dirname + '/compute', {
  'getBoundary':   ['void', ['string', 'pointer']],
  'getField':   ['void', ['string', 'pointer']],
  'getMapping':   ['void', ['string', 'pointer']],
  // 'getLaplacian': ['void', ['string', 'pointer', 'pointer', 'pointer', 'pointer']],
});

var int = ref.types.int;
var double = ref.types.double;
var IntArray = ArrayType(int);
var DoubleArray = ArrayType(double);
var Result = {};
Result.field = StructType({
  'phi': DoubleArray
})
Result.mapping = StructType({
  'uv': DoubleArray
})
Result.boundary = StructType({
  'cuts': DoubleArray
})
Result.matrix = StructType({
  'size': int,
  'count': int,
  'row': IntArray,
  'col': IntArray,
  'val': DoubleArray,
});
Result.index = StructType({
  'count': int,
  'index': IntArray,
})

var repl = require('repl');

function getField (json) {
  /*
  var json = {
    uniq:     geometry.uniq,
    faces:    geometry.faces,
    map:      geometry.map,
    p:        0,
    p:        100,
  };
  */
  var uniq = json.uniq;
  console.log('Start getField');
  var n = uniq.length;
  var result = new Result.field({
    phi: new DoubleArray(n),
  });
  console.log('Get result from C++');
  lib.getField(JSON.stringify(json), result.ref());
  console.log('Start converting sparse Laplacian');
  var phi = new Array(n);
  for (var i=0; i<n; i++) {
    phi[i] = result.phi[i];
  }
  return { phi: phi }
}



function getBoundary (json) {
  /*
  var json = {
    uniq:     geometry.uniq,
    faces:    geometry.faces,
    map:      geometry.map,
    boundary: geometry.boundary
  };
  */
  var uniq = json.uniq;
  var faces = json.faces;
  console.log('Start getBoundary');
  var row = faces.length;
  var col = 3;
  var result = new Result.boundary({
    cuts: new DoubleArray(row * col)
  });
  lib.getBoundary(JSON.stringify(json), result.ref());

  // repl.start('> ').context.r = result;

  console.log('Get result from C++');
  console.log('Start converting in Node');
  console.log(result.cuts)
  var cuts = {}
  for (var i=0; i<faces.length; i++) {
    for (var j=0; j<3; j++) {
      var flag = result.cuts[3*i + j];
      if (flag > 0 ) {
        if (!cuts[i]) cuts[i] = [];
        cuts[i].push(j);
      }
    }
  }
  console.log('Finish');
  return { cuts: cuts };

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




function getLaplacian (json) {
  /*
  var json = {
    uniq:     geometry.uniq,
    faces:    geometry.faces,
    map:      geometry.map,
  };
  */
  var uniq = json.uniq;
  console.log('Start getLaplacian');
  var n = uniq.length;
  n = n;
  var result_L = new Result.matrix({
    size: 0,
    count: 0,
    row: new IntArray(n),
    col: new IntArray(n),
    val: new DoubleArray(n),
  });
  var result_U = new Result.matrix({
    size: 0,
    count: 0,
    row: new IntArray(n),
    col: new IntArray(n),
    val: new DoubleArray(n),
  });
  var result_P = new Result.index({
    count: 0,
    index: new IntArray(n),
  });
  var result_Pinv = new Result.index({
    count: 0,
    index: new IntArray(n),
  });
  console.log('Get result from C++');
  lib.getLaplacian(JSON.stringify(json), result_L.ref(), result_U.ref(), result_P.ref(), result_Pinv.ref());
  console.log('Start converting sparse Laplacian');

  console.log(result_L.count);
  var result = {};
  result.L = getSparse(result_L);
  result.U = getSparse(result_U);
  result.P = getIndex(result_P);
  result.Pinv = getIndex(result_Pinv);
  console.log('Finish');
  // repl.start('> ').context.r = result;
  return result;
}



function getSparse (result) {
  var count = result.count;
  var size = result.size;
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
  var ccsMatrix = new Array(3);
  ccsMatrix[0] = ccsCol;
  ccsMatrix[1] = ccsRow;
  ccsMatrix[2] = ccsVal;
  return ccsMatrix;
}


function getIndex (result) {
  var count = result.count;
  var ccsIndex = new Array(count);
  for (var i=0; i<count; i++) {
    ccsIndex[i] = result.index[i];
  }
  return ccsIndex;
}

