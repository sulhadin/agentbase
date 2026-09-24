# Records docs/assets/onboard.gif: `vhs docs/demo/onboard.tape` from the repo root.
# bin/gh fakes GitHub, so the recording shows a made-up org and stops before any PR is opened.
Output docs/assets/onboard.gif

Set Shell bash
Set FontSize 16
Set Width 1100
Set Height 560
Set Padding 20
Set TypingSpeed 60ms
Set Theme "Catppuccin Mocha"

Hide
Type "mkdir -p docs/demo/node_modules/.bin && ln -sf ../../../../bin/agentspread.mjs docs/demo/node_modules/.bin/agentspread"
Enter
Type "export PATH=$PWD/docs/demo/bin:$PATH PS1='$ ' && cd docs/demo && clear"
Enter
Show

Type "npm run onboard"
Sleep 400ms
Enter
Sleep 2s

# Repos: api, billing-service and web are already adopted; pick mobile-app
Down 3
Sleep 800ms
Space
Sleep 1s
Enter
Sleep 1.5s

# Agents: keep Claude Code and Codex
Sleep 1s
Enter
Sleep 1.5s

# Groups: tick frontend
Down
Sleep 400ms
Space
Sleep 1s
Enter
Sleep 4s

Hide
Ctrl+C
Type "cd ../.. && rm -rf docs/demo/node_modules"
Enter
