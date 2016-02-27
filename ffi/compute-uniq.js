var _ = require('lodash');

function computeUniq (geometry) {
  var vertices = geometry.vertices;
  var map = new Array(vertices.length);
  var uniq = [];
  for (var i=0; i<vertices.length; i++) {
    var vertex = vertices[i];
    var bool = true;
    var index;
    for (var j=0; j<uniq.length; j++) {
      var e = uniq[j];
      if (vertex.equals(e.vertex)) {
        bool = false;
        e.index.push(i);
        map[i] = j;
        break;
      }
    }
    if (bool) {
      uniq.push({ index: [i], vertex: vertex });
      map[i] = uniq.length-1;
    }
  }
  var faces = geometry.faces;
  var edges = new Array(uniq.length);
  for (var j=0; j<uniq.length; j++) {
    edges[j] = [];
  }
  for (var i=0; i<faces.length; i++) {
    var face = faces[i];
    var a = map[face.a];
    var b = map[face.b];
    var c = map[face.c];

    edges[a].push(a)
    edges[a].push(b)
    edges[a].push(c)
    edges[a] = _.uniq(edges[a])
    uniq[a].edges = edges[a];

    edges[b].push(b)
    edges[b].push(a)
    edges[b].push(c)
    edges[b] = _.uniq(edges[b])
    uniq[b].edges = edges[b];

    edges[c].push(c)
    edges[c].push(a)
    edges[c].push(b)
    edges[c] = _.uniq(edges[c]);
    uniq[c].edges = edges[c];

    if (!uniq[a].faces) uniq[a].faces = [];
    if (!uniq[b].faces) uniq[b].faces = [];
    if (!uniq[c].faces) uniq[c].faces = [];
    uniq[a].faces.push(i);
    uniq[b].faces.push(i);
    uniq[c].faces.push(i);
  }
  geometry.uniq = uniq;
  geometry.map = map;
  geometry.edges = edges;

  console.log('Finish computeUniq')
  return geometry;
}

module.exports = computeUniq;
