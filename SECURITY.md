# Security Policy

## Reporting a vulnerability

pdcli handles Pipedrive API and OAuth credentials, so security reports are taken
seriously.

**Please do not open public GitHub issues for security vulnerabilities.**

Report privately through GitHub's
[private vulnerability reporting](https://github.com/wavyx/pdcli/security/advisories/new)
(the repository's **Security** tab → **Report a vulnerability**). Include:

- A description of the issue and its impact
- Steps to reproduce
- The affected version (`pdcli version`)

You will receive an acknowledgement within 72 hours and a status update within
7 days. Once a fix is released, reporters who wish to be named will be credited.

## Supported versions

pdcli is pre-1.0. Only the latest released version receives security fixes.

## How pdcli handles credentials

- API tokens and OAuth tokens are stored **only** in the operating system
  keychain (macOS Keychain, Windows Credential Manager, or libsecret on Linux).
  pdcli refuses to write credentials to disk in plaintext; if no keychain is
  available, authentication fails rather than falling back to insecure storage.
- The raw `pdcli api` escape hatch is **host-locked** to your authenticated
  Pipedrive company domain (`{company}.pipedrive.com`) or the OAuth `api_domain`.
  A request that resolves to any other host is refused, and the transport never
  follows redirects — so a mistyped or hallucinated URL cannot leak your token
  to another host. There is no generic `api.pipedrive.com` data host.
- Tokens are redacted from logs, errors, and `--verbose` output.
- Passing a token on a flag would expose it in your shell history and the
  process list. Prefer the interactive `pdcli auth login`, or the
  `PDCLI_API_TOKEN` / `PDCLI_COMPANY_DOMAIN` environment variables for CI.
