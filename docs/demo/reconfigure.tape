# Records docs/assets/reconfigure.gif: `vhs docs/demo/reconfigure.tape` from the repo root.
# bin/gh fakes GitHub, so the recording shows a made-up org and stops before any PR is opened.
Output docs/assets/reconfigure.gif

Set Shell bash
Set FontSize 16
Set Width 1100
Set Height 520
Set Padding 20
Set TypingSpeed 60ms
Set Theme "Catppuccin Mocha"

Hide
Type "mkdir -p docs/demo/node_modules/.bin && ln -sf ../../../../bin/agentspread.mjs docs/demo/node_modules/.bin/agentspread"
Enter
Type "export PATH=$PWD/docs/demo/bin:$PATH PS1='$ ' && cd docs/demo && clear"
Enter
Show

Type "npm run reconfigure"
Sleep 400ms
Enter
Sleep 2s

# Repo to reconfigure: api, billing-service, web
Down
Sleep 400ms
Down
Sleep 600ms
Enter
Sleep 1.5s

# Agents: untick Cline
Down 6
Sleep 600ms
Space
Sleep 1s
Enter
Sleep 1.5s

# Groups: untick backend, tick frontend
Space
Sleep 600ms
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
