import os from 'socket:os'
import fs from 'socket:fs/promises'

let enabled = false;
let _interval = null;
let _lastUpdate = 0;
let _signalFile = undefined;

const enableAppRefresh = (enable) => {
  if (enable === undefined) {
    enable = true
  }

  if (enabled === enable)
    return

  if (enable) {
    switch (os.platform()) {
      case 'win32': _signalFile = 'AppxManifest.xml'; break
      default:
        console.log(`warning: _signalFile not defined for ${os.platform()}`)
    }
    
    console.log(`enableAppRefresh: ${enabled}, _signalFile: ${_signalFile}`)

    _interval = setInterval(checkRefresh, _signalFile === undefined ? 30000 : 500)
    enabled = true;
    _lastUpdate = new Date().getTime()
  } else {
    clearInterval(_interval)
    enabled = false;
  }
}

const checkRefresh = async () => {
  // console.log(`last update: ${_lastUpdate}`)

  if (_signalFile === undefined)
    window.location.reload()

  try {
    var stat = await fs.stat(_signalFile)
    // console.log(`stat: ${JSON.stringify(stat)}`);
    stat.mtimeMs > _lastUpdate && window.location.reload();
  } catch (e) {

  }
}

export default enableAppRefresh