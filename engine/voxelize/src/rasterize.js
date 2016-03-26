
'use strict';

var core = require('rle-core');
var repair = require('rle-repair');
var extents = require('rle-extents')


var spatialGrid = require('./spatial-grid');
var signedDistance = require('./signed-distance');

var voxelCompare = new Function('a', 'b', [
  'for(var i=2; i>=0; --i) {',
    'var d = a[i]-b[i];',
    'if(d) return d;',
  '}',
  'return 0;'
].join('\n'));

function rasterize(geometry) {
  var cells = geometry.cells;
  var positions = geometry.positions;
  var faceNormals = geometry.faceNormals;

  var grid = spatialGrid(cells, positions, 1.0);
  var faceNormals = faceNormals || normals.faceNormals(grid.cells, grid.positions);
  var result = [];
  var n = 0;
  for(var id in grid.grid) {
    var coord = grid.grid[id].coord;
    var d = signedDistance(grid, faceNormals, coord);
    var m = geometry.mapping(grid, coord);
    if(isNaN(d) || Math.abs(d) > 1.0) {
      // if (d >= 0 && m) {
      //   result.push([coord[0], coord[1], coord[2], 1, d, [], faceNormals]);
      // } else {
        continue;
      // }
    } else {
      if(d < 0 && !m) {
        // hallow
        // result.push([coord[0], coord[1], coord[2], 1, -d, [], faceNormals]);
        result.push([coord[0], coord[1], coord[2], 1, -d]);
      } else {
        console.log('hole')
        result.push([coord[0], coord[1], coord[2], 0,  d]);
      }
    }
  }

  result.sort(voxelCompare);
  var X = new Array(result.length+1);
  var Y = new Array(result.length+1);
  var Z = new Array(result.length+1);
  var P = new Array(result.length+1);
  var D = new Array(result.length+1);
  var V = new Array(result.length+1);
  var M = new Array(result.length+1);
  X[0] = Y[0] = Z[0] = core.NEGATIVE_INFINITY;
  P[0] = 0;
  D[0] = 1.0;
  for(var i=0; i<result.length; ++i) {
    var r = result[i];
    X[i+1] = r[0];
    Y[i+1] = r[1];
    Z[i+1] = r[2];
    P[i+1] = r[3];
    D[i+1] = r[4];
  }

  // return repair.removeDuplicates(new core.DynamicVolume([X,Y,Z], D, P));
  var volume = repair.removeDuplicates(new core.DynamicVolume([X,Y,Z], D, P));
  return volume;
}


module.exports = rasterize;