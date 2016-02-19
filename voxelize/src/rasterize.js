
'use strict';

var normals = require('normals');
var core = require('rle-core');
var repair = require('rle-repair');

var spatialGrid = require('./spatial-grid');
var signedDistance = require('./signed-distance');

var voxelCompare = new Function('a', 'b', [
  'for(var i=2; i>=0; --i) {',
    'var d = a[i]-b[i];',
    'if(d) return d;',
  '}',
  'return 0;'
].join('\n'));

function rasterize(cells, positions, faceNormals, removes) {
  if(cells.cells) {
    faceNormals = cells.faceNormals;
    positions = cells.positions;
    cells = cells.cells
  }
  var grid = spatialGrid(cells, positions, 1.0);
  var faceNormals = faceNormals || normals.faceNormals(grid.cells, grid.positions);
  var result = [];
  for(var id in grid.grid) {
    var coord = grid.grid[id].coord;
    var d = signedDistance(grid, faceNormals, coord);
    if(isNaN(d) || Math.abs(d) > 1.0) {
      continue;
    } else {
      var cells = grid.closestCells(coord).cells;
      // for (var i=2000; i<8000; i++) {
      //   if (cells.indexOf(i) !== -1) d = 0;
      // }
      if (cells[0]%2 == 0) d = 0;
      if(d < 0) {
        result.push([coord[0], coord[1], coord[2], 1, -d]);
      } else {
        result.push([coord[0], coord[1], coord[2], 0, d]);
      }
    }
  }
  result.sort(voxelCompare);
  var X = new Array(result.length+1);
  var Y = new Array(result.length+1);
  var Z = new Array(result.length+1);
  var P = new Array(result.length+1);
  var D = new Array(result.length+1);
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
  //return repair.removeDuplicates(new core.DynamicVolume([X,Y,Z], D, P));
  return repair.removeDuplicates(new core.DynamicVolume([X,Y,Z], D, P));
}

module.exports = rasterize;