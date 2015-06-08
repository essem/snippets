var assert = require('assert')
var net = require('net')
var fs = require('fs')

// -----------------------------------------------------------------------------

function Packer(maxLen) {
  this.buf = new Buffer(maxLen)
  this.pos = 0
}

Packer.prototype.ui8 = function(v) {
  this.buf.writeUInt8(v, this.pos)
  this.pos += 1
}

Packer.prototype.ui16 = function(v) {
  this.buf.writeUInt16BE(v, this.pos)
  this.pos += 2
}

Packer.prototype.ui32 = function(v) {
  this.buf.writeUInt32BE(v, this.pos)
  this.pos += 4
}

Packer.prototype.str = function(v) {
  this.pos += this.buf.write(v, this.pos)
}

Packer.prototype.finalize = function(v) {
  return this.buf.slice(0, this.pos)
}

// -----------------------------------------------------------------------------

function Unpacker(buf) {
  this.buf = buf
  this.pos = 0
}

Unpacker.prototype.ui8 = function() {
  var v = this.buf.readUInt8(this.pos)
  this.pos += 1
  return v
}

Unpacker.prototype.ui16 = function() {
  var v = this.buf.readUInt16BE(this.pos)
  this.pos += 2
  return v
}

Unpacker.prototype.ui32 = function() {
  var v = this.buf.readUInt32BE(this.pos)
  this.pos += 4
  return v
}

Unpacker.prototype.skip = function(size) {
  this.pos += size
}

Unpacker.prototype.str = function(length) {
  var v = this.buf.toString(v, this.pos, this.pos + length)
  this.pos += length
  return v
}

// -----------------------------------------------------------------------------

function dumpToFile(filename, buf) {
  var fd = fs.openSync(filename, 'w')
  fs.writeSync(fd, buf, 0, buf.length)
  fs.closeSync(fd)
}

// -----------------------------------------------------------------------------

var HEADER_SIZE = 24

function sendSet(client, key, value, flags, expiry) {
  console.log('SET', key, value, flags, expiry)

  var extrasLen = 8
  var p = new Packer(HEADER_SIZE)
  p.ui8(0x80)  // magic
  p.ui8(0x01)  // op code: Set
  p.ui16(key.length) // key length
  p.ui8(extrasLen)  // extras length
  p.ui8(0)  // data type
  p.ui16(0) // reserved
  p.ui32(extrasLen + key.length + value.length) // total body length
  p.ui32(0) // opaque
  p.ui32(0) // cas1
  p.ui32(0) // cas2
  var header = p.finalize()
  assert.equal(header.length, HEADER_SIZE)

  p = new Packer(1024)
  p.ui32(flags) // extras: flags
  p.ui32(expiry) // extras: expiry
  p.str(key) // key
  p.str(value) // value
  var body = p.finalize()

  client.write(header)
  client.write(body)
}

// -----------------------------------------------------------------------------

function sendGet(client, key) {
  console.log('GET', key)

  var extrasLen = 0
  var p = new Packer(HEADER_SIZE)
  p.ui8(0x80)  // magic
  p.ui8(0x00)  // op code: Get
  p.ui16(key.length) // key length
  p.ui8(extrasLen)  // extras length
  p.ui8(0)  // data type
  p.ui16(0) // reserved
  p.ui32(extrasLen + key.length) // total body length
  p.ui32(0) // opaque
  p.ui32(0) // cas1
  p.ui32(0) // cas2
  var header = p.finalize()
  assert.equal(header.length, HEADER_SIZE)

  p = new Packer(1024)
  p.str(key) // key
  var body = p.finalize()

  client.write(header)
  client.write(body)
}

// -----------------------------------------------------------------------------

function sendQuitQ(client) {
  console.log('QUITQ')

  var p = new Packer(HEADER_SIZE)
  p.ui8(0x80)  // magic
  p.ui8(0x17)  // op code: QuitQ
  p.ui16(0) // key length
  p.ui8(0)  // extras length
  p.ui8(0)  // data type
  p.ui16(0) // reserved
  p.ui32(0) // total body length
  p.ui32(0) // opaque
  p.ui32(0) // cas1
  p.ui32(0) // cas2
  var header = p.finalize()
  assert.equal(header.length, HEADER_SIZE)

  client.write(header)
}

// -----------------------------------------------------------------------------

function handlePacket(buf) {
  var header = {}
  var u = new Unpacker(buf)
  header.magic = u.ui8()
  header.opcode = u.ui8()
  header.keyLen = u.ui16()
  header.extrasLen = u.ui8()
  header.dataType = u.ui8()
  header.status = u.ui16()
  header.totalBodyLen = u.ui32()
  header.opaque = u.ui32()
  header.cas1 = u.ui32()
  header.cas2 = u.ui32()

  assert.equal(header.magic, 0x81)
  console.log(header)

  if (header.opcode == 1) {
    //dumpToFile('set_response.packet', buf)

    sendGet(client, 'hello')
  } else if (header.opcode == 0) {
    //dumpToFile('get_response.packet', buf)

    assert.equal(header.extrasLen, 4)
    assert.equal(header.keyLen, 0)

    var body = {}
    body.flags = u.ui32()
    body.value = u.str(header.totalBodyLen - header.extrasLen - header.keyLen)

    console.log(body)

    sendQuitQ(client)
  }
}

var client = net.connect({ port: 11211 }, function() {
  console.log('connected')

  sendSet(client, 'hello', 'world', 0xdeadbeef, 3600)
})

var recvBuf = new Buffer(0)

client.on('data', function(buf) {
  recvBuf = Buffer.concat([recvBuf, buf])
  while (recvBuf.length >= HEADER_SIZE) {
    var bodySize = recvBuf.readUInt32BE(8)
    var packetSize = HEADER_SIZE + bodySize
    if (recvBuf.length < packetSize) {
      break
    }

    var packet = recvBuf.slice(0, packetSize)
    recvBuf = recvBuf.slice(packetSize)
    handlePacket(packet)
  }
})

client.on('end', function() {
  console.log('disconnected')
})  
