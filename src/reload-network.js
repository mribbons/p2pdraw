import fs from 'socket:fs/promises'
import dgram from 'socket:dgram'
import Buffer from 'socket:buffer'
import { getRandomValues } from 'socket:crypto'
import { recvBuff, sendBuff, PACKET_TYPE_SEND_START, PACKET_TYPE_DATA, recvPacket, processConformantPacket } from './dgram_xfer.js'

export const reloadServer = async (address, port, opts) => {
  return new Promise((resolve, reject) => {
  var con = new DgramConnection(address, port, opts)  
  con.opts = opts || {}
  con.listen((e) => {
    if (e) {
      return reject(e)
    }
    resolve(con)
  })
  })
}

export const reloadClient = async (address, port, opts) => {
  return new Promise((resolve, reject) => {
  var con = new DgramConnection(address, port, opts)
  con.opts = opts || {}
  con.connect((e) => {
    if (e) {
      return reject(e)
    }
    con.lastPacket = new Date().getTime()
    resolve(con)
  })
  })
}

class DgramConnection {
  constructor (address, port, opts) {
    this.address = address
    this.port = port
    this.listening = false
    this.log = opts.log || this.log
    this.type = opts.type || 'udp4'
    this.clients = {}
    this.xfers = {}
    this.xferBufs = []
    this.ids = {}
    this.serverIds = {}
    this.lastPacket = 0
  }

  uniqRand32 = () => {
    let tmp = new Uint32Array(1)
    getRandomValues(tmp)
    while (true) {
      let id = tmp[0]
      if (this.ids[id] === undefined) {
        this.ids[id] = null
        return id
      }
    }
  }

  async listen(cb) {
    this.socket = await dgram.createSocket('udp4').bind(this.port, this.address, cb)
    this.socket.on('message', async (data, {port, address}) => { 
      this.serverMesssage(data, {port, address}) }
    )
    this.listening = true

    this.pingLoopHandle = setInterval(() => {
      this.pingLoop()
    }, 1000)
  }

  async connect(cb) {
    // this.socket = dgram.createSocket('udp4', cb)
    this.socket = await dgram.createSocket('udp4').bind(0, cb)
    await this.socket.on('message', async (data, {port, address}) => { this.clientMessage (data, {port, address}) })
    await this.send("SUB")
  }

  async serverMesssage (data, {port, address}) {
    await this.addClient(data, {port, address})

    processConformantPacket(data, {port, address}, (data, {port, address}, packetType, xfer_id) => {
      if (this.xfers[xfer_id] === undefined)
        return

      recvPacket(this.xferBufs[xfer_id], this.xfers[xfer_id], data)
    })
  }

  async sendBuffer(buffer, client) {
    this.log(`sending buffer to ${JSON.stringify(client)}`)

    sendBuff(this.uniqRand32(), this.socket, client.address, client.port, buffer, null, (xfer) => {this.recvDone(xfer)}, { /*log: this.log, */ packetLength: this.opts.packetLength })
      .then((xfer) => {
        this.xfers[xfer.id] = xfer
        this.xferBufs[xfer.id] = buffer
      })
  }

  async clientMessage (data, {port, address}) {
    await this.addClient(data, {port, address})

    processConformantPacket(data, {port, address}, async (data, {port, address}, packetType, xfer_id) => {
      if (packetType === PACKET_TYPE_SEND_START) {
        if (this.serverIds[xfer_id] !== undefined) {
          this.log(`server already tried to intiate, ignoring`)
          return
        }

        this.serverIds[xfer_id] = null
        this.log(`server initiating connection`)
        let [ xfer, buf ] = await recvBuff(this.uniqRand32(), this.socket, data, address, port, (xfer) => {this.recvProgress(xfer)}, (xfer) => {this.recvDone(xfer)}, { /*log: this.log*/ packetLength: this.opts.packetLength })
        this.xfers[xfer.id] = xfer
        this.xferBufs[xfer.id] = buf
        // server -> client id lookup
        this.serverIds[xfer_id] = xfer.id
        this.pingLoopHandle = setInterval(() => {
          this.pingLoop()
        }, 1000)
      } else if (packetType === PACKET_TYPE_DATA) {
        // todo(mribbons): check xfer id, address, port match
        if (this.xfers[this.serverIds[xfer_id]] !== undefined) {
          let xfer = this.xfers[this.serverIds[xfer_id]]
          let buffer = this.xferBufs[this.serverIds[xfer_id]]
          this.lastPacket = new Date().getTime()
          recvPacket(buffer, xfer, data)
        }
      }
    })
  }

  async pingLoop() {
    Object.keys(this.xfers).forEach(key => {
      let xfer = this.xfers[key]
      if (xfer.xferedBytes < this.xferBufs[key].byteLength)
        this.logProcess(xfer)
    })
  }

  logProcess(xfer) {
    this.rate = 0
      let now = new Date().getTime()
      if (xfer.lastXferedBytes) {
        this.rate = Math.round(((xfer.xferedBytes - xfer.lastXferedBytes) / (1024 * 8) * 10000) / (now - xfer.lastNow))/100
      }
      let pc = Math.round(xfer.xferedBytes * 1000 / xfer.size) / 10
      this.log(`xfer ${xfer.id.toString().padStart(10)} ${pc.toFixed(1).padStart(5)}%, rate: ${this.rate.toFixed(1).toString().padStart(5)} Mbps, ${xfer.xferedPackets}/${xfer.dataPacketCount}`)
      xfer.lastXferedBytes = xfer.xferedBytes
      xfer.lastNow = now
  }

  async addClient(message, {port, address}) {
    let clientKey = `${address}:${port}`
    if (!this.clients[clientKey] && Buffer.from(message).toString() === 'SUB') {
      this.clients[clientKey] = {
        port, address, ts: new Date().getTime(), state: ''
      }
      this.log(`client connected: ${JSON.stringify(this.clients[clientKey])}`)

      this.sub && this.sub.call(this, this.clients[clientKey])
    }

    if (message.length === 4 && Buffer.from(message).toString() === 'dump') {
      this.dump()
    }
  }

  async send(data, ...args) {
    try {
      if (!this.listening) args = [this.port, this.address, ...args]
      await this.socket.send(data, ...args)
    } catch (err) {
      return err
    }
  }

  async disconnect() {
    // if (this.pingLoopHandle !== undefined) clearInterval(this.pingLoopHandle)

    if (this.listening) {
      try {
        await this.socket.close()
      } catch (e) {
        console.log(`server close failed: ${e.message + '\n' + e.stack}`)      }
      
      try {
        await this.socket.disconnect()
      } catch (e) {
        console.log(`server disconnect failed: ${e.message + '\n' + e.stack}`)
      }
    } else {
      try {
        await this.socket.disconnect()
      } catch (e) {
        console.log(`client disconnect failed: ${e.message}`)
      }
    }
  }

  async recvProgress(xfer) {
    // this.log(`receive progress: ${xfer.xferedBytes / xfer.size}`)
  }

  async recvDone(xfer) {
    this.logProcess(xfer)
    this.log(`xfer done! ${xfer.tag}`)
    clearInterval(xfer._handle)
    clearTimeout(xfer._handle)

    if (!this.listening)
      clearInterval(this.pingLoopHandle)

    if (xfer.tag !== 'server') {
      try {
        fs.writeFile(`test.dat`, this.xferBufs[xfer.id])
      } catch (e) {
        this.log(`recvDone write error: ${e.message + '\n' + e.stack}`)
      }
      this.log(`receive done: ${xfer.id}`)
      
      delete this.xferBufs[xfer.id]
      delete this.xfers[xfer.id]
      delete this.ids[xfer.id]
    }
  }
}