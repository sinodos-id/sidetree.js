// Your nodeConfiguration - adapted for Docker networking
const nodeConfiguration = {
    contentAddressableStoreServiceUri: process.env.IPFS_URL || "/ip4/127.0.0.1/tcp/5001",
    databaseName: process.env.DB_NAME || "quarkid-test-test",
    didMethodName: process.env.DID_METHOD || "quarkid",
    ethereumRpcUrl: process.env.ETHEREUM_RPC || "http://localhost:8545",
    mongoDbConnectionString: process.env.MONGO_URL || "mongodb://localhost:27017/",
    batchingIntervalInSeconds: 5,
    observingIntervalInSeconds: 5,
    maxConcurrentDownloads: 20,
    versions: [{ startingBlockchainTime: 0, version: "latest" }],
    ethereumRpcUrl: 'https://rpc.ankr.com/zksync_era',
    ethereumPrivateKey: 'a0ef4815f8f927e0d87d4d482b5120366618f11ffa80abc6ec58ac1e23f57f58',
    elementAnchorContract: '0xe0055B74422Bec15cB1625792C4aA0beDcC61AA7',
  };
  
  module.exports = { nodeConfiguration };