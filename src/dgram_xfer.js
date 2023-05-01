import dgram from 'socket:dgram'
import Buffer from 'socket:buffer'

// id - uint64
export class Xfer {
  constructor(id, buffer, dataSize) {
    this._id = id
    this._buffer = buffer;
    this._dataSize = dataSize
    this._dataPacketCount = Math.ceil(buffer.byteLength / dataSize)
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
  openStatus = null;
  statusList = []
  get handle() { return this._handle }
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
let packetLength = 1492

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
    if (k != `buffer`) {
      out[k] = packet[k]
    } else {
      out[k] = `[ /* stripped */ ]`
    }
  })
  return out
}

// todo, tune
let ackTimeout = 1000

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

export const recvBuff = async (socket, buffer, progressCallback, completedCallback, opts) => {
  opts = parseOpts(opts)
  // make a new xfer

  // how does callee init buffer without knowing length
  // probably want to asynchronously init file, otherwise large file space reservation takes a long time, should be receiving stream during that time
  // Fake stuff, not implemented properly yet
  let statusList = socket;
  let headerPacket = decodePacket(statusList[0][0])

  let dataLength = packetLength - packetHeaderLength(sendDataPacketOps)
  log(`receive send start: ${JSON.stringify(headerPacket)}, data length: ${dataLength})`)
  var b = Buffer.allocUnsafe(headerPacket.totalSize)
  for (let x = 1; x <= headerPacket.count; ++x) {
    let dataPacket = decodePacket(statusList[x][0])
    var testHash = hashBuffer(dataPacket.buffer, 0, dataPacket.buffer.byteLength)
    log(`incoming data packet: ${JSON.stringify(stripBuffer(dataPacket))}: hash === ${testHash === dataPacket.hash}`)
    // log(`incoming data: ${hexDump(dataPacket.buffer)}`)
    dataPacket.buffer.copy(b, dataPacket.index * dataLength)
    dataPacket.buffer.byteLength
  }
  return b
}

export const sendBuff = async (socket, address, port, buffer, progressCallback, completedCallback, opts) => {

  // todo - handle resend
  // resend packets if no response after a certain time
  // have to use same packet, so client knows to ignore resends that have already arrived
  // packets should be acked, either by entire hash for control packets, or data hash for data packets
  // if packets not acked, resend existing packets, don't send new ones
  // client should be able to ack multiple packets in a single packet

  opts = parseOpts(opts);
  let xfer = new Xfer(1234, buffer, packetLength - packetHeaderLength(sendDataPacketOps))
  xfer.address = address
  xfer.port = port
  xfer.progressCallback = progressCallback
  xfer.completedCallback = completedCallback
  xfer.ackTimeout = ackTimeout
  xfer.socket = socket

  log(`xfer packets: ${xfer.dataPacketCount}`)
  try {
    let { packet: startPacket, encoded } = buildSendStartPacket(xfer, buffer)
    log(`startPacket: ${JSON.stringify(startPacket)}`)
    log(`${hexDump(encoded)}`)
    xfer.statusList.push([encoded, startPacket, hashBuffer(encoded), new Date().getTime()])
    xfer.socket.send(encoded, xfer.port, xfer.address)
    // send first round of data packets before adding start packet to status list, otherwise ack check will be performed
    await sendLoop(buffer, xfer)
  } catch (e) {
    log(e.message + '\n' + e.stack)
  }

  xfer._handle = setTimeout( () => sendLoop(buffer, xfer), 1050 );

  return xfer
}

const sendLoop = async (buffer, xfer) => {
  let now = new Date().getTime()
  // let remove = []
  xfer.statusList.forEach((status, i) => {
    let [encoded, packet, hash, ts] = status
    if (now - ts > xfer.ackTimeout) {
      log(`waiting for ack: ${packet.type} ${hash}, ${now - ts}`)
      xfer.socket.send(encoded, xfer.port, xfer.address)
      status[3] = now
    } else {
      // don't remove until ackd
      // remove.push(i)
    }
  })

  // for (let x = remove.length-1; x > -1; x--) {
  //   xfer.statusList.splice(remove[x], 1)
  // }
  
  for (let x = 0; x < xfer.dataPacketCount; x++) {
    let status
    if (xfer.statusList.length < 3) {
      let { packet: dataPacket, encoded: encodedData } = await buildSendDataPacket(xfer, buffer, x)
      log(`dataPacket: ${JSON.stringify(stripBuffer(dataPacket))}`)
      // log(`${hexDump(encodedData)}`)
      status = [encodedData, dataPacket, dataPacket.hash, new Date().getTime()]
      xfer.socket.send(encodedData, xfer.port, xfer.address)
      xfer.statusList.push(status)
    } else {
      break;
    }
  }

  // settimeout
}

export const PACKET_TYPE_SEND_START = 1
export const PACKET_TYPE_DATA = 2

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
  u64:    [ (b, o) => { return parseInt(b.readBigUInt64LE(o)) } , (b, o, v) => { return b.writeBigUInt64LE(BigInt(v), o) }],
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

const sendStartPacketOps = [
  // control type - transmit start
  [ u8,   'type'      ],
  // sequence
  [ u8,   'seq'       ],
  // xfer id
  [ u64,  'id'        ],
  // 4  - total size
  [ u64,  'totalSize' ],
  // 4  - packet count
  [ u64,   'count'    ]
  // - packet size is derived (last packet calculated by total size % packet count)
]

const sendDataPacketOps = [
  [ u8,     'type'    ],
  [ u64,    'id'      ],
  [ u64,    'index'   ],
  [ u32,    'hash'    ],
  [ BUFFER, 'buffer'  ]
]

const packetTypeTable = []
packetTypeTable[PACKET_TYPE_SEND_START] = sendStartPacketOps
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
  if (packetOps[0][1] !== 'type') {
    throw `Packet Operation set doesn't start with type: ${JSON.stringify(packetOps)}`
  }
  let buf = Buffer.allocUnsafe(packetHeaderLength(packetOps) + (p.dataLength !== undefined ? p.dataLength : 0))
  log(`build packet size: ${buf.byteLength}`)
  let offset = 0
  for (let op of packetOps) {
    if (p[op[PKT_FIELD]] === undefined) {
      throw `ERROR: ${op[PKT_FIELD]} is undefined.`
    }
    // call the function for DATA_TYPE, passing it the buffer and the packet field at PKT_FIELD
    let old_offset = offset
    if (op[DATA_TYPE] === BUFFER) {
      offset = bufferIOFuncs[op[DATA_TYPE]][W](buf, offset, p[op[PKT_FIELD]], p.position, p.dataLength)
      log(`offset ${old_offset} += ${p.dataLength} = ${offset}`)
    } else {
      log(`write ${DATA_TYPE}: ${p[op[PKT_FIELD]]}`)
      offset = bufferIOFuncs[op[DATA_TYPE]][W](buf, offset, p[op[PKT_FIELD]])
      log(`offset ${old_offset} += ${bufferLengths[op[DATA_TYPE]]} = ${offset}`)
    }
  }

  return buf
}

export const peekPacket = (buf) => {
  return bufferIOFuncs[u8][R](buf, 0)
}

const decodePacket = (buf) => {
  let packetOps = packetTypeTable[peekPacket(buf)]
  if (!packetOps) {
    throw `Unhandled packet type: ${peekPacket(buf)}`
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

const buildSendStartPacket = (xfer, buffer) => {
  var packet = {
    type: PACKET_TYPE_SEND_START,
    id: xfer.id,
    seq: xfer.nextSeq,
    totalSize: buffer.byteLength,
    count: xfer.dataPacketCount
  }

  return { packet: packet, encoded: encodePacket(sendStartPacketOps, packet) }
}

const readSendStartPacket = (buffer) => {
  return decodePacket(sendStartPacketOps, buffer) 
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
      let byte = buf.readUInt8(i);
      hash = (hash << 5) - hash + byte;
      hash = hash & 0xffff; // Convert to 32bit integer
  }
  return hash; 
}