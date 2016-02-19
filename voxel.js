var repl = require('repl');

var voxelize = require('./voxelize/index');
var stl = require('ndarray-stl');
var normals = require('normals');
var fs = require('fs');
var sample = require('./sample.json');

var spatialGrid = require('./voxelize/src/spatial-grid');
var signedDistance = require('./voxelize/src/signed-distance');

var json = JSON.parse(sample);
var grid = spatialGrid(json.cells, json.positions, 0.1);
var faceNormals = normals.faceNormals(grid.cells, grid.positions);

// coord -> the position of voxels [0,0,0] -> [0,1,0] -> ...
// for(var id in grid.grid) {
//   var coord = grid.grid[id].coord;
// }
// repl.start('> ').context.grid = grid;

var object = voxelize(json.cells, json.positions, 0.04);
var data = stl(object.voxels);
fs.writeFileSync('hoge.stl', data, 'utf8');

// repl.start('> ').context.object = object;

// object.voxels
// -> data, shape, stride, offset



