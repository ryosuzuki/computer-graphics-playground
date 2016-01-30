'use strict'

var request = require('../index')
  , version = require('../lib/helpers').version
  , http = require('http')
  , ForeverAgent = require('forever-agent')
  , tape = require('tape')

var s = http.createServer(function (req, res) {
  res.statusCode = 200
  res.end()
})

tape('setup', function (t) {
  s.listen(6767, function() {
    t.end()
  })
})

function httpAgent (t, options, req) {
  var r = (req || request)(options, function (_err, res, body) {

    t.ok(r.agent instanceof http.Agent, 'is http.Agent')
    t.equal(r.agent.options.keepAlive, true, 'is keepAlive')
    t.equal(Object.keys(r.agent.sockets).length, 1, '1 socket name')

    var name = (typeof r.agent.getName === 'function')
      ? r.agent.getName({port:6767})
      : 'localhost:6767' // node 0.10-
    t.equal(r.agent.sockets[name].length, 1, '1 open socket')

    var socket = r.agent.sockets[name][0]
    socket.on('close', function () {
      t.equal(Object.keys(r.agent.sockets).length, 0, '0 open sockets')
      t.end()
    })
    socket.end()
  })
}

function foreverAgent (t, options, req) {
  var r = (req || request)(options, function (_err, res, body) {

    t.ok(r.agent instanceof ForeverAgent, 'is ForeverAgent')
    t.equal(Object.keys(r.agent.sockets).length, 1, '1 socket name')

    var name = 'localhost:6767' // node 0.10-
    t.equal(r.agent.sockets[name].length, 1, '1 open socket')

    var socket = r.agent.sockets[name][0]
    socket.on('close', function () {
      t.equal(Object.keys(r.agent.sockets[name]).length, 0, '0 open sockets')
      t.end()
    })
    socket.end()
  })
}

// http.Agent

tape('options.agent', function (t) {
  httpAgent(t, {
    uri: 'http://localhost:6767',
    agent: new http.Agent({keepAlive: true})
  })
})

tape('options.agentClass + options.agentOptions', function (t) {
  httpAgent(t, {
    uri: 'http://localhost:6767',
    agentClass: http.Agent,
    agentOptions: {keepAlive: true}
  })
})

// forever-agent

tape('options.forever = true', function (t) {
  var v = version()
  var options = {
    uri: 'http://localhost:6767',
    forever: true
  }

  if (v.major === 0 && v.minor <= 10) {foreverAgent(t, options)}
  else {httpAgent(t, options)}
})

tape('forever() method', function (t) {
  var v = version()
  var options = {
    uri: 'http://localhost:6767'
  }
  var r = request.forever({maxSockets: 1})

  if (v.major === 0 && v.minor <= 10) {foreverAgent(t, options, r)}
  else {httpAgent(t, options, r)}
})

tape('cleanup', function (t) {
  s.close(function() {
    t.end()
  })
})
