# Run pdcli without a local Node install (env-var auth — a container has no OS
# keychain, so pass the token/domain as environment variables):
#   docker run --rm -e PDCLI_API_TOKEN -e PDCLI_COMPANY_DOMAIN \
#     ghcr.io/wavyx/pdcli deal list --output json
#
# The image installs the published npm package, so build it after publishing
# (the release workflow passes the released version via PDCLI_VERSION).
FROM node:20-slim

ARG PDCLI_VERSION=latest

LABEL org.opencontainers.image.source="https://github.com/wavyx/pdcli"
LABEL org.opencontainers.image.description="Command-line interface for Pipedrive"
LABEL org.opencontainers.image.licenses="MIT"

RUN npm install -g "@wavyx/pdcli@${PDCLI_VERSION}" \
  && npm cache clean --force

ENTRYPOINT ["pdcli"]
CMD ["--help"]
