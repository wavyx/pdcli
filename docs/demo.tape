# docs/demo.tape — regenerate the animated README terminal with VHS.
#
#   brew install vhs           # or: go install github.com/charmbracelet/vhs@latest
#   npm run docs:demo          # runs: vhs docs/demo.tape  →  docs/demo.webp
#
# This records REAL pdcli output, so run it against an AUTHENTICATED profile —
# point it at a sandbox/demo account, not production. The commands below are
# read-only and show aggregates only (no contact PII). Swap them freely, but
# avoid mutating commands so the recording is repeatable.

# WebP: crisp + ~10x smaller than GIF, renders in a GitHub <img>. Needs an ffmpeg
# built with libwebp — Homebrew's core ffmpeg lacks it, so install the tap build:
#   brew tap homebrew-ffmpeg/ffmpeg && brew install homebrew-ffmpeg/ffmpeg/ffmpeg --with-webp
Output docs/demo.webp

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

# --- scenes (read-only) ------------------------------------------------------
# This account has 2 pipelines, so pipeline-scoped reports need --pipeline.
# Each scene clears first (Hide/clear/Show) so output starts at the top — keeps
# tall tables readable and one scene from bleeding into the next. Keep each
# scene's output SHORT enough to fit the Height above (a full `field list` would
# overflow and the frame catches it mid-scroll).
Type "pdcli pipeline health --pipeline 1" Sleep 400ms Enter
Sleep 3s

Hide
Type "clear" Enter
Show
Type "pdcli funnel --pipeline 1" Sleep 400ms Enter
Sleep 3s

Hide
Type "clear" Enter
Show
Type "pdcli person upsert jane.demo@example.com --by email --dry-run" Sleep 400ms Enter
Sleep 3s

# hold the final frame so the loop doesn't appear cut off
Sleep 1.8s
