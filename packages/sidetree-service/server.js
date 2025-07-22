const http = require('http');
const url = require('url');

const { SidetreeServiceManager } = require('./service-manager');
const { convertSidetreeStatusToHttpStatus } = require('./utils');

let serviceManager;

async function initializeService() {
  if (!serviceManager) {
    serviceManager = new SidetreeServiceManager();
    await serviceManager.init();
  }
  return serviceManager;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  try {
    // Initialize service (singleton pattern like your original)
    const service = await initializeService();
    const sidetree = await service.sidetree;

    if (method === 'GET' && path.startsWith('/did/')) {
      const did = path.split('/')[2];
      const { body } = await sidetree.handleResolveRequest(did);
      
      res.statusCode = body.code === 'did_not_found' ? 404 : 200;
      res.end(JSON.stringify(body));
      return;
    }

    if (method === 'POST' && path === '/operations') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        // Handle both string and object like your original
        let reqBody = body;
        if (typeof reqBody === 'object') {
          reqBody = JSON.stringify(reqBody);
        }
        const operation = Buffer.from(reqBody);
        const { status, body: responseBody } = await sidetree.handleOperationRequest(operation);
        res.statusCode = convertSidetreeStatusToHttpStatus(status);
        res.end(JSON.stringify(responseBody));
      });
      return;
    }

    if (method === 'GET' && path.startsWith('/operations/')) {
      const didUniqueSuffix = path.split('/')[2];
      const result = await sidetree.getOperations(didUniqueSuffix);
      const operations = result.operations.map(op => 
        JSON.parse(op.operationBuffer.toString())
      );
      const did = `did:${sidetree.versionManager.config.didMethodName}:${didUniqueSuffix}`;
      res.statusCode = 200;
      res.end(JSON.stringify({ did, operations }));
      return;
    }

    if (method === 'GET' && path === '/transactions') {
      const results = await sidetree.getTransactions();
      res.statusCode = 200;
      res.end(JSON.stringify(results));
      return;
    }

    if (method === 'GET' && path === '/version') {
      const { body } = await sidetree.handleGetVersionRequest();
      res.statusCode = 200;
      res.end(body);
      return;
    }

    // Health check
    if (method === 'GET' && path === '/health') {
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error('Server error:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: error.message }));
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down Sidetree service...');
  if (serviceManager) {
    await serviceManager.shutdown();
  }
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Sidetree service running on port ${PORT}`);
});