var repl = require('repl');

var voxelize = require('./voxelize/index');
var stl = require('ndarray-stl');
var normals = require('normals');
var fs = require('fs');
var sample = require('./sample.json');

var spatialGrid = require('./voxelize/src/spatial-grid');
var signedDistance = require('./voxelize/src/signed-distance');

// var json = JSON.parse(sample);
var json = sample;
// var grid = spatialGrid(json.cells, json.positions, 0.1);
// var faceNormals = normals.faceNormals(grid.cells, grid.positions);
var object = voxelize(json.cells, json.positions, 0.02, json.mappings);
var data = stl(object.voxels);
fs.writeFileSync('hoge.stl', data, 'utf8');

// repl.start('> ').context.object = object;

// object.voxels
// -> data, shape, stride, offset



