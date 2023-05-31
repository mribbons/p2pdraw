import fs from 'socket:fs/promises'
import enableSocketReload from "socket:reload"
import { Peer } from 'socket:peer'
import { randomBytes } from 'socket:crypto'
import process from 'socket:process'
import os from 'socket:os'
import Buffer from 'socket:buffer'
import application from 'socket:application'

let logElem = document.getElementById('logPre')

const log = (...args) => {
  for (let arg of args) {
    let out = arg
    if (typeof arg !== 'string') out = JSON.stringify(arg)
    console.log(arg)
    if (logElem) 
    {
      logElem.innerText += out + '\n'
      if (logElem.innerText.length > 100000) {
        logElem.innerText = logElem.innerText.substring(65536)
      }
    }
  }

  document.scrollingElement.scrollTo(0, document.scrollingElement.scrollHeight)
}

log('app starting')

const makeId = async () => {
  // return (await sha256(randomBytes(32))).toString('hex')
  return (await Peer.createClusterId())
}

window.addEventListener('load', async () => {
  window.addEventListener("keyup", (event) => {
    if (event.isComposing) {
      return;
    }

    if (event.key === 'c') connect()
    if (event.key === 'v') netTestServer()
    if (event.key === 'b') netTestClient()
    if (event.key === 'n') netTestClientSend()
    if (event.key === 'm') netTestClear()
    // if (event.key === 'b') sscBuildOutput(process.cwd())
  })

  enableSocketReload({startDir: process.cwd(),
    liveReload: true,
    serviceId: window.__args.config.meta_bundle_identifier,
    secret: process.env.RELOAD_SECRET,
    serverHost: process.env.RELOAD_HOST || "127.0.0.1",
    serverPort: process.env.RELOAD_PORT || 9990,
    // if server is already running, or address can't be bound because it's not on this machine
    // then reload operation will fall back to running as a client
    runServer: true,
    updateCallback: async () => {
      log(`files changed.`)
      window.location.reload()
    },
    scanInterval: 3000,
    debounce: 500,
    debounceCallback: async () => {
      log(`updates inbound, closing network`);
    },
    // log: log,
    packetLength: 1024
  })

})

// test port hardcoded

const connect = async() => {
  try {
    const clusterId = '1bf4140ffd12900e23aa6419b121713e898c58079b6565ab52b35e88a3b0729b'; // await makeId()
    const keys = await Peer.createKeys()
    let previousId = ''
    // const publicKeyHex = await makeId()
    // const privateKeyHex = await makeId()

    var home = process.env.HOME || process.env.HOMEDIR || process.homedir();

    // var home = Path.dirname(process.argv[0]);
    var suffix = ""
    if (process.argv.find((v) => { return v === '--from-ssc' }))
    {
      suffix = "_ssc"
    }

    const pathname = `${home}/p2pdraw${suffix}.json`;
    log(`config path: ${pathname}`);
    let save_config = true
    try {
      let data = JSON.parse(await fs.readFile(pathname))
      keys.publicKey = Buffer.from(data.publicKey, 'hex').buffer
      keys.privateKey = Buffer.from(data.privateKey, 'hex').buffer
      save_config = false
      log(`read config: ${pathname}`)
    } catch {

    }

    if (save_config) {
      log(`saved config: ${pathname}`)
      let data = {}
      // data.publicKey = Buffer.from(keys.publicKey, 'hex').buffer;
      data.publicKey = Buffer.from(keys.publicKey).toString('hex');
      data.privateKey = Buffer.from(keys.privateKey).toString('hex');
      fs.writeFile(pathname, JSON.stringify(data));
    }

    log(`clusterId: ${clusterId}`);
    log(`keys: ${JSON.stringify(keys)}`)
    const publicKey = Buffer.from(keys.publicKey).toString('hex')
    const privateKey = Buffer.from(keys.privateKey).toString('hex')

    // const publicKey = Buffer.from(publicKeyHex, 'hex').buffer
    // const privateKey = Buffer.from(privateKeyHex, 'hex').buffer

    // let peerId = await makeId()
    let peerId = publicKey;
    // peerId = "666333" + peerId.substring(-6);

    const peer = new Peer({ peerId, ...keys, clusterId })
    window.peer = peer
    log('created peer')

    const canvas = document.getElementsByTagName('canvas')[0]
    if (!canvas) {
      log(`unable to get canvas...`);
      return;
    }

    const context = canvas.getContext('2d')

    const setSize = () => {
      canvas.width = window.innerWidth - 30
      canvas.height = window.innerHeight - 30
    }

    setSize()
    window.addEventListener('resize', setSize)

    let isDrawing = false
    let x = 0
    let y = 0

    function drawLine(context, color, x1, y1, x2, y2) {
      context.beginPath()
      context.strokeStyle = color
      context.lineWidth = 1
      context.moveTo(x1, y1)
      context.lineTo(x2, y2)
      context.stroke()
      context.closePath()
    }

    const network = await peer.join()
    log(`joining...`);
    log(`join returned: ${network.peerId}`);
    const connect_time = new Date().getTime();

    const getOffset = e => {
      if (e.offsetX) return { offsetX: e.offsetX, offsetY: e.offsetY }
      if (!e.targetTouches[0]) return { offsetX: 0, offsetY: 0 }

      const rect = e.target.getBoundingClientRect()

      return {
        offsetX: e.changedTouches[0]?.pageX - rect.left,
        offsetY: e.changedTouches[0]?.pageY - rect.top
      }
    }

    const penDown = e => {
      isDrawing = true
      const o = getOffset(e)
      x = o.offsetX
      y = o.offsetY
    }

    const penUp = e => {
      if (!isDrawing) return
      const o = getOffset(e)
      if (o.offsetX <= 0) return
      if (o.offsetY <= 0) return

      drawLine(context, 'black', x, y, o.offsetX, o.offsetY)
      x = o.offsetX
      y = o.offsetY
      isDrawing = false
    }

    const penMove = e => {
      if (!isDrawing) return
      const o = getOffset(e)
      drawLine(context, 'black', x, y, o.offsetX, o.offsetY)
      const value = { x1: x, y1: y, x2: o.offsetX, y2: o.offsetY }
      const data = new Buffer.from(JSON.stringify(value))

      if (o.offsetX > 0) x = o.offsetX
      if (o.offsetY > 0) y = o.offsetY

      sendData(data);
    }    

    const sendData = async data => {
      const packetOpts = {
        previousId: previousId,
        clusterId: clusterId,
        to: publicKey,
        // to: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        message: {
          peerId: publicKey,
          content: data,
          ts: Date.now()
        }
      }

      log(`send data: ${JSON.stringify(packetOpts)}`);
      // cache packets locally
      
      const packets = await network.publish(packetOpts)
      packets.forEach(p => 
        {
          previousId = p.packetId
        })
    }

    canvas.addEventListener('touchstart', penDown)
    canvas.addEventListener('mousedown', penDown)

    canvas.addEventListener('touchend', penUp)
    canvas.addEventListener('mouseup', penUp)

    canvas.addEventListener('touchmove', penMove)
    canvas.addEventListener('mousemove', penMove)

    network.onConnection = (...args) => {
      log(`network.onConnect: ${JSON.stringify(args)}`);
      log(network.peerId, network.address, network.port, 'CONNECT', ...args)
    }

    network.onPacket = async (packet, port, address) => {
      const message = JSON.parse(packet.message)
      // log(`onPacket, timestamp: ${message.ts}`);
    //   log(`on packet: ${address}: ${JSON.stringify(packet)}`)
    //   // data = Buffer.from(packet.message.content).toString()
    //   // log(`data: ${data}`);
    //   log(`content: ${packet.message.content}`)
    //   const message = JSON.parse(packet.message)
      const data = Buffer.from(message.content).toString()

      // draw the line to distinguish if 
      // a) we're getting an event of our own packets at a reliable rate (so they are being recorded) 
      // b) this event ever fires for external packets
      var color = packet.message.peerId == peerId ? 'green' : 'blue';

      try {
        const { x1, y1, x2, y2 } = JSON.parse(data)
        drawLine(context, color, x1+3, y1+3, x2+3, y2+3)
      } catch (err) {
        log(err)
      }
    }

    network.onData = (packet, port, address, data1) => {

      if (packet.clusterId != clusterId)
        return

      if (packet.message.peerId == peerId && packet.message.ts > connect_time) {
        // log(`ignoring new message from self: ${new DateTime(packet.timestamp.message.ts).toISOString()}`)
        return
      }

      let packetdate = `Invalid: ${packet.message.ts || packet.timestamp}`;
      try {
        packetdate = new Date(packet.message.ts || packet.timestamp).toISOString()
      } catch {}

      // log(`onData: ${JSON.stringify(packet)} (${packetdate})`)
      // log(`from: ${address}, data: ${JSON.stringify(data)}`)
      // if (packet.type) return

      // log(`peers: ${network.peers.length}`)
      // const dataJson = Buffer.from(data).toString()
      // log(`data json: ${dataJson}`)
      // const data3 = JSON.parse(dataJson)
      // log(`data 3: ${JSON.stringify(data3)}`)

      // const message = JSON.parse(packet.message)
      try {
        if (!packet.message.content) {
          // log(`packet without content: ${JSON.stringify(packet)} (${packetdate})`)
        } else {
          const data = Buffer.from(packet.message.content).toString()
          // log(`data: ${JSON.stringify(data)}`)
          const { x1, y1, x2, y2 } = JSON.parse(data)
          drawLine(context, 'red', x1, y1, x2, y2)
        }
      } catch (err) {
        log(err)
      }
    }

    // window.onunload = async () => {
    //   network.close()
    // }
    window.addEventListener("unload", async () => {
      network.close()
    })
  } catch (e) {
    log(e);
  }
}

const try_catch = async (fn) => {
  try {
    await fn()
  } catch (e) {
    log(e.message + '\n' + e.stack)
  }
}
