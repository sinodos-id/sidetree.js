const { getTestNodeIntance: testMethod } = require('@sidetree/did-method');
const { getNodeInstance: element } = require('@sidetree/element');
const { getNodeInstance: photon } = require('@sidetree/photon');
const { getNodeInstance: quarkid } = require('@sidetree/quarkid');

const methods = {
  'example:sidetree.testnet': testMethod,
  'elem:ganache': element,
  'elem:ropsten': element,
  'quarkid': quarkid,
  photon,
};

const methodSwitch = (method) => {
  if (methods[method]) {
    return methods[method];
  }
  throw new Error('Unsupported method: ' + method);
};

module.exports = { methodSwitch };