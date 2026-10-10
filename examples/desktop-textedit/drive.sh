#!/bin/sh
# Driver for UAT-DESK-001. `uatp mark <id>` timestamps the start of each step for the video.
# AppleScript talks to TextEdit directly, so no Accessibility permission is needed.
NOTE="Release checklist: tests passed"

uatp mark s1
osascript -e 'tell application "TextEdit" to activate' \
          -e 'tell application "TextEdit" to make new document' >/dev/null
sleep 2

uatp mark s2
osascript -e "tell application \"TextEdit\" to set text of front document to \"$NOTE\"" >/dev/null
sleep 2

GOT=$(osascript -e 'tell application "TextEdit" to get text of front document')
if [ "$GOT" = "$NOTE" ]; then
  uatp mark e1
  sleep 2
else
  uatp mark e1 --fail "document text was: $GOT"
  exit 1
fi

# Leave no unsaved document behind.
osascript -e 'tell application "TextEdit" to close front document saving no' >/dev/null
