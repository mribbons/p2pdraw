import fs from 'socket:fs/promises'
import dgram from 'socket:dgram'
import Buffer from 'socket:buffer'
import { getRandomValues } from 'socket:crypto'
import { recvBuff, sendBuff, PACKET_TYPE_SEND_START, PACKET_TYPE_DATA, recvPacket, processConformantPacket } from './dgram_xfer.js'

export const reloadServer = async (address, port, opts) => {
  return new Promise((resolve, reject) => {
  var con = new DgramConnection(address, port, opts)
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
    con.connect((e) => {
      if (e) {
        return reject(e)
      }
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

  async sendBuffer(buffer, clients) {
    if (!clients) clients = this.clients

    this.log(`sending buffer to ${JSON.stringify(this.clients)}`)

    Object.keys(clients).forEach((clientKey) => {
      sendBuff(this.uniqRand32(), this.socket, clients[clientKey].address, this.clients[clientKey].port, buffer, null, null, { log: this.log })
        .then((xfer) => { 
          xfer.tag = 'server'
          this.xfers[xfer.id] = xfer
          this.xferBufs[xfer.id] = buffer
        })
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
        let [ xfer, buf ] = await recvBuff(this.uniqRand32(), this.socket, data, address, port, (xfer) => {this.recvProgress(xfer)}, (xfer) => {this.recvDone(xfer)}, { log: this.log })
        xfer.tag = 'client'
        this.xfers[xfer.id] = xfer
        this.xferBufs[xfer.id] = buf
        // server -> client id lookup
        this.serverIds[xfer_id] = xfer.id
      } else if (packetType === PACKET_TYPE_DATA) {
        // todo(mribbons): check xfer id, address, port match
        if (this.xfers[this.serverIds[xfer_id]] !== undefined) {
          let xfer = this.xfers[this.serverIds[xfer_id]]
          let buffer = this.xferBufs[this.serverIds[xfer_id]]
          recvPacket(buffer, xfer, data)
        }
      }
    })
  }

  async addClient(message, {port, address}) {
    let clientKey = `${address}:${port}`
    if (!this.clients[clientKey] && Buffer.from(message).toString() === 'SUB') {
      this.clients[clientKey] = {
        port, address, ts: new Date().getTime(), state: ''
      }
      this.log(`client connected: ${JSON.stringify(this.clients[clientKey])}`)
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
    if (this.listening) {
      try {
        await this.socket.close()
      } catch (e) {
        this.log(`server close failed: ${e.message + '\n' + e.stack}`)
      }
      
      try {
        await this.socket.disconnect()
      } catch (e) {
        this.log(`server disconnect failed: ${e.message + '\n' + e.stack}`)
      }
    } else {
      await this.socket.disconnect()
    }
  }

  async recvProgress(xfer) {
    this.log(`receive progress: ${xfer.xferedBytes / xfer.size}`)
  }

  async recvDone(xfer) {
    try {
      fs.writeFile(`test.dat`, this.xferBufs[xfer.id])
    } catch (e) {
      this.log(`recvDone write error: ${e.message + '\n' + e.stack}`)
    }
    this.log(`receive done: ${xfer.id}`)

    // release buffers, xfers, ids
  }
}