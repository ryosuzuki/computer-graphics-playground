'use strict'

var ndarray = require('ndarray')
var core = require('rle-core')
var repair = require('rle-repair')
var extents = require('rle-extents')

function rle2array(volume, bounds) {
  if(!bounds) {
    bounds = extents(volume)
  }
  var dims = [0,0,0], i, j, k, n = volume.length(), size = 1, stride = [0,0,0]
  for(i=0; i<3; ++i) {
    dims[i] = (bounds[1][i] - bounds[0][i])|0
    stride[i] = size
    size *= dims[i]
  }
  var phase = ndarray(new Int32Array(size), dims, stride, 0)
  var distance = ndarray(new Float32Array(size), dims, stride, 0)
  var vertices = ndarray(new Int32Array(size), dims, stride, 0)
  var transform = ndarray(new Float32Array(size), dims, stride, 0)
  var ptr = size
  var X = volume.coords[0],
      Y = volume.coords[1],
      Z = volume.coords[2],
      P = volume.phases,
      D = volume.distances,
      V = volume.vertices,
      M = volume.mappings,
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
    for(j=nptr-1; j>=ptr; --j) {
      phase.data[j] = p
      distance.data[j] = d
    }
  }
  return {
    phase: phase,
    distance: distance,
    vertices: V,
    mappings: M
  };
}
module.exports = rle2array
