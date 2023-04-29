import fs from 'socket:fs/promises'

import { Peer } from 'socket:peer'
import { randomBytes } from 'socket:crypto'
import process from 'socket:process'
import os from 'socket:os'
import Buffer from 'socket:buffer'
import enableSocketReload from './socket-reload.js'
import application from 'socket:application'
import NetTest from './NetTest.js'
// import fs from 'socket:fs'

let logElem = document.getElementById('logPre')

const log = (...args) => {
  for (let arg of args) {
    let out = arg
    if (typeof arg !== 'string') out = JSON.stringify(arg)
    console.log(arg)    
    logElem && (logElem.innerText += out + '\n')
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

  windowLoad()

  // window.addEventListener("keydown", (event) => {
  //   if(((event.ctrlKey || event.metaKey) && event.key === 'r') || event.key == 'F5') {
  //     event.preventDefault();
  //     window.location.reload();
  //   }
  // })

  // connect()
  // enableAppRefresh({ path: ".\\..\\..\\..\\src" })
  // enableSocketReload({startDir: process.cwd()})


  enableSocketReload({startDir: process.cwd(),
    liveReload: true,
    updateCallback: () => {
      log(`updateCallback ============`)
      window.location.reload()
    },
    scanInterval: 200,
    debounce: 500,
    debounceCallback: () => {
      log(`updates inbound, closing network`);
      netTestClear()
    },
    log: log
  })

  // doesn't work
  log(`open inspector`)
  try {
    let currWindow = await application.getCurrentWindow()
    // todo(@mribbons): errors aren't written to console on windows
    // todo(@mribbons): doesn't work on windows
    await currWindow.showInspector()
    // await currWindow.hide()
    // await currWindow.show()
  } catch (e) {
    log(`error opening inspector ${e.message + '\n' + e.stack}`)
  }
  // var name = Path.win32.dirname('d:\\code\\socket')
  // log(`dirname(\'d:\\code\\socket\'): ${name}`)
  // sscBuildOutput(process.cwd())
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
        // to: publicKey,
        to: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
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


let server = undefined
let twoway = undefined
let server_port=30001

const netTestServer = async () => {
  log(`server listen...`)
  try {
    server = new NetTest('127.0.0.1', server_port, log)
    await server.listen((err) => {
      if (err) log(err)
      else log('server received connection')
    })
    server.socket.on('message', async (data, {port, address}) =>  {
      log(`server received ${data} from ${address}:${port}`)
      // server.send(`ack ${message}`)      
      let e = await server.send(`ack ${data}`, port, address, () => {
        log(`server send done`)
      })
      if (e) {
        log(`server send error: ${e.message + '\n' + e.stack}`)
      } else {
        log(`server send done`)
      }
    })
    // let err = await server.listen((message) => {
    //   log(`server received ${message}`)
    //   server.send(`ack ${message}`)
    // })    
    log(`server listening`)
    twoway = server
  } catch (e) {
    log(`server error: ${e.message + '\n' + e.stack}`)
  }
}

let client = undefined

const netTestClient = async () => {
  log(`client connecting`);
  try {
    client = new NetTest('127.0.0.1', 30001, log)
    await client.connect((e) => {
      if (e) {
        log(`client connect failed: ${e.message + '\n' + e.stack}`)
      } else {
        log(`client connected`)
        twoway = client
      }
    })

    client.socket.on('message', (data, {port, address}) =>  {
      log(`client received ${data}`)
    })
    // let err = await client.connect((message) => {
    //   log(`client received: ${message}`)
    // })
    // if (err) {
    //   log(`client error: ${JSON.stringify(err)}`)
    // } else {
    //   log(`client connected`)
    // }
  } catch (e) {
    log(`client error: ${e.message + '\n' + e.stack}`)
  }
}

const netTestClientSend = async () => {
  try {
    let e = await twoway.send(`Hello it's ${new Date().toISOString()}`)
    if (e) {
      log(`client send error: ${e.message + '\n' + e.stack}`)
    } else {
      log(`client send done`)
    }
  } catch (e) {
    log(`client error: ${e.message + '\n' + e.stack}`)
  }
}

const netTestClear = async () => {
  log(`netTestClear()`)
  let _server = server
  let _client = client
  server = null
  client = null
  try {
    // todo(@mribbons): This doesn't work, can't relisten on same address
    if (_server) await _server.disconnect()
    if (_client) await _client.disconnect()
  } catch (e) {
    log(`net clear error: ${e.message + '\n' + e.stack}`)
  }
}
const windowLoad = async () => {
  log(`window load`);
  
  // setTimeout(androidFileWriteTest, 500)
  window.addEventListener("beforeunload", async () => {
    netTestClear()
  })
}

const androidFileWriteTest = async() => {
  log(`cwd: ${process.cwd()}`)
  try {
    let html = `
    <html>
    <script>
    log('javascript.......')
    </script>
    <body>
    <p>hello</p>
    </body>
    </html>
    `
    await fs.writeFile("test.html", Buffer.from(html).buffer)
    log(`initial location: ${window.location.href}`)
    // let location = `file://${process.cwd()}/test.html`
    let location = `reload:${process.cwd()}/test.html`
    log(`nav to ${location}`)
    window.location.href = location
    // log(`wrote file`);
    // no files in app/files on android
    // for (const entry of (await fs.readdir(`${process.cwd()}`, {withFileTypes: true}))) {
    //   log(`file: ${entry.name}`)
    // }
    // await fs.readFile("test.html")
  } catch (e) {
    log(`file error: ${e.message + '\n' + e.stack}`)
  }
}