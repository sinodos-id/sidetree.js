import service from './service';
import authenticate from './authenticate';

const middleware = (handler: any) => async (req: any, res: any) => {
  console.log('🚀 [middleware] Received request for:', req.url);
  await authenticate(req, res);
  if (!req.client.server.service) {
    req.client.server.service = service;
  }
  return handler(req, res);
};

export default middleware;
