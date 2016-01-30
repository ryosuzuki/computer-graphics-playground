'use strict'

var request = require('../index')
  , server = require('./server')
  , tape = require('tape')

var s = server.createServer()

tape('setup', function(t) {
  s.listen(s.port, function() {
    t.end()
  })
})

tape('re-emit formData errors', function(t) {
  s.on('/', function(req, res) {
    res.writeHead(400)
    res.end()
    t.fail('The form-data error did not abort the request.')
  })

  request.post(s.url, function (err, res, body) {
    t.equal(err.message, 'form-data: Arrays are not supported.')
    setTimeout(function() {
      t.end()
    }, 10)
  }).form().append('field', ['value1', 'value2'])
})

tape('omit content-length header if the value is set to NaN', function(t) {

  // returns chunked HTTP response which is streamed to the 2nd HTTP request in the form data
  s.on('/chunky', server.createChunkResponse(
    ['some string',
      'some other string'
    ]))

  // accepts form data request
  s.on('/stream', function(req, resp) {
    req.on('data', function(chunk) {
      // consume the request body
    })
    req.on('end', function() {
      resp.writeHead(200)
      resp.end()
    })
  })

  var sendStreamRequest = function(stream) {
    request.post({
      uri: s.url + '/stream',
      formData: {
        param: stream
      }
    }, function(err, res) {
      t.error(err, 'request failed')
      t.end()
    })
  }

  request.get({
    uri: s.url + '/chunky',
  }).on('response', function(res) {
    sendStreamRequest(res)
  })
})

tape('cleanup', function(t) {
  s.close(function() {
    t.end()
  })
})