var objects = [];

var material = new THREE.MeshBasicMaterial({
  color: 0x00ffff,
  side: THREE.DoubleSide,
  wireframe: true,
})


function drawObjects () {
  // size = 2
  var r = 2
  var geometry = new THREE.BoxGeometry(size, size, size, r, r, r)
  // var geometry = new THREE.CylinderGeometry(size, size, size*2, 30)
  mesh = new THREE.Mesh(geometry, material);
  mesh.geometry.verticesNeedUpdate = true;
  mesh.dynamic = true;
  scene.add(mesh);
}

var ng = new THREE.Geometry();

function createSvg () {
  loadSvg('/public/assets/donald.svg', function (err, svg) {
    var d = $('path', svg).attr('d');
    var d = "M 120, 120 m -70, 0 a 70,70 0 1,0 150,0 a 70,70 0 1,0 -150,0";
    var m = svgMesh3d(d, {
      scale: 10,
      simplify: 1,
      randomization: false
    })

    window.m = m
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

function drawSVG (points) {
  points = points.map(function(p) { return [(p[1]+1.5)*100, (p[0]+1.5)*100]})
  var path = new Path();
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

  // var d = $(path.exportSVG()).attr('d')
  // m = svgMesh3d(d, {
  //   scale: 10,
  //   simplify: 1,
  //   randomization: false
  // })
  // console.log(m)

  // complex = reindex(unindex(m.positions, m.cells));
  // var geometry = new createGeom(complex)
  // var mesh = new THREE.Mesh(geometry, material)
  // scene.add(mesh);
  // return geometry;
}

function replaceObject (svgMesh) {
  var geometry = mesh.geometry;
  var vertices = geometry.vertices;
  var faces = geometry.faces;
  var faceVertexUvs = geometry.faceVertexUvs[0];
  paths = []
  var count = 0;
  intersect = []

  var positions = svgMesh.positions;
  positions = positions.map(function(p) {
    return [(p[1]+1.0)/2, (p[0]+1.0)/2];
  })
  // positions = positions.map(function (p) {
  //   return [p[0] * 0.5, p[1] * 0.5]
  // })
  positions.push(positions[0])
  window.positions = positions;

  for (var i=0; i<faces.length; i++) {
    var face = faces[i];
    var uv = faceVertexUvs[i];
    var normal = face.normal;
    var va = vertices[face.a];
    var vb = vertices[face.b];
    var vc = vertices[face.c];

    // if (normal.y !== 1) {
    //   var result = addFace(ng, geometry, i)
    //   ng = result.ng;
    //   continue;
    // }
    triangle = uv.map( function (v) {
      return [v.x, v.y];
    })
    // triangle.push(triangle[0])
    // // points = ghClip.intersect(triangle, positions)
    points = greinerHormann.diff(triangle, positions)
    if (!points) continue;
    console.log(points)
    // window.hoge = points
    // var nuv = points[0]
    // var nf = Delaunay.triangulate(nuv);
    // for (var j=0; j<nf.length/3; j++) {
    //   var ci = nf[j];
    //   var a = nuv[nf[3*j]]
    //   var b = nuv[nf[3*j+1]]
    //   var c = nuv[nf[3*j+2]]
    //   var num = ng.vertices.length;
    //   ng.vertices.push(new THREE.Vector3(a[0], size, a[1]));
    //   ng.vertices.push(new THREE.Vector3(b[0], size, b[1]));
    //   ng.vertices.push(new THREE.Vector3(c[0], size, c[1]));
    //   ng.faces.push(new THREE.Face3(num, num+1, num+2))
    // }
    // points = polygonBoolean(triangle, positions, 'not')[0]

    /*
    inner_points = points[0].filter( function (p) {
      // remove face vertices
      if (p[0] == uv[0].x && p[1] == uv[0].y) return false;
      if (p[0] == uv[1].x && p[1] == uv[1].y) return false;
      if (p[0] == uv[2].x && p[1] == uv[2].y) return false;
      // return inside(p, triangle);
      return true;
    })

    inner_points = inner_points.map(function (p) {
      var k = 0.1;
      // calculate , b, 1-a-b
      var A = [
        [uv[0].x - uv[2].x, uv[1].x - uv[2].x],
        [uv[0].y - uv[2].y, uv[1].y - uv[2].y]
      ];
      var B = [p[0] - uv[2].x, p[1] - uv[2].y];
      var x = numeric.solve(A, B)
      var a = x[0], b = x[1]
      console.log({ a: a, b: b })
      // convert uv to xyz with a, b, 1-a-b
      var ip = new THREE.Vector3();
      ip.x = a*va.x + b*vb.x + (1-a-b)*vc.x;
      ip.y = a*va.y + b*vb.y + (1-a-b)*vc.y;
      ip.z = a*va.z + b*vb.z + (1-a-b)*vc.z;

      var op = new THREE.Vector3();
      op.x = ip.x + k*normal.x;
      op.y = ip.y + k*normal.y;
      op.z = ip.z + k*normal.z;
      return { p: p, inner: ip, outer: op };
    })

    for (var j=1; j<inner_points.length-1; j++) {
      var p = inner_points[j];
      var np = inner_points[j+1];
      var num = ng.vertices.length;
      // v[i], v'[i], v[i+1]
      ng.vertices.push(p.inner);
      ng.vertices.push(p.outer);
      ng.vertices.push(np.inner);
      ng.faces.push(new THREE.Face3(num, num+1, num+2))

      var num = ng.vertices.length;
      // v'[i], v[i+1], v'[i+1]
      ng.vertices.push(p.outer);
      ng.vertices.push(np.inner);
      ng.vertices.push(np.outer);
      ng.faces.push(new THREE.Face3(num, num+1, num+2))
    }
    */

    // if (inner_points.length > 0) break;
    count++;
    // console.log(count)
    // break
    var og = drawSVG(points[0]);
    // for (var k=0; k<og.faces.length; k++) {
    //   var result = addFace(ng, og, k)
    //   ng = result.ng;
    //   intersect = _.union(intersect, result.intersect);
    // }
  }

  // computeUniq(ng)

  // var bnd = []
  // iuniq = intersect.map(function (a) {
  //   return ng.map[a];
  // })
  // iuniq = _.uniq(iuniq)
  // for (var i=0; i<intersect.length; i++) {
  //   var id = ng.map[intersect[i]];
  //   var b = ng.uniq[id];
  //   // bnd.push(b)
  //   var e = b.edges.map(function(edge) {
  //     return iuniq.includes(edge)
  //   })
  //   // console.log(e)
  // }

  // scene.remove(mesh)
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