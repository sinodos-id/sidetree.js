// Replace `nextjs-github-pages` with your Github repo project name.
const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  productionBrowserSourceMaps: true,
  reactStrictMode: true,
  // Use the prefix in production and not development.
  assetPrefix: isProd ? '' : '',
  transpilePackages: [
    '@sidetree/cas',
    '@sidetree/cas-ipfs',
    '@sidetree/common',
    '@sidetree/core',
    '@sidetree/crypto',
    '@sidetree/db',
    '@sidetree/did-method',
    '@sidetree/element',
    '@sidetree/ethereum',
    '@sidetree/photon',
    '@sidetree/wallet',
    '@sidetree/quarkid',
  ],
  // https://nextjs.org/docs/messages/import-esm-externals
  experimental: { esmExternals: 'loose', outputFileTracing: true },
  // see https://github.com/vercel/vercel/issues/2569#issuecomment-514865342
  webpack(config, { isServer }) {
    if (isServer) {
      config.resolve.mainFields = ['module', 'main'];
      // Fix all packages that this change breaks:
      config.resolve.alias['node-fetch'] = 'node-fetch/lib/index.js';
      const [nextJsExternals] = config.externals;
      config.externals = [
        (context, request, callback) => {
          // Ignore electron, it is referenced in cas-ipfs/node_modules/electron-fetch
          const IGNORES = ['electron'];
          if (IGNORES.indexOf(request) >= 0) {
            return callback(null, "require('" + request + "')");
          }
          nextJsExternals(context, request, callback);
        },
      ];
    }
    return config;
  },
};