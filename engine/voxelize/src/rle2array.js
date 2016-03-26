'use strict'

var ndarray = require('ndarray')
var core = require('rle-core')
var repair = require('rle-repair')
var extents = require('rle-extents')

function rle2array(volume, bounds) {
  if(!bounds) {
    bounds = extents(volume)
  }
  console.log(bounds)
  var dims = [0,0,0], i, j, k, n = volume.length(), size = 1, stride = [0,0,0]
  for(i=0; i<3; ++i) {
    dims[i] = (bounds[1][i] - bounds[0][i])|0
    stride[i] = size
    size *= dims[i]
  }
  console.log('size: ' + size)
  var phase = ndarray(new Int32Array(size), dims, stride, 0)
  var distance = ndarray(new Float32Array(size), dims, stride, 0)
  var ptr = size
  var X = volume.coords[0],
      Y = volume.coords[1],
      Z = volume.coords[2],
      P = volume.phases,
      D = volume.distances,
      x0,y0,z0,p,d,v,t,nptr,
      sx = bounds[0][0]|0,
      sy = bounds[0][1]|0,
      sz = bounds[0][2]|0

  for(i=n-1; i>=0; --i) {
    nptr = ptr
    x0 = (X[i]-sx)|0
    y0 = (Y[i]-sy)|0
    z0 = (Z[i]-sz)|0
    if(z0 < 0 || z0 >= dims[2]) {
      continue
    }
    if(y0 < 0) {
      x0 = y0 = 0
    } else if(y0 >= dims[1]) {
      x0 = dims[0]-1
      y0 = dims[1]-1
    } else {
      if(x0 < 0) {
        x0 = 0
      } else if(x0 >= dims[0]) {
        x0 = dims[0]-1
      }
    }
    ptr = x0 + dims[0] * (y0 + dims[1] * z0)
    d = D[i]
    p = P[i]
    var fill = false;
    if (fill) {
      for(j=nptr-1; j>=ptr; --j) {
        phase.data[j] = p
        distance.data[j] = d
      }
    } else {
      phase.data[ptr] = p;
      distance.data[ptr] = d;
    }
  }
  return {
    phase: phase,
    distance: distance,
  };
}
module.exports = rle2array


/*
  var hoga = 0;
  var coords = volume.C;
  console.log(coords.length, 'coords')
  var k = 0;
  var m = 0;
  for (var z=1; z<=dims[2]; z++) {
    for (var y=1; y<=dims[1]; y++) {
      for (var x=1; x<=dims[0]; x++) {
        var coord = [x, y, z].join(',');
        if (coords.indexOf(coord) !== -1) {
          var p = P[k+1];
          phase.data[m] = p;
          k++;
          if (x == 21) hoga++;
        } else {
          phase.data[m] = 0;
        }
        m++;
      }
    }
  }
  console.log(hoga, 'hoga')
*/
