import dgram from 'socket:dgram'
import Buffer from 'socket:buffer'

// id - user supplied
export class Xfer {
  constructor(id, buffer, dataSize) {
    this._id = id
    this._buffer = buffer;
    if (dataSize != parseInt(dataSize)) {
      throw Error(`Invalid datasize, non integer: ${dataSize}`)
    }
    this._dataSize = dataSize
    this._dataPacketCount = Math.ceil(buffer.byteLength / dataSize)
    this.packetIndex = -1
    this.xferedPackets = 0
    this.xferedBytes = 0
    this.lastRecvd = new Date().getTime()
  }
  _currSeq = 0;
  get nextSeq () { return this._currSeq++ }
  _id = 0;
  get id () { return this._id }
  _handle = null
  get dataSize() { return this._dataSize }
  _packetSize = packetLength;
  get packetSize() { return this._packetSize }
  get dataPacketCount() { return this._dataPacketCount }
  get size() { return this._buffer.byteLength }
  openStatus = null;
  ackList = []
  statusList = []
  get handle() { return this._handle }

  hashAudit = async () => {
    let report = {
      fullMatch: true,
      blocks: [],
      maxByteTested: 0
    }

    let indexedStatuses = {}
    this.statusList.forEach((s) => indexedStatuses[s[1].index] = s)

    for (let x = 0; x < this.dataPacketCount; ++x) {
      let block = { match: false, status: undefined }
      let status = indexedStatuses[x]
      if (status) {        
        
        block.status = [...status]
        let rehash = hashBuffer(status[1].buffer, 0, status[1].buffer.byteLength)
        let end = status[1].buffer.byteLength // Math.min(index + this.dataSize, this._buffer.byteLength)
        block.status[1].buffer = hexDump(status[1].buffer)
        block.status[1] = JSON.parse(JSON.stringify(stripBuffer(block.status[1])))
        block.sentHash = status[2]
        let index = x * this.dataSize;
        report.maxByteTested = Math.max(report.maxByteTested, end)
        // block.localHash = `${hashBuffer(this._buffer, index, end)}, ${index}, ${end}`
        block.localHash = hashBuffer(this._buffer, index, end)
        block.match = rehash === block.sentHash && block.localHash === block.sentHash
      }
      report.blocks.push(block)
      // report.fullDump = hexDump(this._buffer, 0, this._buffer.byteLength)
      if (!block.match) 
      {
        report.fullMatch = false
        report.totalHash = hashBuffer(this._buffer, 0, this._buffer.byteLength)
        return report
      }
    }

    report.totalHash = hashBuffer(this._buffer, 0, this._buffer.byteLength)
    return report
  }
}

class PacketStatus {
  data = null;
  sendHash = null;
  recvHash = null;
}

/**
 * Receives a `Buffer` over a `Socket`
 * @param {Socket=} socket - `Socket` connection
 * @param {Buffer=} buffer - `Buffer` buffer to receive data
 * @param {async ()=} progressCallback - Progress callback function
 * @param {async ()=} completedCallback - Completed callback function
 * @return {Xfer} `Xfer` reference that can be used for cancelling transfers
 */


let log = () => {}
let hexDumpWidth = 160
let packetLength = 5 * 1024

/**
 * Convert a buffer to a hex dump string
 * @param {Buffer=} buf 
 * @param {number} width - `number` Desired terminal width
 * @return {String} Hex dump string
 */
export const hexDump = (buf, width) => {
  let hex = buf.toString('hex')
  if (!width) {
    width = hexDumpWidth
  }
  let cols = Math.ceil(width/5) - 1
  let col = 0
  let left = ''
  let right = ''
  let output = ''
  for (let x = 0; x < hex.length; x+=2) {
    col += 1
    let lastByte = x == hex.length - 2
    let leftPad = (lastByte ? "".padStart((cols - col) * 3) : '')

    left += hex[x] + hex[x+1] + ' '
    let char = buf[x/2]
    if (char < 32)
      right += '.'
    else
      right += String.fromCharCode(char)

    if (col === cols || lastByte) {
      output += left + leftPad + '  ' + right + '\n'
      left = ''
      right = ''
      col = 0
    }
    
  }

  return output
}
/**
 * Logs data packet without buffer
 */
export const stripBuffer = (packet) => {
  let out = {}
  Object.keys(packet).forEach(k => {
    if (k == `buffer`) {
      out[k] = `[ /* stripped */ ]`
    } else if (typeof packet[k] === 'bigint') {
      out[k] = packet[k].toString()
    } else {
      out[k] = packet[k]
    }
  })
  return out
}

// todo, tune
let ackTimeout = 5000

const parseOpts = (opts) => {
  if (opts) {
    if (opts.log)
    {
      log = opts.log
    }
    if (opts.hexDumpWidth) {
      hexDumpWidth = opts.hexDumpWidth
    }

    if (opts.packetLength) {
      packetLength = opts.packetLength
    }

    if (opts.ackTimeout) {
      ackTimeout = opts.ackTimeout
    }
  }

  return opts
}

const validateFilename = (f) => {
  f = f.replaceAll('"', '').replaceAll('\'', '')
  if (
    f.startsWith('/') ||
    f.startsWith('..') || 
    f.startsWith('..') || 
    f.length > 1 && f.charAt(1) === ':'
  ) {
    throw new Error(`Illegal filename possibly trying to write to external folder: ${f}`)
  }
}

export const recvBuff = async (xferId, socket, encodedStartPacket, address, port, progressCallback, completedCallback, opts) => {
  opts = parseOpts(opts)

  // how does callee init buffer without knowing length
  // probably want to asynchronously init file, otherwise large file space reservation takes a long time, should be receiving stream during that time
  // Fake stuff, not implemented properly yet
  // let ackList = socket;
  // let headerPacket = decodePacket(ackList[0][0])

  if (encodePacket.byteLength - packetHeaderLength(sendStartPacketOps) > 1024)
    throw new Error(`filename exceeds max length ${filename.length} > 1024`)

  let startPacket = decodePacket(encodedStartPacket)
  // TODO(@mribbons): Buffer.allocUnsafe doesn't accept BigInt
  let buffer = Buffer.allocUnsafe(parseInt(startPacket.totalSize))
  let serverPacketLength= Math.ceil(startPacket.totalSize/startPacket.count) + packetHeaderLength(sendDataPacketOps)
  let xfer = new Xfer(xferId, buffer, serverPacketLength - packetHeaderLength(sendDataPacketOps))
  xfer.tag = 'client'
  xfer.filename = startPacket.buffer.toString()
  log(`xfer filename: ${xfer.filename}`)
  validateFilename(xfer.filename)
  xfer.address = address
  xfer.port = port
  xfer.progressCallback = progressCallback || (() => {})
  xfer.completedCallback = completedCallback || (() => {})
  xfer.ackTimeout = ackTimeout
  xfer.socket = socket
  xfer.ackList = [[encodedStartPacket, startPacket, hashBuffer(encodedStartPacket, 0, encodedStartPacket.byteLength), new Date().getTime()]]
  xfer.statusList = new Array(xfer.dataPacketCount)

  xfer._handle = setInterval(() => {
    ackLoop(xfer)
  }, 20);

  return [xfer, buffer]
}

export const recvPacket = (buffer, xfer, packetBuf, packetType) => {
  xfer.lastRecvd = new Date().getTime()
  if (!packetType) {
    packetType = peekPacket(packetBuf)
  }

  if (packetType === PACKET_TYPE_SEND_START) {
    // should try to ack start packets in case server didn't receive ack
    return false
  }

  let dataPacket = decodePacket(packetBuf)
  log(`recv packet: ${JSON.stringify(stripBuffer(dataPacket))}`)

  if (packetType === PACKET_TYPE_ACK) {
    for (let offset = 0; offset < dataPacket.buffer.byteLength; offset += bufferLengths[u32]) {
      let hash = bufferIOFuncs[u32][R](dataPacket.buffer, offset)
      let x = xfer.ackList.findIndex(status => status[2] === hash )
      if (x > -1) {
        // receiver is acking this hash, remove it
        log(`client acked: ${hash}`)
        var status = xfer.ackList.splice(x, 1)
        recordAckdPacket(xfer, status[0])
      } else {
        // this just means packet has already been ackd
        log(`unknown hash being acked: ${hash}, ${JSON.stringify(stripBuffer(dataPacket))}`)
      }
    }
    return true
  }

  if (packetType === PACKET_TYPE_DATA) {
    var testHash = hashBuffer(dataPacket.buffer, 0, dataPacket.buffer.byteLength)
    log(`${xfer.tag}: incoming data packet: ${JSON.stringify(stripBuffer(dataPacket))}: hash === ${testHash === dataPacket.hash}`)
    if (testHash === dataPacket.hash) {
      // todo(@mribbons): check if packet already in status list
      // should always just ack back already received packets in case server didn't receive previous ack
      dataPacket.buffer.copy(buffer, dataPacket.index * xfer.dataSize)
      xfer.ackList.push([packetBuf, dataPacket, testHash, new Date().getTime()])
    }

    return true
  }

  return false
}

export const checkTimeout = (xfer, now) => {
  if (!now) {
    now = new Date().getTime()
  }
  if (now - xfer.lastRecvd > 30000) {
    log(`${xfer.id} connection timed out`)
    clearInterval(xfer._handle)
    xfer.completedCallback(xfer, xfer._buffer)
    return true
  }

  return false
}

export const ackLoop = (xfer) => {
  if (checkTimeout(xfer)) return

  if (xfer.ackList.length === 0) {
    return
  }
  let statuses = xfer.ackList.splice(0, xfer.ackList.length)
  let _offset = 0
  while (true) {
      let { encoded, packet, offet: offset } = buildAckPacket(xfer, statuses[0][1].id, statuses, _offset)
      _offset = offset
      log(`ack loop: o: ${offset}\n${hexDump(encoded)}`)
      xfer.socket.send(encoded, xfer.port, xfer.address)
      if (_offset === statuses.length) {
        break
      }
    }

  statuses.forEach(status => recordAckdPacket(xfer, status))
}

const recordAckdPacket = (xfer, status) => {
  // Transfer can't be marked as completed until acks have been sent, therefore check packet status here
  // todo(@mribbons) - Store list of comleted packets on disk, for performance and resume
  if(xfer.tag === 'server') {
    log(`server record ack ${JSON.stringify(stripBuffer(status[1]))}`)
  }
  var dataPacket = status[1]
  if (dataPacket.type !== PACKET_TYPE_DATA) {
    return
  }

  if (xfer.statusList[status[1].index] === undefined) {
    status[0] = undefined
    xfer.statusList[status[1].index] = status
    // server counts packets on send
    if (xfer.tag !== 'server') {
      xfer.xferedPackets++
      xfer.xferedBytes += dataPacket.buffer.byteLength
    }
    xfer.progressCallback(xfer, dataPacket.index)
    // todo(@mribbons): tags are being set externally, need to differentiate between sender and recipient internally
    if (xfer.tag === 'client' && xfer.xferedBytes == xfer.size) {
      xfer.completedCallback(xfer)
      clearInterval(xfer._handle)
      console.log(`${xfer.tag} transfer completed`)
    }
  } else {
    console.log(`packet already acked: ${status[1].index}`)
  }
}

export const sendBuff = async (xferId, socket, address, port, buffer, filename, progressCallback, completedCallback, opts) => {

  // todo - handle resend
  // resend packets if no response after a certain time
  // have to use same packet, so client knows to ignore resends that have already arrived
  // packets should be acked, either by entire hash for control packets, or data hash for data packets
  // if packets not acked, resend existing packets, don't send new ones
  // client should be able to ack multiple packets in a single packet

  if (!filename) filename = ""

  opts = parseOpts(opts);
  let xfer = new Xfer(xferId, buffer, packetLength - packetHeaderLength(sendDataPacketOps))
  xfer.tag = 'server'
  xfer.filename = filename
  xfer.address = address
  xfer.port = port
  xfer.progressCallback = progressCallback || (() => {})
  xfer.completedCallback = completedCallback || (() => {})
  xfer.ackTimeout = ackTimeout
  xfer.socket = socket

  log(`xfer packets: ${xfer.dataPacketCount}`)
  try {
    let { packet: startPacket, encoded } = buildSendStartPacket(xfer, buffer, filename)
    log(`startPacket: ${JSON.stringify(stripBuffer(startPacket))}`)
    log(`${hexDump(encoded)}`)
    xfer.ackList.push([encoded, startPacket, hashBuffer(encoded, 0, encoded.byteLength), new Date().getTime()])
    xfer.socket.send(encoded, xfer.port, xfer.address)
    // send first round of data packets before adding start packet to status list, otherwise ack check will be performed
    await sendLoop(buffer, xfer)
  } catch (e) {
    log(e.message + '\n' + e.stack)
  }

  xfer._handle = setTimeout( () => sendLoop(buffer, xfer), 20);

  return xfer
}

const sendLoop = async (buffer, xfer) => {
  let now = new Date().getTime()
  if (checkTimeout(xfer, now)) {
    return
  }  
  let waiting = 0
  for (let a = 0; a < xfer.ackList.length; ++a) {
    let status = xfer.ackList[a]
    //let [encoded, packet, hash, ts] = status
    let ts = status[3]
    if (now - ts > xfer.ackTimeout) {
      // console.log(`waiting for ack: ${packet.type} ${hash}, ${now - ts}`)
      // These are being resent, so uncount them
      xfer.socket.send(status[0], xfer.port, xfer.address)
      status[3] = now
      waiting++
    }
  }

  if (waiting > 0)
    console.log(`waiting for ${waiting}/${xfer.ackList.length} acks, sent ${xfer.packetIndex}/${xfer.dataPacketCount}`)
  
  // not sure if sequential packet method is that great, might be ok with bigger status length
  for (let x = Math.max(xfer.packetIndex, 0); x < xfer.dataPacketCount; x++) {
    let status
    if (xfer.ackList.length < 128) {
      let { packet: dataPacket, encoded: encodedData } = await buildSendDataPacket(xfer, buffer, x)
      log(`dataPacket: ${JSON.stringify(stripBuffer(dataPacket))}`)
      // log(`${hexDump(encodedData)}`)
      status = [encodedData, dataPacket, dataPacket.hash, new Date().getTime()]
      xfer.socket.send(encodedData, xfer.port, xfer.address)
      xfer.ackList.push(status)
      xfer.packetIndex = dataPacket.index + 1
      
      xfer.xferedBytes += status[0].byteLength
      xfer.xferedPackets++
    } else {
      break;
    }
  }

  if (xfer.packetIndex < xfer.dataPacketCount || xfer.ackList.length !== 0) {
    xfer._handle = setTimeout( () => sendLoop(buffer, xfer), 20 );
  } else {
    xfer.completedCallback(xfer, xfer._buffer)
    console.log(`${xfer.tag} transfer completed`)
  }
}

export const PACKET_TYPE_SEND_START = 1
export const PACKET_TYPE_ACK = 2
export const PACKET_TYPE_DATA = 3

// each packet type is defined as a table of function pointers that can be used for r/w, this ensures consistency
const R = 0
const W = 1

const u8 = 'u8'
const u32 = 'u32'
const u64 = 'u64'
const BUFFER = 'BUFFER'

const bufferIOFuncs = {
  u8:     [ (b, o) => { return b.readUInt8(o) }                 , (b, o, v) => { return b.writeUint8(v, o) }              ],
  u32:    [ (b, o) => { return b.readUInt32LE(o) }              , (b, o, v) => { return b.writeUint32LE(v, o) }           ],
  u64:    [ (b, o) => { return (b.readBigUInt64LE(o)) } , (b, o, v) => { return b.writeBigUInt64LE(BigInt(v), o) }],
  BUFFER: [ (b, p, l) => {
              // copy from packet buffer to new buffer
              // TODO(@mribbons): This should write directly to the final buffer
              let b2 = Buffer.allocUnsafe(l)
              b.copy(b2, 0, p, p + l)
              return b2
            },
            (b, o, v, p, l) => {
              // b should already be allocated, we just need to copy to it from the source buffer
              return v.copy(b, o, p, p + l)
            }
        ]
}

const bufferLengths = {
  u8:     1,
  u32:    4,
  u64:    8,
  BUFFER: 0 // passed to packet io functions as dataLength
}

// each array element is:
// 0: data type
const DATA_TYPE = 0
// 1: packet field
const PKT_FIELD = 1

// TODO(mribbons): Buffer doesn't support 2gb+, size related types have been changed to u32 instead of u64
const sendStartPacketOps = [
  // control type - transmit start
  [ u8,     'type'      ],
  // xfer id
  [ u32,    'id'        ],
  // sequence
  [ u8,     'seq'       ],
  // 4  - total size
  [ u32,    'totalSize' ],
  // 4  - packet count
  [ u32,    'count'     ],
  // - packet size is derived (last packet calculated by total size % packet count)
  // storing filename in buffer
  [ BUFFER, 'buffer'    ]
]

const ackPacketOps = [
  [ u8,     'type'    ],
  // random packet id
  [ u32,    'id'      ],
  // list of u32 hashes for packets being ack'd
  [ BUFFER,  'buffer' ]
]

const hashType = u32

const sendDataPacketOps = [
  [ u8,       'type'    ],
  // xfer id
  [ u32,      'id'      ],
  [ u32,      'index'   ],
  [ hashType, 'hash'    ],
  [ BUFFER,   'buffer'  ]
]

const packetTypeTable = []
packetTypeTable[PACKET_TYPE_SEND_START] = sendStartPacketOps
packetTypeTable[PACKET_TYPE_ACK]        = ackPacketOps
packetTypeTable[PACKET_TYPE_DATA]       = sendDataPacketOps

const packetHeaderLength = (packetOps) => {
  let len = 0
  for (let op of packetOps) {
    len += bufferLengths[op[DATA_TYPE]]
  }
  return len
}

const encodePacket = (packetOps, p) => {
  // make this a rule
  if (packetOps[0][1] !== 'type' || packetOps[0][0] != u8) {
    throw new Error(`Packet Operation set doesn't start with type/u8: ${JSON.stringify(packetOps)}`)
  }

  if (packetOps[1][1] !== 'id' || packetOps[1][0] != u32) {
    throw new Error(`Packet Operation field 2 not id/u32: ${JSON.stringify(packetOps)}`)
  }

  if (p.buffer && p.dataLength === undefined) {
    throw new Error(`packet.dataLength must be specified when encoding a buffer`)
  }
  if (p.buffer && p.position === undefined) {
    throw new Error(`packet.position must be specified when encoding a buffer`)
  }
  let buf = Buffer.allocUnsafe(packetHeaderLength(packetOps) + (p.dataLength !== undefined ? p.dataLength : 0))
  // log(`build packet size: ${buf.byteLength}`)
  let offset = 0
  for (let op of packetOps) {
    if (p[op[PKT_FIELD]] === undefined) {
      throw new Error(`ERROR: ${op[PKT_FIELD]} is undefined.`)
    }
    // call the function for DATA_TYPE, passing it the buffer and the packet field at PKT_FIELD
    let old_offset = offset
    if (op[DATA_TYPE] === BUFFER) {
      offset = bufferIOFuncs[op[DATA_TYPE]][W](buf, offset, p[op[PKT_FIELD]], p.position, p.dataLength)
      // log(`offset ${old_offset} += ${p.dataLength} = ${offset}`)
    } else {
      // log(`write ${DATA_TYPE}: ${p[op[PKT_FIELD]]}`)
      offset = bufferIOFuncs[op[DATA_TYPE]][W](buf, offset, p[op[PKT_FIELD]])
      // log(`offset ${old_offset} += ${bufferLengths[op[DATA_TYPE]]} = ${offset}`)
    }
  }

  return buf
}

export const peekPacket = (buf) => {
  if (buf.byteLength < bufferLengths[u8])
    return

  let t = bufferIOFuncs[u8][R](buf, 0)

  if (t < 1 || t > packetTypeTable.length)
    return

  return t
}

const typeWithIdSize = bufferLengths[u8] + bufferLengths[u32]
export const peekPacketId = (buf) => {
  if (buf.byteLength < typeWithIdSize)
    return
    
  return bufferIOFuncs[u32][R](buf, bufferLengths[u8])
}

const decodePacket = (buf) => {
  let packetOps = packetTypeTable[peekPacket(buf)]
  if (!packetOps) {
    throw new Error(`Unhandled packet type: ${peekPacket(buf)}`)
  }  
  let p = {}
  let offset = 0
  for (let op of packetOps) {
    if (op[DATA_TYPE] === BUFFER) {      
      p[op[PKT_FIELD]] = bufferIOFuncs[op[DATA_TYPE]][R](buf, offset, buf.byteLength - offset)
      offset = buf.byteLength
    } else {
      p[op[PKT_FIELD]] = bufferIOFuncs[op[DATA_TYPE]][R](buf, offset)
      offset += bufferLengths[op[DATA_TYPE]]
    }
  }
  return p
}

const buildSendStartPacket = (xfer, buffer, filename) => {
  if (filename.length > 1024)
    throw new Error(`filename exceeds max length ${filename.length} > 1024`)

  var packet = {
    type: PACKET_TYPE_SEND_START,
    id: xfer.id,
    seq: xfer.nextSeq,
    totalSize: buffer.byteLength,
    count: xfer.dataPacketCount,
    position: 0,
    buffer: Buffer.from(filename)
  }

  packet.dataLength = packet.buffer.byteLength

  return { packet: packet, encoded: encodePacket(sendStartPacketOps, packet) }
}

const readSendStartPacket = (buffer) => {
  return decodePacket(sendStartPacketOps, buffer) 
}

const buildAckPacket = (xfer, server_xfer_id, ackList, offset) => {
  const hashBytes = bufferLengths[hashType]
  // limit ack packet to dataSize - header
  const maxAcks = Math.min(parseInt(xfer.dataSize / hashBytes) - packetHeaderLength(ackPacketOps) , ackList.length - offset)
  var packet = {
    type: PACKET_TYPE_ACK,
    id: server_xfer_id,
    position: 0,
    dataLength: ackList.length * hashBytes,
    buffer: Buffer.allocUnsafe(maxAcks * hashBytes)
  }

  for (let i = 0; i < maxAcks; ++i)
  {
    let status = ackList[i + offset]
    let hash = status[2]
    log(`buildAckPacket: ${JSON.stringify(stripBuffer(status[1]))}, ${hash}`)
    try {
    bufferIOFuncs[hashType][W](packet.buffer, i * hashBytes, hash)
    } catch (e) {
      // this error is fixed
      console.log(`${i}, ${hashBytes}, ${i * hashBytes}, ${xfer.dataSize}, ${packetHeaderLength(ackPacketOps)}, ${offset}, ${maxAcks}:  ${e.message}\n${e.stack}`)
      return undefined
    }
  }

  return { packet, encoded: encodePacket(ackPacketOps, packet), offet: offset + maxAcks }
}

const buildSendDataPacket = (xfer, buffer, index) => {
  var packet = {
    type: PACKET_TYPE_DATA,
    id: xfer.id,
    index,
    hash: undefined,
    buffer,
    position: index * xfer.dataSize,
    // for the final packet the size is the remaining (mod) bytes, for all other packets, the size is the same
    dataLength: index == xfer.dataPacketCount - 1 ? buffer.byteLength % xfer.dataSize : xfer.dataSize
  }

  packet.hash = hashBuffer(buffer, packet.position, packet.dataLength)
  log(`packet hash: ${packet.hash}`)
  return { packet, encoded: encodePacket(sendDataPacketOps, packet) }
}

export const processConformantPacket = async (data, {port, address}, f) => {
  let id, type
  type = peekPacket(data)
  if (type === undefined) return false
  id = peekPacketId(data)
  if (id === undefined) return false

  return f(data, {port, address}, type, id)
}


/**
 * 
 * @param {*} socket 
 */
const sendPacket = async(socket) => {

}

/**
 * @param {Buffer=} buffer - `Buffer` buffer to receive data
 * @param {number=} start - Start position of data
 * @param {number=} length - Length of data to hash
 * @return {number} hash code of section
*/
const hashBuffer = (buf, start, length) => {
  let hash = 0;
  for (let i = start, len = length; i < start + len; i++) {
      if (i >= buf.byteLength)
        throw Error(`${i} exceeds buffer length ${buf.byteLength}, start: ${start}, length: ${length}`)
      let byte = buf.readUInt8(i);
      hash = (hash << 5) - hash + byte;
      hash = hash & 0xffff; // Convert to 32bit integer
  }
  return hash; 
}