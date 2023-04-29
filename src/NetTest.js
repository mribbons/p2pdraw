import dgram from 'socket:dgram'

export default class NetTest {
  constructor (address, port, _log) {
    this.address = address
    this.port = port
    this.listening = false
    this.log = _log || log
  }

  async listen(cb) {
    this.socket = dgram.createSocket('udp4').bind(this.port, this.address, cb)
    this.listening = true
  }

  async connect(cb) {
    this.socket = dgram.createSocket('udp4')
    this.socket.connect(this.port, this.address, cb)
    //   (err) => {
    //   if (err) return err

    //   this.socket.once('message', cb)
    // })
  }

  async send(data, ...args) {
    try {
    this.socket.send(data, ...args)
    } catch (err) {
      return err
    }
  }

  async disconnect() {
    if (this.listening) {
      try {
        await this.socket.close()
      } catch (e) {
        log(`server close failed: ${e.message + '\n' + e.stack}`)
      }
      
      try {
        await this.socket.disconnect()
      } catch (e) {
        log(`server disconnect failed: ${e.message + '\n' + e.stack}`)
      }
    } else {
      await this.socket.disconnect()
    }
  }
}