import { ZksyncLedger } from '@sidetree/ledger-zksync';
import { IpfsCasWithCache } from '@sidetree/cas-ipfs';
import { MockCas } from '@sidetree/cas';
import Quarkid from './Quarkid';
import { Provider, Wallet } from 'zksync-web3';

export type QuarkidNodeConfigs = {
  contentAddressableStoreServiceUri: string;
  databaseName: string;
  didMethodName: string;
  ethereumRpcUrl: string;
  mongoDbConnectionString: string;
  batchingIntervalInSeconds: number;
  observingIntervalInSeconds: number;
  maxConcurrentDownloads: number;
  versions: [
    {
      startingBlockchainTime: number;
      version: string;
    }
  ];
  elementAnchorContract?: string;
  ethereumMnemonic?: string;
  ethereumPrivateKey?: string;
};

const getLedger = async (quarkidNodeConfigs: QuarkidNodeConfigs) => {
  if (!quarkidNodeConfigs.ethereumPrivateKey) {
    throw new Error('ZKSync requires a private key');
  }
  const provider = new Provider(quarkidNodeConfigs.ethereumRpcUrl);
  const wallet = new Wallet(quarkidNodeConfigs.ethereumPrivateKey, provider);
  const ledger = new ZksyncLedger(
    wallet,
    quarkidNodeConfigs.elementAnchorContract
  );
  await ledger.initialize();
  return ledger;
};

const getTestCas = async () => {
  const cas = new MockCas();
  await cas.initialize();
  return cas;
};

const getCas = async (config: QuarkidNodeConfigs) => {
  const cas = new IpfsCasWithCache(
    config.contentAddressableStoreServiceUri,
    config.mongoDbConnectionString,
    config.databaseName
  );
  await cas.initialize();
  return cas;
};

export const getTestNodeInstance = async (
  quarkidNodeConfigs: QuarkidNodeConfigs
): Promise<Quarkid> => {
  const ledger = await getLedger(quarkidNodeConfigs);
  const cas = await getTestCas();
  const element = new Quarkid(
    quarkidNodeConfigs as any,
    quarkidNodeConfigs.versions,
    cas,
    ledger
  );
  await element.initialize();
  return element;
};

export const getNodeInstance = async (
  quarkidNodeConfigs: QuarkidNodeConfigs
): Promise<Quarkid> => {
  const ledger = await getLedger(quarkidNodeConfigs);
  const cas = await getCas(quarkidNodeConfigs);
  const element = new Quarkid(
    quarkidNodeConfigs as any,
    quarkidNodeConfigs.versions,
    cas,
    ledger
  );
  await element.initialize();
  return element;
};
