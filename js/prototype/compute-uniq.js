
function getLaplacian (geometry) {
  console.log('Start getMapping')
  var json = {
    uniq: geometry.uniq,
    faces: geometry.faces,
    map: geometry.map
  };
  $.ajax({
    url: '/get-laplacian',
    type: 'POST',
    datatype: 'JSON',
    data: {
      json: JSON.stringify(json)
    },
    success: function (data) {
      console.log('Get result');
      console.log(data);

      geometry.uniq = data.uniq;
      // uniq = geometry.uniq;

      var uniq = geometry.uniq;
      var map = geometry.map;
      var faces = geometry.faces;

    }
  });
}


function computeUniq (geometry) {
  console.log('Start computeUniq')
  var vertices = geometry.vertices;
  var map = new Array(vertices.length);
  var uniq = [];
  var epsilon = Math.pow(10, -6);
  for (var i=0; i<vertices.length; i++) {
    var vertex = vertices[i];
    var bool = true;
    var index;
    for (var j=0; j<uniq.length; j++) {
      var e = uniq[j];
      if (
        Math.abs(vertex.x - e.vertex.x) < epsilon
        && Math.abs(vertex.y - e.vertex.y) < epsilon
        && Math.abs(vertex.z - e.vertex.z) < epsilon
        // vertex.equals(e.vertex)
      ) {
        bool = false;
        e.index.push(i);
        map[i] = j;
        break;
      }
    }
    if (bool) {
      uniq.push({ index: [i], vertex: vertex, id: uniq.length });
      map[i] = uniq.length-1;
    }
  }
  var faces = geometry.faces;
  var edges = new Array(uniq.length);
  var sides = new Array(uniq.length);
  for (var j=0; j<uniq.length; j++) {
    edges[j] = [];
    sides[j] = [];
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
    sides[a].push(i);
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
    uniq[a].faces = _.uniq(uniq[a].faces);
    uniq[b].faces = _.uniq(uniq[b].faces);
    uniq[c].faces = _.uniq(uniq[c].faces);
  }
  geometry.uniq = uniq;
  geometry.map = map;
  geometry.edges = edges;

  window.uniq = uniq;
  window.map = map;
  window.edges = edges;
  window.faces = geometry.faces;

  console.log('Finish computeUniq')
  return geometry;
}
