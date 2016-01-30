
var fs = require('fs');
var path = require('path');
var http = require('http');
var route = require('koa-route');
var views = require('co-views');
var serve = require('koa-static');
var parser = require('koa-bodyparser');
var koa = require('koa');

var app = koa();
var server = http.createServer(app.callback());
var port = process.env.PORT || 3000;

app.use(serve('.'));
app.use(parser({
  strict: false,
  jsonLimit: '500mb'
}));
app.use( function *(next) {
  this.render = views('views', {
    map: { html: 'swig' },
  });
  yield next;
});
app.use(route.get('/', index));
app.use(route.get('/favicon.ico', null));
app.use(route.get('/:id', show));
app.use(route.post('/save', save));

function *index() {
  this.body = yield this.render('index');
}
function *show(id) {
  this.body = yield this.render(id)
}
function *save() {
  console.log(this.request);
  console.log(this.request.body);
  var json = JSON.stringify(this.request.body);

  fs.writeFileSync('hoge.json', json, 'utf8')

}

app.listen(port);

module.exports = app;
