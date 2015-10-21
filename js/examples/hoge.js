
Physijs.scripts.worker = '/bower_components/physijs/physijs_worker.js';
Physijs.scripts.ammo = '/bower_components/physijs/examples/js/ammo.js';

var initScene, initEventHandling, render, createTower,
    renderer, render_stats, physics_stats, scene, dir_light, am_light, camera,
    table, blocks = [], table_material, block_material, intersect_plane,
    selected = null, mouse_position = new THREE.Vector3, block_offset = new THREE.Vector3, _i, _v3 = new THREE.Vector3;

var controls;
var draggable;
var hover;

initScene = function() {
  renderer = new THREE.WebGLRenderer( { antialias: true } );
  renderer.setClearColor( 0xf0f0f0 );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.shadowMap.enabled = true;
  document.getElementById('viewport').appendChild(renderer.domElement);


  render_stats = new Stats();
  render_stats.domElement.style.position = 'absolute';
  render_stats.domElement.style.top = '1px';
  render_stats.domElement.style.zIndex = 100;
  document.getElementById( 'viewport' ).appendChild( render_stats.domElement );

  physics_stats = new Stats();
  physics_stats.domElement.style.position = 'absolute';
  physics_stats.domElement.style.top = '50px';
  physics_stats.domElement.style.zIndex = 100;
  document.getElementById( 'viewport' ).appendChild( physics_stats.domElement );


  scene = new Physijs.Scene({ fixedTimeStep: 1 / 120 });
  scene.setGravity(new THREE.Vector3( 0, -30, 0 ));
  scene.addEventListener(
    'update',
    function() {
      if ( selected !== null ) {
        _v3.copy( mouse_position ).add( block_offset ).sub( selected.position ).multiplyScalar( 5 );
        _v3.y = 0;
        selected.setLinearVelocity( _v3 );

        _v3.set( 0, 0, 0 );
        for ( _i = 0; _i < blocks.length; _i++ ) {
          blocks[_i].applyCentralImpulse( _v3 );
        }
      }
      scene.simulate( undefined, 1 );
      physics_stats.update();
    }
  );

  camera = new THREE.PerspectiveCamera(
    35,
    window.innerWidth / window.innerHeight,
    1,
    1000
  );
  camera.position.set( 25, 20, 25 );
  camera.lookAt(new THREE.Vector3( 0, 7, 0 ));
  scene.add( camera );

  var ambient = new THREE.AmbientLight( 0xf0f0f0 )
  scene.add(ambient);

  dir_light = new THREE.DirectionalLight( 0xFFFFFF );
  dir_light.position.set(0, 50, -5 );
  dir_light.target.position.copy( scene.position );
  dir_light.castShadow = true;
  dir_light.shadowCameraLeft = -30;
  dir_light.shadowCameraTop = -30;
  dir_light.shadowCameraRight = 30;
  dir_light.shadowCameraBottom = 30;
  dir_light.shadowCameraNear = 20;
  dir_light.shadowCameraFar = 200;
  dir_light.shadowBias = -.001
  dir_light.shadowMapWidth = dir_light.shadowMapHeight = 2048;
  dir_light.shadowDarkness = .5;
  scene.add( dir_light );

  var groundMaterial = new Physijs.createMaterial(
    new THREE.MeshBasicMaterial({ color: 0xeeeeee}),
      0.9, // high friction
      0.2 // low restitution
  );
  ground = new Physijs.BoxMesh(
    new THREE.BoxGeometry(50, 1, 50),
    groundMaterial,
    0, // mass
    // { restitution: .2, friction: .8 }
    { restitution: .0, friction: .0 }
  );
  ground.position.y = -.5;
  ground.receiveShadow = true;
  scene.add(ground);

  createTower();

  intersect_plane = new THREE.Mesh(
    new THREE.PlaneGeometry( 150, 150 ),
    new THREE.MeshBasicMaterial({ opacity: 0, transparent: true })
  );
  intersect_plane.rotation.x = Math.PI / -2;
  scene.add(intersect_plane);
  initEventHandling();

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.damping = 0.2;
  controls.addEventListener('change', render);

  var helper = new THREE.GridHelper(20, 1);
  helper.position.y = 0;
  helper.material.opacity = 0.25;
  helper.material.transparent = true;
  scene.add( helper );

  var dragcontrols = new THREE.DragControls(camera, blocks, renderer.domElement); //
  dragcontrols.on( 'hoveron', function( e ) {
    hover = true;
  })
  dragcontrols.on( 'hoveroff', function( e ) {
    if (!draggable) hover = false;
  })


  requestAnimationFrame( render );
  scene.simulate();
};

render = function() {
  requestAnimationFrame( render );
  renderer.render( scene, camera );
  render_stats.update();
};

createTower = (function() {
  var block_length = 6, block_height = 1, block_width = 1.5, block_offset = 2;
  var block_geometry = new THREE.BoxGeometry(2, 2, 2);
  var block_material = Physijs.createMaterial(
    new THREE.MeshBasicMaterial({ color: 0x00ff00 }),
      .4, // medium friction
      .4 // medium restitution
  );
  return function() {
    var block = new Physijs.BoxMesh( block_geometry, block_material );
    block.position.y = 10;
    block.receiveShadow = true;
    block.castShadow = true;
    scene.add( block );
    blocks.push( block );
  }
})();

initEventHandling = (function() {
  var vector = new THREE.Vector3,
      handleMouseDown, handleMouseMove, handleMouseUp;

  handleMouseDown = function(event) {
    if (!hover) return false;
    draggable = true;
    controls.enabled = false;
    var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
    var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
    vector.set(mouseX, mouseY, 1);
    vector.unproject(camera);
    var dir = vector.sub(camera.position).normalize()
    var raycaster = new THREE.Raycaster( camera.position, dir );
    var intersections = raycaster.intersectObjects( blocks );
    if ( intersections.length > 0 ) {
      selected = intersections[0].object;

      vector.set( 0, 0, 0 );
      selected.setAngularFactor( vector );
      selected.setAngularVelocity( vector );
      selected.setLinearFactor( vector );
      selected.setLinearVelocity( vector );
      mouse_position.copy( intersections[0].point );
      block_offset.subVectors( selected.position, mouse_position );

      intersect_plane.position.y = mouse_position.y;
    }
  };

  handleMouseMove = function( event ) {
    if (!hover || !draggable) return false;
    var raycaster, intersection;
    if ( selected !== null ) {
      var mouseX = (event.clientX / window.innerWidth) * 2 - 1;
      var mouseY = -(event.clientY / window.innerHeight) * 2 + 1;
      vector.set(mouseX, mouseY, 1);
      vector.unproject(camera);
      raycaster = new THREE.Raycaster( camera.position, vector.sub( camera.position ).normalize() );
      intersection = raycaster.intersectObject( intersect_plane );
      mouse_position.copy( intersection[0].point );
    }

  };

  handleMouseUp = function( event ) {

    if ( selected !== null ) {
      vector.set( 1, 1, 1 );
      selected.setAngularFactor(vector);
      selected.setLinearFactor(vector);

      selected = null;
      controls.enabled = true;
      draggable = false;
      hover = false;
    }

  };

  return function() {
    renderer.domElement.addEventListener( 'mousedown', handleMouseDown );
    renderer.domElement.addEventListener( 'mousemove', handleMouseMove );
    renderer.domElement.addEventListener( 'mouseup', handleMouseUp );
  };
})();

window.onload = initScene;
