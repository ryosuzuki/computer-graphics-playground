
var normals = require('normals');
var rasterize = require('./rasterize')
var rle2array = require('./rle2array')

function Geometry (cells, positions, mappings, selected_cells, resolution, faceNormals, uvMap) {
  if (cells.cells) {
    var hash = cells;
    cells = hash.cells;
    positions = hash.positions;
    mappings = hash.mappings;
    selected_cells = hash.selected_cells;
    resolution = hash.resolution;
    faceNormals = hash.faceNormals;
    uvMap = hash.uvMap;
  }
  this.cells = cells;
  this.positions = positions;
  this.mappings = mappings || [];
  this.selected_cells = selected_cells || [];
  this.resolution = resolution || 1.0;
  this.faceNormals = faceNormals || normals.faceNormals(this.cells, this.positions);
  this.uvMap = uvMap || { cells: [], positions: [] };
  return this;
}

Geometry.prototype.updatePositions = function () {
  var resolution = this.resolution;
  var positions = this.positions;
  var lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity],
      n  = positions.length, i, j, p
  for(i=0; i<n; ++i) {
    p = positions[i]
    for(j=0; j<3; ++j) {
      lo[j] = Math.min(lo[j], p[j])
      hi[j] = Math.max(hi[j], p[j])
    }
  }
  var scale = +resolution || 1.0
  var iscale = 1.0 / scale
  var shift = [0,0,0]
  for(j=0; j<3; ++j) {
    shift[j] = lo[j] - scale
  }
  var npositions = new Array(n)
  for(i=0; i<n; ++i) {
    p = positions[i].slice(0)
    for(j=0; j<3; ++j) {
      p[j] = (p[j] - shift[j]) * iscale
    }
    npositions[i] = p
  }
  this.positions = npositions;
  this.origin = shift
  return this;
}

Geometry.prototype.voxelize = function (resolution) {
  if (resolution) this.resolution = resolution;
  var output = {
    cells: this.cells.length,
    positions: this.positions.length,
    selected_cells: this.selected_cells.length,
    mapppings: this.mappings.length,
    resolution: this.resolution,
    uvMap: {
      cells: this.uvMap.cells.length,
      positions: this.uvMap.positions.length
    }
  }
  console.log(output)
  this.updatePositions()
  console.log('Start rasterizing...')
  var volume = rasterize(this);
  console.log('Generate voxels...')
  var result = rle2array(volume);
  return {
    voxels: result.phase,
    distance: result.distance,
    origin: this.origin,
    vertices: this.positions,
    mappings: this.mappings,
    resolution: this.resolution
  }
}

Geometry.prototype.detect = function (p) {
  var cells = this.uvMap.cells;
  var positions = this.uvMap.positions;
  var bool = false;
  function sign (p1, p2, p3) {
    return (p1.u-p3.u)*(p2.v-p3.v)-(p2.u-p3.u)*(p1.v-p3.v);
  }
  for (var i=0; i<cells.length; i++) {
    var p1 = positions[cells[i][0]];
    var p2 = positions[cells[i][1]];
    var p3 = positions[cells[i][2]];

    var b1 = sign(p, p1, p2) < 0;
    var b2 = sign(p, p2, p3) < 0;
    var b3 = sign(p, p3, p1) < 0;
    if (b1 == b2 && b2 == b3) {
      bool = true;
      break;
    }
  }
  return bool;
}


Geometry.prototype.mapping = function (grid, coord) {
  var current_cells = grid.closestCells(coord).cells;
  for (var i=0; i<current_cells.length; i++) {
    var cell = current_cells[i];
    if (this.selected_cells.indexOf(cell) == -1) continue;
    var vertices = this.cells[cell];
    var va = this.positions[vertices[0]];
    var vb = this.positions[vertices[1]];
    var vc = this.positions[vertices[2]];
    va = va.map(function (pos) { return pos / grid.tolerance });
    vb = vb.map(function (pos) { return pos / grid.tolerance });
    vc = vc.map(function (pos) { return pos / grid.tolerance });

    var n = this.faceNormals[cell];
    var A = [
      [ va[0]-vc[0], vb[0]-vc[0], n[0] ],
      [ va[1]-vc[1], vb[1]-vc[1], n[1] ],
      [ va[2]-vc[2], vb[2]-vc[2], n[2] ]
    ];
    var B = [
      coord[0] - vc[0],
      coord[1] - vc[1],
      coord[2] - vc[2]
    ]
    var Ainv = numeric.inv(A);
    var T = numeric.dot(Ainv, B);
    var a = T[0];
    var b = T[1];
    var c = 1 - (a+b);
    var k = T[2];
    if (a<0 || b<0 || c<0) {
      continue;
    }
    // u = a*va.u + b*vb.u + c*vc.u;
    // v = a*va.v + b*vb.v + c*vc.v;
    if (this.mappings && this.mappings.length > 0) {
      var ma = this.mappings[vertices[0]];
      var mb = this.mappings[vertices[1]];
      var mc = this.mappings[vertices[2]];
      var u = a*ma[0] + b*mb[0] + c*mc[0];
      var v = a*ma[1] + b*mb[1] + c*mc[1]
      var mapping = [u, v];
      var remove = false;
      var stripe = 0.02;
      var point = {u: u, v: v};
      var bool = this.detect(point)
      // console.log({ bool: bool })
      return bool;
      // if ( Math.sqrt((u-0.5)^2 + (v-0.5)^2) < 0.3 ) {
      //   console.log({u: u, v: v})
      //   return true;
        // for (var i=-200; i<200; i++) {
        //   if (i%2 == 0) continue;
        //   var l = stripe*i;
        //   var h = stripe*(i+1);
        //   if (l < u && u < h && l < v && v < h) {
        //     console.log('hit')
        //     return true;
        //   }
        // }
      // }
    }
  }
  return false;
}

module.exports = Geometry;