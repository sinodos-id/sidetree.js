import DownloadManager from '@sidetree/core/src/DownloadManager';
import CasIpfs from '@sidetree/cas-ipfs/src/IpfsCas';

describe('DownloadManager', () => {
  it('should download a file from IPFS', async () => {
    const cas = new CasIpfs('http://127.0.0.1:5001');
    const downloadManager = new DownloadManager(1, cas);
    downloadManager.start();
    const contentHash = 'QmbcmBQkTASq3vMfAHYFU1S6HcXuEaXR8Qmn8Ak13yzmNj';
    const result = await downloadManager.download(contentHash, 1000000);
    console.log(result);
    expect(result.code).toEqual('success');
    downloadManager.stop();
  }, 30000);
});
