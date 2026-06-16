# docs/demo.tape — regenerate the animated README terminal with VHS.
#
#   brew install vhs           # or: go install github.com/charmbracelet/vhs@latest
#   npm run docs:demo          # runs: vhs docs/demo.tape  →  docs/demo.webp
#
# This records REAL pdcli output, so run it against an AUTHENTICATED profile —
# point it at a sandbox/demo account, not production. The commands below are
# read-only and show aggregates only (no contact PII). Swap them freely, but
# avoid mutating commands so the recording is repeatable.

# GIF renders in a GitHub <img> and needs only ffmpeg's built-in encoder.
# (WebP would be smaller/sharper but Homebrew's ffmpeg ships without libwebp;
#  MP4/WebM also work if your ffmpeg has the encoder, but GitHub won't autoplay
#  them inside an <img>.)
Output docs/demo.gif

Require pdcli

# --- look & feel -------------------------------------------------------------
Set Shell bash
Set FontSize 16
Set Width 1200          # wide enough that no output line clips (the old SVG was 720)
Set Height 760
Set Padding 28
Set BorderRadius 12
Set TypingSpeed 45ms
Set CursorBlink true
# Brand palette (matches the docs site / old demo): dark green ground, mint accent.
Set Theme { "name": "pdcli", "background": "#0c1611", "foreground": "#c9d4cd", "cursor": "#4ade80", "selection": "#1f2b24", "black": "#0a120e", "brightBlack": "#6b7d72", "red": "#e06c75", "brightRed": "#e06c75", "green": "#4ade80", "brightGreen": "#4ade80", "yellow": "#e5c07b", "brightYellow": "#e5c07b", "blue": "#61afef", "brightBlue": "#61afef", "magenta": "#c678dd", "brightMagenta": "#c678dd", "cyan": "#56b6c2", "brightCyan": "#56b6c2", "white": "#c9d4cd", "brightWhite": "#ffffff" }

# --- start clean -------------------------------------------------------------
Hide
Type "clear" Enter
Show

# --- scenes (read-only, aggregate output) ------------------------------------
Type "pdcli pipeline health" Sleep 400ms Enter
Sleep 2.8s

Type "pdcli deal summary --status open" Sleep 400ms Enter
Sleep 2.8s

Type "pdcli metrics coverage --target 500000" Sleep 400ms Enter
Sleep 3s

# hold the final frame so the loop doesn't appear cut off
Sleep 1.8s
