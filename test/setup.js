// Tests model an INTERACTIVE terminal by default: human-readable output and
// human-readable (thrown-with-message) errors. Tests that exercise piped /
// machine behavior opt in explicitly by setting `process.stdout.isTTY = false`
// (success → JSON) — they already do. This keeps the large body of
// `rejects.toThrow(/message/)` error-path assertions valid now that piped
// errors emit JSON instead of a human line (v0.17 contract).
beforeEach(() => {
  process.stdout.isTTY = true
})
