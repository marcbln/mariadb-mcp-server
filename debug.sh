#!/usr/bin/env bash
#
# starts inspector
#


set -ex


npm run build
MARIADB_HOST="localhost" MARIADB_PORT="10136" MARIADB_USER="root" MARIADB_PASSWORD="11111" MARIADB_DATABASE="t2" MARIADB_ALLOW_INSERT="true" MARIADB_ALLOW_UPDATE="true" MARIADB_ALLOW_DELETE="true" MARIADB_TIMEOUT_MS="10000" MARIADB_ROW_LIMIT="1000" npx @modelcontextprotocol/inspector@latest ./dist/index.js
