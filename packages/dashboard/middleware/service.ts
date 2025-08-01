import registerService from './registerService';

import { methodSwitch } from './sidetree';

import { nodeConfiguration } from '../config';

class SidetreeServiceManager {
  private static _instance: SidetreeServiceManager;
  private sidetree: any;

  private constructor() {
    this.sidetree = this.init();
  }

  public async init() {
    console.log('🚀 [service] Initializing Sidetree service...');
    console.log('🚀 [service] Using DID Method:', nodeConfiguration.didMethodName);
    const method = await methodSwitch(nodeConfiguration.didMethodName)(
      nodeConfiguration
    );
    console.log('🚀 [service] Sidetree service initialized successfully.');
    return method;
  }

  async shutdown() {
    await this.sidetree.method.shutdown();
  }

  public static get Instance() {
    return this._instance || (this._instance = new this());
  }
}

const singleton = registerService('services', () => {
  const instance = SidetreeServiceManager.Instance;
  return instance;
});

export default singleton;
