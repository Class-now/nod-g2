#!/usr/bin/env bash
# Run the built app in the Even Hub simulator (headless, Xvfb) and save one glasses
# screenshot per screen into docs/sim/. Usage: npm run build && bash tools/sim-shots.sh
set -u
cd "$(dirname "$0")/.."
OUT=docs/sim; mkdir -p "$OUT"
API=http://127.0.0.1:9898/api
python3 -m http.server 5173 --directory dist >/dev/null 2>&1 & HTTP=$!
xvfb-run -a -s "-screen 0 1600x1000x24" node_modules/@evenrealities/sim-linux-x64/bin/evenhub-simulator \
  --no-glow --automation-port 9898 "http://127.0.0.1:5173/?demo=1" >"$OUT/sim.log" 2>&1 & SIM=$!
trap 'kill $SIM $HTTP 2>/dev/null; pkill -f evenhub-simulator 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -sf $API/ping >/dev/null && break; sleep 0.5; done
sleep 3
shot() { sleep "${2:-1.5}"; curl -sf $API/screenshot/glasses -o "$OUT/$1.png" && echo "shot $1"; }
press() { curl -sf -X POST -H 'content-type: application/json' -d "{\"action\":\"$1\"}" $API/input >/dev/null; echo "in $1"; }
shot 01-home
press down; shot 02-home-down
press click; shot 03-brief
press click; shot 04-reply
press down; shot 05-reply-down
press click; shot 06-after-reply-click
press click; shot 07-next
press double_click; shot 08-meeting
press double_click; shot 09-back
press down; shot 10-home-kenji
press click; shot 11-brief-kenji 2.5
press click; shot 12-reply-kenji
press down; press down; press down; shot 13-reply-voice-item
press click; shot 14-voice-listening 2
press click; shot 15-voice-thinking 1
shot 16-voice-ready 3
press double_click; shot 17-reply-again
press up; press up; press up; shot 18-reply-top
press long_press; shot 19-confirm-send 2
press long_press_release; shot 20-after-release
curl -sf $API/console > "$OUT/console.json"; echo; echo console:; head -c 3000 "$OUT/console.json"
