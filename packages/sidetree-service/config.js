// Your nodeConfiguration - adapted for Docker networking
const nodeConfiguration = {
    contentAddressableStoreServiceUri: process.env.IPFS_URL || "/ip4/127.0.0.1/tcp/5001",
    databaseName: process.env.DB_NAME || "element-test",
    didMethodName: process.env.DID_METHOD || "elem:ropsten",
    ethereumRpcUrl: process.env.ETHEREUM_RPC || "http://localhost:8545",
    mongoDbConnectionString: process.env.MONGO_URL || "mongodb://localhost:27017/",
    batchingIntervalInSeconds: 5,
    observingIntervalInSeconds: 5,
    maxConcurrentDownloads: 20,
    versions: [{ startingBlockchainTime: 0, version: "latest" }]
  };
  
  module.exports = { nodeConfiguration };