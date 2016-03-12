var objects = [];

var material = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  side: THREE.DoubleSide,
  wireframe: true,
})

function drawSVG (points) {
  console.log('ghoe')
  points = points.map(function(p) { return [(p[1]+1.5)*100, (p[0]+1.5)*100]})
  console.log({ points: points });
  var path = new paper.Path();
  path.strokeColor = 'black';
  for (var i=0; i<points.length; i++) {
    var point = points[i];
    var next = points[(i+1)%points.length];
    path.moveTo(new Point(point[0], point[1]))
    path.lineTo(new Point(next[0], next[1]))
  }
  path.rotate(-90)
  path.closed = true;
  paper.view.draw();

  var d = $(path.exportSVG()).attr('d')
  m = svgMesh3d(d, {
    scale: 10,
    simplify: 0.01,
    randomization: false
  })
  console.log(m)

  complex = reindex(unindex(m.positions, m.cells));
  var geometry = new createGeom(complex)
  var mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh);
  return geometry;
}

var ng = new THREE.Geometry();

function createSvg () {
  loadSvg('/assets/mickey.svg', function (err, svg) {
    console.log(svg);
    var d = $('path', svg).attr('d');
    // var d = "M 120, 120 m -70, 0 a 70,70 0 1,0 150,0 a 70,70 0 1,0 -150,0";
    var m = svgMesh3d(d, {
      scale: 10,
      simplify: 0.1,
      randomization: false
    })

    var complex = reindex(unindex(m.positions, m.cells));
    var geometry = new createGeom(complex)
    geometry.vertices = geometry.vertices.map( function (vertex) {
      vertex.z = size*2;
      return vertex;
    })
    var mesh = new THREE.Mesh(geometry, material)
    mesh.scale.set(0.5, 0.5, 0.5)
    // scene.add(mesh);
    replaceObject(m);
  })
}

function drawObjects () {
  var size = 2;
  var r = 2
  var geometry = new THREE.BoxGeometry(size, size, size, r, r, r)
  mesh = new THREE.Mesh(geometry, material);
  mesh.geometry.verticesNeedUpdate = true;
  mesh.dynamic = true;
  scene.add(mesh);
}

function replaceObject (svgMesh) {
  var positions = svgMesh.positions;
  var geometry = mesh.geometry;
  var vertices = geometry.vertices;
  var faces = geometry.faces;
  positions = positions.map(function (p) {
    return [p[0] * 0.5, p[1] * 0.5]
  })
  paths = []
  var count = 0;
  intersect = []
  for (var i=0; i<faces.length; i++) {
    var face = faces[i];
    var a = vertices[face.a];
    var b = vertices[face.b];
    var c = vertices[face.c];
    if (a.z !== b.z || b.z !== c.z || a.z < 0) {
      var result = addFace(ng, geometry, i)
      ng = result.ng;
      continue;
    }
    var triangle = [
      [a.x, a.y],
      [b.x, b.y],
      [c.x, c.y]
    ]
    points = polygonBoolean(triangle, positions, 'not')[0]

    inner_points = points.filter( function (point) {
      if (point[0] == a.x && point[1] == a.y) return false;
      if (point[0] == b.x && point[1] == b.y) return false;
      if (point[0] == c.x && point[1] == c.y) return false;
      return true;
    })
    for (var j=0; j<inner_points.length; j++) {
      var pp;
      if (j-1 < 0) {
        pp = inner_points[inner_points.length-1]
      } else {
        pp = inner_points[j-1]
      }
      var p = inner_points[j];
      var np = inner_points[(j+1)%inner_points.length]
      // var num = ng.vertices.length;
      // ng.vertices.push(new THREE.Vector3(p[0], p[1], size))
      // ng.vertices.push(new THREE.Vector3(p[0], p[1], size*1.2))
      // ng.vertices.push(new THREE.Vector3(np[0], np[1], size))
      // ng.faces.push(new THREE.Face3(num, num+1, num+2))

      // var num = ng.vertices.length;
      // ng.vertices.push(new THREE.Vector3(p[0], p[1], size))
      // ng.vertices.push(new THREE.Vector3(p[0], p[1], size*1.2))
      // ng.vertices.push(new THREE.Vector3(pp[0], pp[1], size*1.2))
      // ng.faces.push(new THREE.Face3(num, num+1, num+2))
    }

    count++;
    console.log(count)

    if (count < 3) {
      var og = drawSVG(points);
      for (var k=0; k<og.faces.length; k++) {
        var result = addFace(ng, og, k)
        ng = result.ng;
        intersect = _.union(intersect, result.intersect);
      }
      // break;
    }

  }

  computeUniq(ng)

  var bnd = []
  iuniq = intersect.map(function (a) {
    return ng.map[a];
  })
  iuniq = _.uniq(iuniq)
  for (var i=0; i<intersect.length; i++) {
    var id = ng.map[intersect[i]];
    var b = ng.uniq[id];
    // bnd.push(b)
    var e = b.edges.map(function(edge) {
      return iuniq.includes(edge)
    })
    // console.log(e)
  }

  scene.remove(mesh)
  nm = new THREE.Mesh(ng, material);
  nm.geometry.verticesNeedUpdate = true;
  nm.dynamic = true;
  nm.castShadow = true;
  nm.receiveShadow = true;
  scene.add(nm);
}

function addFace (ng, og, fi) {
  var intersect = []
  var face = og.faces[fi];
  var a = og.vertices[face.a];
  var b = og.vertices[face.b];
  var c = og.vertices[face.c];
  var num = ng.vertices.length;
  if (a.z == 0) {
    intersect.push(num)
    a.z = size;
  }
  if (b.z == 0) {
    intersect.push(num+1)
    b.z = size;
  }
  if (c.z == 0) {
    intersect.push(num+2)
    c.z = size;
  }
  ng.vertices.push(a)
  ng.vertices.push(b)
  ng.vertices.push(c)
  ng.faces.push(new THREE.Face3(num, num+1, num+2))
  ng.faceVertexUvs.push()
  return { ng: ng, intersect: intersect };
}

function exportSTL () {
  var exporter = new THREE.STLExporter();
  var stlString = exporter.parse( scene );
  var blob = new Blob([stlString], {type: 'text/plain'});
  saveAs(blob, 'demo.stl');
}

/*
var sign = function (p1, p2, p3) {
  return (p1.x-p3.x)*(p2.y-p3.y)-(p2.x-p3.x)*(p1.y-p3.y);
}
var inTriangle = function (p, a, b, c) {
  var b1 = sign(p, a, b) < 0;
  var b2 = sign(p, b, c) < 0;
  var b3 = sign(p, c, a) < 0;
  return (b1 == b2) && (b2 == b3);
}

var getSVG = function (points) {
  var svg = '';
  for (var i=0; i<points.length-1; i++) {
    svg += "M"+points[i][0]+","+points[i][1]+" ";
    svg += "L"+points[i+1][0]+","+points[i+1][1];
  }
  return svg;
}

var getIntersections = function (line1, line2) {
  var intersect = svgIntersections.intersect;
  var shape = svgIntersections.shape;

  var intersections = intersect(
    shape('line', line1),
    shape('line', line2)
  )
  return intersections.points

}

svg = getSVG(intersect[0])
m = svgMesh3d(svg, {
  scale: 10,
  simplify: 0.1,
  randomization: false
})
console.log(m)
positions = triangles.positions;


  var abc = [a, b, c]
  var index = 0;
  var points = [abc[index]]
  var internal
  for (var j=0; j<positions.length; j++) {
    var p = { x: positions[j][0], y: positions[j][1] };
    if (internal == undefined)
      // initial check
      internal = inTriangle(p, a, b, c);
    var nj = (j+1) % positions.length;
    var np = { x: positions[nj][0], y: positions[nj][1] };

    var shape_line = { x1: p.x, y1: p.y, x2: np.x, y2: np.y };
    var face_line = { x1: abc[index].x, y1: abc[index].y, x2: abc[(index+1)%3].x, y2: abc[(index+1)%3].y };
    var ips = getIntersections(shape_line, face_line)
    console.log(ips)
    if (ips.length == 1) {
      points.push(ips[0])
      internal = !internal
      index++
      if (index > 3) {
        break;
      } else {
        points[abc[index]]
      }
    } else if (ips.length > 1) {
      points.push(ips[0])
      points.push(ips[1])
    }
    if (internal) {
      points.push(np)
    }
  }
  window.points = points;
  var svg = getSVG(points)
  paths.push(svg)
  console.log(points)
  break;
}

var path = paths[0];
var m = svgMesh3d(path, {
  scale: 10,
  simplify: 0.1,
  randomization: false
})
console.log(m)
positions = triangles.positions;
*/