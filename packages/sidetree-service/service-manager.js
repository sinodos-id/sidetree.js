const { methodSwitch } = require('./sidetree-methods');
const { nodeConfiguration } = require('./config');

class SidetreeServiceManager {
  constructor() {
    this.sidetree = null;
  }

  async init() {
    if (this.sidetree) return this.sidetree;
    
    console.log('🚀 [service] Initializing Sidetree service...');
    console.log('🚀 [service] Using DID Method:', nodeConfiguration.didMethodName);
    
    const method = await methodSwitch(nodeConfiguration.didMethodName)(
      nodeConfiguration
    );
    
    console.log('🚀 [service] Sidetree service initialized successfully.');
    this.sidetree = method;
    return method;
  }

  async shutdown() {
    if (this.sidetree?.method?.shutdown) {
      await this.sidetree.method.shutdown();
    }
  }
}

module.exports = { SidetreeServiceManager };