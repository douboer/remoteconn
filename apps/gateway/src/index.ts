import { config } from "./config";
import { logger } from "./logger";
import { createGatewayServer } from "./server";

const server = createGatewayServer();

server.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port }, "gateway started");
});
