const parseIni = (iniString) => {
  const lines = iniString.split('\n')
  let section = '#top'
  const map = {}

  lines.forEach(line => {
    if (line[line.length - 1] === '\r') {
      line = line.substring(0, line.length - 1)
    }
    if (line.length === 0) {
      // ignore empty line
    } else if (line[0] === ';') {
      // ignore comments
    } else if (line[0] === '[' && line[line.length - 1] === ']') {
      section = `${line.substring(1, line.length - 1)}`
      if (map[section] === undefined) {
        map[section] = {}
      }
    } else {
      let [key, val] = line.split('=')
      key = key.trim()
      map[section][key] = val
    }
  })

  return map
}

export default parseIni
