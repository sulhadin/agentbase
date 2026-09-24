# Records docs/assets/init.gif: `vhs docs/demo/init.tape` from the repo root.
# bin/gh fakes GitHub, so the recording shows a made-up org and creates nothing on GitHub.
Output docs/assets/init.gif

Set Shell bash
Set FontSize 15
Set Width 1240
Set Height 700
Set Padding 20
Set TypingSpeed 50ms
Set Theme "Catppuccin Mocha"

Hide
Type `export ENGINE=$PWD PATH=$PWD/docs/demo/bin:$PATH PS1='$ ' && npx() { shift; node $ENGINE/bin/agentspread.mjs "$@"; } && cd $(mktemp -d) && clear`
Enter
Show

Type "gh repo create acme/agentspread-config --private --clone"
Sleep 300ms
Enter
Sleep 1s
Type "cd agentspread-config"
Sleep 300ms
Enter
Sleep 500ms
Type "npx agentspread init"
Sleep 300ms
Enter
Sleep 7s
