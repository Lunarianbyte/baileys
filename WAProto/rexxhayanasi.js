const proto = {
  ...require('./AICommon/AICommon').AICommon, 
  ...require('./Ephemeral/Ephemeral').Ephemeral
}
module.exports = {
  proto
}