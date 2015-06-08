var net = require('net')
var fs = require('fs')

function loadFile(filename) {
  var fileSize = fs.statSync(filename).size
  var buf = new Buffer(fileSize)
  var fd = fs.openSync(filename, 'r')
  fs.readSync(fd, buf, 0, buf.length, 0)
  fs.closeSync(fd)
  return buf
}

function slowWrite(socket, buf, time) {
  if (buf.length == 0) {
    return
  }
  socket.write(buf.slice(0, 1))
  setTimeout(slowWrite, time, socket, buf.slice(1), time)
}

var server = net.createServer(function(c) {
  console.log('client connected')
  c.on('end', function() {
    console.log('client disconnected')
  })

  var buf = loadFile('set_response.packet')
  c.write(buf)

  buf = loadFile('get_response.packet')
  slowWrite(c, buf, 1000)
})

server.listen(8124, function() {
  console.log('server bound')
})
