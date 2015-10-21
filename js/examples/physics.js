
var container, stats;
var camera, scene, renderer;
var splineHelperObjects = [],
    splineOutline;
var splinePointsLength = 4;
var options;

var geometry = new THREE.BoxGeometry( 20, 20, 20 );

var ARC_SEGMENTS = 200;
var splineMesh;

var splines = {

};
var box;
var boxHelperObjects = [];

var raycaster = new THREE.Raycaster()
var mouse = new THREE.Vector2();
var lane = null
var selection = null
var offset = new THREE.Vector3()
var objects = [];
var ground;
var grid;
var hover = false;
var draggable = false;
var dragging = false;

var vector;
var dir;

var mouse2D;
var projector;
var oldPosition;
var dimention = 'xz';
var point;
var pos;
var selected;
var size = 200;

var renderStats;
var physicsStats;


var world = new CANNON.World();
var timeStep = 1.0 / 60.0;
var scale = 1;
var size = scale;
var boxBody;
var groundBody;
var boxBody;
var cylinderBody;
var selectedBody;
var bodies = [];
var meshes = [];
var draggableMeshes = [];

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 10000);
  camera.position.set(scale*5, scale*5, scale*5)
  scene.add( camera );

  scene.add(new THREE.AmbientLight(0xf0f0f0));
  var light = new THREE.SpotLight(0xffffff, 1.5);
  light.position.set(0, scale*7.5, scale);
  light.castShadow = true;
  light.shadowCameraNear = scale*3;
  light.shadowCameraFar = camera.far;
  light.shadowCameraFov = 70;
  light.shadowBias = -0.000222;
  light.shadowDarkness = 0.25;
  light.shadowMapWidth = 1024;
  light.shadowMapHeight = 1024;
  scene.add(light);
  spotlight = light;

  grid = new THREE.GridHelper(scale*5, scale/2);
  grid.position.y = 0.01;
  grid.material.opacity = 0.25;
  grid.material.transparent = true;
  scene.add(grid);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(0xf0f0f0);
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  document.getElementById('viewport').appendChild( renderer.domElement );

  controls = new THREE.OrbitControls( camera, renderer.domElement );
  controls.damping = 0.2;
  controls.addEventListener( 'change', render );

  stats = new Stats();
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.top = '10px';
  stats.domElement.style.right = '20px';
  stats.domElement.style.zIndex = 100;
  document.getElementById('viewport').appendChild(stats.domElement);
}

function initCannon () {
  world.gravity.set(0, -10, 0);
  world.broadphase = new CANNON.NaiveBroadphase();
  world.solver.iterations = 10;
  world.step(timeStep);
  var groundShape = new CANNON.Plane();
  // var groundShape = new CANNON.Box(new CANNON.Vec3(scale*10, scale*10, 0.1));
  groundBody = new CANNON.Body({ mass: 0 })
  groundBody.addShape(groundShape);
  groundBody.position.y = -scale*0.1;
  groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0),-Math.PI/2);
  groundBody.color = 'gray'
  world.add(groundBody)
  addMesh(groundBody);

  var mass = 100;
  var tableShape = new CANNON.Box(new CANNON.Vec3(scale*3, scale*0.1, scale*3));
  tableBody = new CANNON.Body({ mass: 0 })
  tableBody.addShape(tableShape);
  tableBody.position.set(0, 0, 0);
  tableBody.fixedRotation = true;
  tableBody.updateMassProperties();
  tableBody.color = 'blue'
  world.add(tableBody);
  addMesh(tableBody);

  // var cylinderShape = new CANNON.Cylinder(scale*30, scale*30 , scale*10, 100)
  // cylinderBody = new CANNON.Body({ mass: mass });
  // cylinderBody.position.set(0, 0, 0);
  // cylinderBody.shapes = new THREE.CylinderGeometry(scale*3, scale*3 , scale*0.1, 100);
  // scene.add(cylinder);
  // world.add(cylinderBody);
  // addMesh(cylinderBody, 'red')

  var boxShape = new CANNON.Box(new CANNON.Vec3(scale, scale, scale));
  boxBody = new CANNON.Body({ mass: mass })
  boxBody.addShape(boxShape);
  boxBody.position.set(0, scale*1.1, 0);
  boxBody.fixedRotation = true;
  boxBody.updateMassProperties();
  boxBody.color = 'yellow';
  boxBody.draggable = true;
  world.add(boxBody);
  addMesh(boxBody);

  var selectedShape = new CANNON.Sphere(0.1);
  selectedBody = new CANNON.Body({ mass: 0 });
  selectedBody.addShape(selectedShape);
  selectedBody.collisionFilterGroup = 0;
  selectedBody.collisionFilterMask = 0;
  world.add(selectedBody)

  var dragcontrols = new THREE.DragControls(camera, objects, renderer.domElement);
  dragcontrols.on('hoveron', function (event) {
    console.log('afjoejfoawj')
    hover = true;
  })
  dragcontrols.on('hoveroff', function (event) {
    if (!selected) hover = false;
  })

  document.addEventListener('mousedown', onDocumentMouseDown, false);
  document.addEventListener('mousemove', onDocumentMouseMove, false);
  document.addEventListener('mouseup', onDocumentMouseUp, false);
}

function onDocumentMouseDown (event) {
  if (!hover) return false;
  draggable = true;
  controls.enabled = false;

  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);
  dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);
  var intersects = raycaster.intersectObjects(objects);
  if (intersects.length > 0) {
    selected = intersects[0];
  }
}

function onDocumentMouseMove (event) {
  if (!selected) return false;
  event.preventDefault();

  var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
  var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
  vector = new THREE.Vector3(mouseX, mouseY, 1);
  vector.unproject(camera);
  dir = vector.sub(camera.position).normalize()
  raycaster.set(camera.position, dir);
  var point = raycaster.ray.intersectPlane(new THREE.Plane(groundBody.position));
  var distance = -camera.position.z / dir.z;
  pos = camera.position.clone().add(dir.multiplyScalar(distance));
  if (dimention == 'xz') {
    selectedBody.position.x = point.x;
    selectedBody.position.z = point.z;
  } else if (dimention == 'x') {
    selectedBody.position.x = point.x;
  } else if (dimention == 'y') {
    if (pos.y < scale*1.1) return false;
    selectedBody.position.y = pos.y;
  } else if (dimention == 'z') {
    selectedBody.position.z = point.z;
  }
}

function onDocumentMouseUp (event) {
  controls.enabled = true;
  hover = false;
  selected = undefined;
}

var lastCallTime = 0;
var maxSubSteps = 3;
function updatePhysics(){
  var now = Date.now() / 1000;
  if(!lastCallTime){
    world.step(timeStep);
    lastCallTime = now;
    return;
  }
  var timeSinceLastCall = now - lastCallTime;
  world.step(timeStep, timeSinceLastCall, maxSubSteps);
  lastCallTime = now;

  if (selected) {
    // box.position.copy(selectedBody.position);
    boxBody.position.copy(selectedBody.position);
  } else {
    // box.position.copy(boxBody.position);
    selectedBody.position.copy(boxBody.position);
  }
  updateMeshes();
  // ground.position.copy(groundBody.position)
  // ground.quaternion.copy(groundBody.quaternion)
  // cylinder.position.copy(cylinderBody.position)
}

function animate(){
  requestAnimationFrame(animate);
  updatePhysics();
  render();
  stats.update();
}

function render() {
  controls.update();
  renderer.clear();
  renderer.render(scene, camera);
}

$( function () {
  init();
  initCannon();
  // drawObjects();
  // dragObjects();
  animate();

  $('#init').click( function() {
    selectedBody.position.setZero();
  });
  $('#xz').click( function() {
    dimention = 'xz';
  });
  $('#x').click( function() {
    dimention = 'x';
  });
  $('#y').click( function() {
    dimention = 'y';
  });
  $('#z').click( function() {
    dimention = 'z';
  });
});




function addMesh (body) {
  var mesh;
  if(body instanceof CANNON.Body){
    mesh = shape2mesh(body);
  }
  if(mesh) {
    bodies.push(body);
    meshes.push(mesh);
    body.meshref = mesh;
    body.meshref.meshId = this.bodies.length - 1;
    scene.add(mesh);
  }
  return mesh;
}

function shape2mesh (body) {
  var wireframe = false; // this.settings.renderMode === "wireframe";
  var color = body.color || 'red';
  var draggable = body.draggable || false;
  var obj = new THREE.Object3D();

  var currentMaterial = new THREE.MeshBasicMaterial({ color: color });

  for (var l = 0; l < body.shapes.length; l++) {
    var shape = body.shapes[l];

    var mesh;

    switch(shape.type){

    case CANNON.Shape.types.SPHERE:
      var sphere_geometry = new THREE.SphereGeometry( shape.radius, 8, 8);
      mesh = new THREE.Mesh( sphere_geometry, currentMaterial );
      break;

      /*
  case CANNON.Shape.types.PARTICLE:
  mesh = new THREE.Mesh( this.particleGeo, this.particleMaterial );
  var s = this.settings;
  mesh.scale.set(s.particleSize,s.particleSize,s.particleSize);
  break;
      */

    case CANNON.Shape.types.PLANE:
      var geometry = new THREE.PlaneGeometry(10, 10, 4, 4);
      mesh = new THREE.Object3D();
      var submesh = new THREE.Object3D();
      var ground = new THREE.Mesh( geometry, currentMaterial );
      ground.scale.set(100, 100, 100);
      submesh.add(ground);

      ground.castShadow = true;
      ground.receiveShadow = true;

      mesh.add(submesh);
      break;

    case CANNON.Shape.types.BOX:
      var box_geometry = new THREE.BoxGeometry(  shape.halfExtents.x*2,
             shape.halfExtents.y*2,
             shape.halfExtents.z*2 );
      mesh = new THREE.Mesh( box_geometry, currentMaterial );
      break;

    case CANNON.Shape.types.CONVEXPOLYHEDRON:
      var geo = new THREE.Geometry();

      for (var i = 0; i < shape.vertices.length; i++) {
        var v = shape.vertices[i];
        geo.vertices.push(new THREE.Vector3(v.x, v.y, v.z));
      }

      for(var i=0; i < shape.faces.length; i++){
        var face = shape.faces[i];

        var a = face[0];
        for (var j = 1; j < face.length - 1; j++) {
          var b = face[j];
          var c = face[j + 1];
          geo.faces.push(new THREE.Face3(a, b, c));
        }
      }
      geo.computeBoundingSphere();
      geo.computeFaceNormals();
      mesh = new THREE.Mesh( geo, currentMaterial );
      break;

    case CANNON.Shape.types.HEIGHTFIELD:
      var geometry = new THREE.Geometry();

      var v0 = new CANNON.Vec3();
      var v1 = new CANNON.Vec3();
      var v2 = new CANNON.Vec3();
      for (var xi = 0; xi < shape.data.length - 1; xi++) {
        for (var yi = 0; yi < shape.data[xi].length - 1; yi++) {
          for (var k = 0; k < 2; k++) {
            shape.getConvexTrianglePillar(xi, yi, k===0);
            v0.copy(shape.pillarConvex.vertices[0]);
            v1.copy(shape.pillarConvex.vertices[1]);
            v2.copy(shape.pillarConvex.vertices[2]);
            v0.vadd(shape.pillarOffset, v0);
            v1.vadd(shape.pillarOffset, v1);
            v2.vadd(shape.pillarOffset, v2);
            geometry.vertices.push(
              new THREE.Vector3(v0.x, v0.y, v0.z),
              new THREE.Vector3(v1.x, v1.y, v1.z),
              new THREE.Vector3(v2.x, v2.y, v2.z)
            );
            var i = geometry.vertices.length - 3;
            geometry.faces.push(new THREE.Face3(i, i+1, i+2));
          }
        }
      }
      geometry.computeBoundingSphere();
      geometry.computeFaceNormals();
      mesh = new THREE.Mesh(geometry, currentMaterial);
      break;

    case CANNON.Shape.types.TRIMESH:
      var geometry = new THREE.Geometry();

      var v0 = new CANNON.Vec3();
      var v1 = new CANNON.Vec3();
      var v2 = new CANNON.Vec3();
      for (var i = 0; i < shape.indices.length / 3; i++) {
        shape.getTriangleVertices(i, v0, v1, v2);
        geometry.vertices.push(
          new THREE.Vector3(v0.x, v0.y, v0.z),
          new THREE.Vector3(v1.x, v1.y, v1.z),
          new THREE.Vector3(v2.x, v2.y, v2.z)
        );
        var j = geometry.vertices.length - 3;
        geometry.faces.push(new THREE.Face3(j, j+1, j+2));
      }
      geometry.computeBoundingSphere();
      geometry.computeFaceNormals();
      mesh = new THREE.Mesh(geometry, currentMaterial);
      break;

    default:
      throw "Visual type not recognized: "+shape.type;
    }

    mesh.receiveShadow = true;
    mesh.castShadow = true;
    if(mesh.children){
      for(var i=0; i<mesh.children.length; i++){
        mesh.children[i].castShadow = true;
        mesh.children[i].receiveShadow = true;
        if(mesh.children[i]){
          for(var j=0; j<mesh.children[i].length; j++){
            mesh.children[i].children[j].castShadow = true;
            mesh.children[i].children[j].receiveShadow = true;
          }
        }
      }
    }

    var o = body.shapeOffsets[l];
    var q = body.shapeOrientations[l];
    mesh.position.set(o.x, o.y, o.z);
    mesh.quaternion.set(q.x, q.y, q.z, q.w);

    if (draggable) objects.push(mesh);
    obj.add(mesh);
  }

  return obj;
};





    var settings = this.settings = {
        stepFrequency: 60,
        quatNormalizeSkip: 2,
        quatNormalizeFast: true,
        gx: 0,
        gy: 0,
        gz: 0,
        iterations: 3,
        tolerance: 0.0001,
        k: 1e6,
        d: 3,
        scene: 0,
        paused: false,
        rendermode: "solid",
        constraints: false,
        contacts: false,  // Contact points
        cm2contact: false, // center of mass to contact points
        normals: false, // contact normals
        axes: false, // "local" frame axes
        particleSize: 0.1,
        shadows: false,
        aabbs: false,
        profiling: false,
        maxSubSteps:3
    };


function updateMeshes(){
  var N = bodies.length;

  // Read position data into visuals
  for(var i=0; i<N; i++){
    var b = bodies[i], mesh = meshes[i];
    mesh.position.copy(b.position);
    if(b.quaternion){
      mesh.quaternion.copy(b.quaternion);
    }
  }


        // Render contacts
        contactMeshCache.restart();
        if(settings.contacts){
            // if ci is even - use body i, else j
            for(var ci=0; ci < world.contacts.length; ci++){
                for(var ij=0; ij < 2; ij++){
                    var  mesh = contactMeshCache.request(),
                    c = world.contacts[ci],
                    b = ij===0 ? c.bi : c.bj,
                    r = ij===0 ? c.ri : c.rj;
                    mesh.position.set( b.position.x + r.x , b.position.y + r.y , b.position.z + r.z );
                }
            }
        }
        contactMeshCache.hideCached();

        // Lines from center of mass to contact point
        cm2contactMeshCache.restart();
        if(settings.cm2contact){
            for(var ci=0; ci<world.contacts.length; ci++){
                for(var ij=0; ij < 2; ij++){
                    var line = cm2contactMeshCache.request(),
                        c = world.contacts[ci],
                        b = ij===0 ? c.bi : c.bj,
                        r = ij===0 ? c.ri : c.rj;
                    line.scale.set( r.x, r.y, r.z);
                    makeSureNotZero(line.scale);
                    line.position.copy(b.position);
                }
            }
        }
        cm2contactMeshCache.hideCached();

        distanceConstraintMeshCache.restart();
        p2pConstraintMeshCache.restart();
        if(settings.constraints){
            // Lines for distance constraints
            for(var ci=0; ci<world.constraints.length; ci++){
                var c = world.constraints[ci];
                if(!(c instanceof CANNON.DistanceConstraint)){
                    continue;
                }

                var nc = c.equations.normal;

                var bi=nc.bi, bj=nc.bj, line = distanceConstraintMeshCache.request();
                var i=bi.id, j=bj.id;

                // Remember, bj is either a Vec3 or a Body.
                var v;
                if(bj.position){
                    v = bj.position;
                } else {
                    v = bj;
                }
                line.scale.set( v.x-bi.position.x,
                                v.y-bi.position.y,
                                v.z-bi.position.z );
                makeSureNotZero(line.scale);
                line.position.copy(bi.position);
            }


            // Lines for distance constraints
            for(var ci=0; ci<world.constraints.length; ci++){
                var c = world.constraints[ci];
                if(!(c instanceof CANNON.PointToPointConstraint)){
                    continue;
                }
                var n = c.equations.normal;
                var bi=n.bi, bj=n.bj, relLine1 = p2pConstraintMeshCache.request(), relLine2 = p2pConstraintMeshCache.request(), diffLine = p2pConstraintMeshCache.request();
                var i=bi.id, j=bj.id;

                relLine1.scale.set( n.ri.x, n.ri.y, n.ri.z );
                relLine2.scale.set( n.rj.x, n.rj.y, n.rj.z );
                diffLine.scale.set( -n.penetrationVec.x, -n.penetrationVec.y, -n.penetrationVec.z );
                makeSureNotZero(relLine1.scale);
                makeSureNotZero(relLine2.scale);
                makeSureNotZero(diffLine.scale);
                relLine1.position.copy(bi.position);
                relLine2.position.copy(bj.position);
                n.bj.position.vadd(n.rj,diffLine.position);
            }
        }
        p2pConstraintMeshCache.hideCached();
        distanceConstraintMeshCache.hideCached();

        // Normal lines
        normalMeshCache.restart();
        if(settings.normals){
            for(var ci=0; ci<world.contacts.length; ci++){
                var c = world.contacts[ci];
                var bi=c.bi, bj=c.bj, line=normalMeshCache.request();
                var i=bi.id, j=bj.id;
                var n = c.ni;
                var b = bi;
                line.scale.set(n.x,n.y,n.z);
                makeSureNotZero(line.scale);
                line.position.copy(b.position);
                c.ri.vadd(line.position,line.position);
            }
        }
        normalMeshCache.hideCached();

        // Frame axes for each body
        axesMeshCache.restart();
        if(settings.axes){
            for(var bi=0; bi<bodies.length; bi++){
                var b = bodies[bi], mesh=axesMeshCache.request();
                mesh.position.copy(b.position);
                if(b.quaternion){
                    mesh.quaternion.copy(b.quaternion);
                }
            }
        }
        axesMeshCache.hideCached();

        // AABBs
        bboxMeshCache.restart();
        if(settings.aabbs){
            for(var i=0; i<bodies.length; i++){
                var b = bodies[i];
                if(b.computeAABB){

                    if(b.aabbNeedsUpdate){
                        b.computeAABB();
                    }

                    // Todo: cap the infinite AABB to scene AABB, for now just dont render
                    if( isFinite(b.aabb.lowerBound.x) &&
                        isFinite(b.aabb.lowerBound.y) &&
                        isFinite(b.aabb.lowerBound.z) &&
                        isFinite(b.aabb.upperBound.x) &&
                        isFinite(b.aabb.upperBound.y) &&
                        isFinite(b.aabb.upperBound.z) &&
                        b.aabb.lowerBound.x - b.aabb.upperBound.x != 0 &&
                        b.aabb.lowerBound.y - b.aabb.upperBound.y != 0 &&
                        b.aabb.lowerBound.z - b.aabb.upperBound.z != 0){
                            var mesh = bboxMeshCache.request();
                            mesh.scale.set( b.aabb.lowerBound.x - b.aabb.upperBound.x,
                                            b.aabb.lowerBound.y - b.aabb.upperBound.y,
                                            b.aabb.lowerBound.z - b.aabb.upperBound.z);
                            mesh.position.set(  (b.aabb.lowerBound.x + b.aabb.upperBound.x)*0.5,
                                                (b.aabb.lowerBound.y + b.aabb.upperBound.y)*0.5,
                                                (b.aabb.lowerBound.z + b.aabb.upperBound.z)*0.5);
                        }
                }
            }
        }
        bboxMeshCache.hideCached();

}








var materialColor = 'brown'

    // Geometry caches
    var contactMeshCache = new GeometryCache(function(){
        return new THREE.Mesh( three_contactpoint_geo, contactDotMaterial );
    });
    var cm2contactMeshCache = new GeometryCache(function(){
        var geometry = new THREE.Geometry();
        geometry.vertices.push(new THREE.Vector3(0,0,0));
        geometry.vertices.push(new THREE.Vector3(1,1,1));
        return new THREE.Line( geometry, new THREE.LineBasicMaterial( { color: 0xff0000 } ) );
    });
    var bboxGeometry = new THREE.BoxGeometry(1,1,1);
    var bboxMaterial = new THREE.MeshBasicMaterial({
        color: materialColor,
        wireframe: true
    });
    var bboxMeshCache = new GeometryCache(function(){
        return new THREE.Mesh(bboxGeometry,bboxMaterial);
    });
    var distanceConstraintMeshCache = new GeometryCache(function(){
        var geometry = new THREE.Geometry();
        geometry.vertices.push(new THREE.Vector3(0,0,0));
        geometry.vertices.push(new THREE.Vector3(1,1,1));
        return new THREE.Line( geometry, new THREE.LineBasicMaterial( { color: 0xff0000 } ) );
    });
    var p2pConstraintMeshCache = new GeometryCache(function(){
        var geometry = new THREE.Geometry();
        geometry.vertices.push(new THREE.Vector3(0,0,0));
        geometry.vertices.push(new THREE.Vector3(1,1,1));
        return new THREE.Line( geometry, new THREE.LineBasicMaterial( { color: 0xff0000 } ) );
    });
    var normalMeshCache = new GeometryCache(function(){
        var geometry = new THREE.Geometry();
        geometry.vertices.push(new THREE.Vector3(0,0,0));
        geometry.vertices.push(new THREE.Vector3(1,1,1));
        return new THREE.Line( geometry, new THREE.LineBasicMaterial({color:0x00ff00}));
    });
    var axesMeshCache = new GeometryCache(function(){
        var mesh = new THREE.Object3D();
        //mesh.useQuaternion = true;
        var origin = new THREE.Vector3(0,0,0);
        var gX = new THREE.Geometry();
        var gY = new THREE.Geometry();
        var gZ = new THREE.Geometry();
        gX.vertices.push(origin);
        gY.vertices.push(origin);
        gZ.vertices.push(origin);
        gX.vertices.push(new THREE.Vector3(1,0,0));
        gY.vertices.push(new THREE.Vector3(0,1,0));
        gZ.vertices.push(new THREE.Vector3(0,0,1));
        var lineX = new THREE.Line( gX, new THREE.LineBasicMaterial({color:0xff0000}));
        var lineY = new THREE.Line( gY, new THREE.LineBasicMaterial({color:0x00ff00}));
        var lineZ = new THREE.Line( gZ, new THREE.LineBasicMaterial({color:0x0000ff}));
        mesh.add(lineX);
        mesh.add(lineY);
        mesh.add(lineZ);
        return mesh;
    });
    function restartGeometryCaches(){
        contactMeshCache.restart();
        contactMeshCache.hideCached();

        cm2contactMeshCache.restart();
        cm2contactMeshCache.hideCached();

        distanceConstraintMeshCache.restart();
        distanceConstraintMeshCache.hideCached();

        normalMeshCache.restart();
        normalMeshCache.hideCached();
    }



    function GeometryCache(createFunc){
        var that=this, geometries=[], gone=[];
        this.request = function(){
            if(geometries.length){
                geo = geometries.pop();
            } else{
                geo = createFunc();
            }
            scene.add(geo);
            gone.push(geo);
            return geo;
        };

        this.restart = function(){
            while(gone.length){
                geometries.push(gone.pop());
            }
        };

        this.hideCached = function(){
            for(var i=0; i<geometries.length; i++){
                scene.remove(geometries[i]);
            }
        };
    }



