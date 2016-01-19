
var totalBoxes = 10;
var xBoxes = 20;
var yBoxes = 10;
var isDrawing = false;
var drawingLine;
var snap = Snap('#svg');
var rectWidth, rectHeight, svgPos;
var animateRunning = true;

// Arduino 1 pin -> Register -> LED -> Arduino GND
// 1 pin ->
// W1 - W60, Z1 - Z60
// X1 - X60, Y1 - Y60
//
// 1P -> LED -> REG -> GND
//
// 1P -(A1-C1)-> LED -(C3-E3)-> REG -(E5-E7)-> -(W9 W11)-> GND
//
// 1P  -> A1
// C1  -> LED
// LED -> C3
// E3  -> REG
// REG -> E5
// E7  -> W9
// W11 -> GND

// var points = [
// 'A1', // *
// 'A1xpin',
// 'C1xpin',
// 'LED', // *
// 'LED', // *
// 'C3xpin',
// 'E3xpin',
// 'REG', // *
// 'REG', // *
// 'E5xpin',
// 'E7xpin',
// 'W9xpin',
// 'W11xpin',
// 'GND' // *
// ]
//
var points = []
var devices = ['A1', 'LED', 'REG', 'GND']
var init;
for (var i=0; i<devices.length-1; i++) {
  var current = devices[i];
  var next = devices[i+1];
  var step = 2;
  if (!init) {
    var start = [1, 1];
  } else {
    var start = [init[0]+step, init[1]];
  }
  var end   = [start[0], start[1]+step];
  init = end;

  points.push(current);
  points.push(convert(start));
  points.push(convert(end));
  if (next == 'GND') {
    points.push(convert([end[1]+step, 100]));
    points.push(convert([end[1]+step*2, 100]));
  }
  points.push(next);
}

function convert(array) {
  var chars = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
  var ch = chars[array[1]-1];
  if (!ch) ch = 'W';
  return ch + array[0] + 'xpin';
}

var dots;
var lines;

var breadboard;
var arduino;

var pos;
var line;


$(function(){

  setup();

  var lx = 0;
  var ly = 0;

  Snap.load("assets/breadboard.svg", function (f) {
    breadboard = f.select("g");
    breadboard.name = 'breadboard';
    breadboard.ox = 0;//50;
    breadboard.oy = 0;//200;
    breadboard.attr({
      "transform": "translate("+breadboard.ox+" "+breadboard.oy+")"
    })
    snap.append(breadboard);
    drawLED();
    drawRegister();
    drawArduino();
    breadboard.drag(moveFnc, startFnc, endFnc);
  });
});

function setup() {
  dots = points.map( function (point) {
    var dot;
    var name;
    if (point.match(/LED|REG/)) {
      name = point;
    } else if (point.match(/xpin/)) {
      name = 'breadboard';
    } else {
      name = 'arduino';
    }
    return { id: '#'+point, name: name };
  })

  lines = [];
  for (var i=0; i<dots.length/2; i++) {
    var start = dots[2*i];
    var end = dots[2*i+1];
    var color = 'gray';
    if (start.name == 'LED' || end.name == 'LED') {
      color = 'red';
    }
    if (start.name == 'REG' || end.name == 'REG') {
      color = 'orange';
    }
    if (start.name == 'arduino' || end.name == 'arduino') {
      color = 'blue';
    }
    lines.push({ start: 2*i, end: 2*i+1, color: color})
  }

}


function drawLED() {
  var led = snap.circle(100, 100, 10);
  led.name = 'LED';
  led.ox = 0;
  led.oy = 0;
  led.attr({
    fill: 'red',
    id: 'LED'
  })
  led.drag(moveFnc, startFnc, endFnc);
}

function drawRegister() {
  var register = snap.rect(50, 80, 20, 10);
  register.name = 'REG';
  register.ox = 0;
  register.oy = 0;
  register.attr({
    fill: 'orange',
    id: 'REG'
  })
  register.drag(moveFnc, startFnc, endFnc);
}

function drawArduino() {
  Snap.load("assets/arduino.svg", function (f) {
    arduino = f.select("g");
    arduino.name = 'arduino';
    arduino.ox = 0;//500;
    arduino.oy = 0;//200;
    arduino.attr({
      "transform": "translate("+arduino.ox+" "+arduino.oy+")"
    })
    snap.append(arduino);
    initPos();
    arduino.drag(moveFnc, startFnc, endFnc);
    snap.zpd({ pan: false });
  });
}


function initPos() {
  dots.forEach( function (dot, index) {
    var bb = Snap(dot.id).getBBox();
    dot.init = { x: bb.cx, y: bb.cy };
    dot.pos  = dot.init;
  });
  drawLines();
}

function updatePos(lx, ly, name) {
  var updates = []
  dots.forEach( function (dot, index) {
    if (dot.name == name) {
      dot.pos = { x: dot.init.x + lx, y: dot.init.y + ly };
      updates.push(index);
    }
  });
  drawLines();
}

function drawLines() {
  lines.forEach( function (line) {
    var start = dots[line.start].pos;
    var end = dots[line.end].pos;
    if (!line.path) {
      var path = snap.line(start.x, start.y, end.x, end.y);
      path.attr({
        'stroke': line.color,
        'stroke-width': 3,
      });
      line.path = path;
    } else {
      line.path.attr({
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y
      });
    }
    dots[line.start].line = line;
    dots[line.end].line = line;
  });
}

function markCells() {
  var cell;
  var path;
  for (var i = 0; i < dots.length; i++) {



    var dot = dots[i]
    var start = { x: dot.start[0], y: dot.start[1] };
    var end   = { x: dot.end[0], y: dot.end[1] }
    var color = dot.color;
    var startId = getElement(dot.start);
    var endId = getElement(dot.end);
    drawLine(startId, endId, color);

    // [x0, y0, x1, y1]
    // 1. [x0, y0, (x0 + x1)/2, y0]
    // 2. [(x0 + x1)/2, y0, (x0 + x1)/2, y1]
    // 3. [(x0 + x1)/2, y1, x1, y1]
  };
  // drawLine2('#GND', '#A30xpin', 'red');
}


function drawLine(startId, endId, color) {
  var start = Snap(startId);
  start.attr({
    'fill': color
  });
  var end   = Snap(endId);
  end.attr({
    'fill': color
  });
  var pos = {
    start: start.getBBox(),
    end: end.getBBox()
  }
  var margin = 0; //4/rectWidth;
  var lines = [
    [pos.start.cx - margin, pos.start.cy, (pos.start.cx + pos.end.cx)/2 + margin, pos.start.cy],
    [(pos.start.cx + pos.end.cx)/2, pos.start.cy - margin, (pos.start.cx + pos.end.cx)/2, pos.end.cy + margin],
    [(pos.start.cx + pos.end.cx)/2 - margin, pos.end.cy, pos.end.cx + margin, pos.end.cy],
  ]
  lines.forEach( function (line, index) {
    var path = snap.polyline( line.map( function (i) {
      return i;
    }));
    breadboard.append(path);
    path.attr({
      'class': 'hoge',
      'stroke': color,
      'stroke-width': 3,
      'pointer-events': 'none'
    });


  });

}

function drawLine2(startId, endId, color, bbox) {
  var start = Snap(startId);
  start.attr({
    'fill': color
  });
  var end   = Snap(endId);
  end.attr({
    'fill': color
  });
  var pos = {
    start: start.getBBox(),
    end: bbox
  }
  var margin = 0; //4/rectWidth;
  var lines = [
    [pos.start.cx - margin, pos.start.cy, (pos.start.cx + pos.end.cx)/2 + margin, pos.start.cy],
    [(pos.start.cx + pos.end.cx)/2, pos.start.cy - margin, (pos.start.cx + pos.end.cx)/2, pos.end.cy + margin],
    // [(pos.start.cx + pos.end.cx)/2 - margin, pos.end.cy, pos.end.cx + margin, pos.end.cy],
    [(pos.start.cx + pos.end.cx)/2 - margin, pos.end.cy, Math.random()*100, Math.random()*100],
  ]
  lines.forEach( function (line, index) {
    var path = arduino.polyline( line.map( function (i) {
      return i;
    }));
    path.attr({
      'stroke': color,
      'stroke-width': 3,
      'pointer-events': 'none'
    });
  });

}




moveFnc = function(dx, dy, x, y) {
  var thisBox = this.getBBox();
  // console.log(thisBox.x, thisBox.y, thisBox);
  lx = dx + this.ox;
  ly = dy + this.oy;
  this.transform('t' + lx + ',' + ly);
  // breadboard.selectAll('.hoge').remove();
  // markCells();
  updatePos(lx, ly, this.name);
  // drawLine2('#GND', '#A30xpin', 'red', thisBox);
}
startFnc = function(x, y, e) {  }
endFnc = function() {
  this.ox = lx;
  this.oy = ly;
  // console.log(this.getBBox());
};



/*
var dots = [{
  id: '#A1xpin',
  name: 'breadboard'
},{
  id: '#B2xpin',
  name: 'breadboard'
},{
  id: '#B4xpin',
  name: 'breadboard'
},{
  id: '#D4xpin',
  name: 'breadboard'
},{
  id: '#E4xpin',
  name: 'breadboard'
},{
  id: '#register',
  name: 'register'
},{
  id: '#register',
  name: 'register'
},{
  id: '#E6xpin',
  name: 'breadboard'
},{
  id: '#D6xpin',
  name: 'breadboard'
},{
  id: '#led',
  name: 'led'
},{
  id: '#led',
  name: 'led'
},{
  id: '#D7xpin',
  name: 'breadboard'
},{
  id: '#G7xpin',
  name: 'breadboard'
},{
  id: '#A9xpin',
  name: 'breadboard'
},{
  id: '#GND',
  name: 'arduino'
},{
  id: '#A9xpin',
  name: 'breadboard'
}];
*/


/*
var lines = [{
  start: 0,
  end  : 1,
  color: 'blue'
},{
  start: 2,
  end  : 3,
  color: 'gray'
},{
  start: 4,
  end  : 5,
  color: 'orange'
},{
  start: 6,
  end  : 7,
  color: 'orange'
},{
  start: 8,
  end  : 9,
  color: 'red'
},{
  start: 10,
  end  : 11,
  color: 'red'
},{
  start: 12,
  end  : 13,
  color: 'blue'
}];

var chars = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
function getElement (pos) {
  return '#' + chars[pos[1]] + pos[0] + 'xpin';
}
*/
