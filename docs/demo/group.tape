# Records docs/assets/group.gif: `vhs docs/demo/group.tape` from the repo root.
# bin/gh fakes GitHub, so the recording shows a made-up org; the group is created in a throwaway folder.
Output docs/assets/group.gif

Set Shell bash
Set FontSize 16
Set Width 1100
Set Height 560
Set Padding 20
Set TypingSpeed 60ms
Set Theme "Catppuccin Mocha"

Hide
Type `export ENGINE=$PWD PATH=$PWD/docs/demo/bin:$PATH PS1='$ ' && cd $(mktemp -d) && cp $ENGINE/docs/demo/package.json . && mkdir -p node_modules/.bin groups/common/skills/a && ln -s $ENGINE/bin/agentspread.mjs node_modules/.bin/agentspread && printf -- '---\nname: a\ndescription: d\n---\nb\n' > groups/common/skills/a/SKILL.md && clear`
Enter
Show

Type "npm run group"
Sleep 400ms
Enter
Sleep 2s

# Who is this group for? -> several repos
Sleep 800ms
Enter
Sleep 1s

# Group name
Type "backend"
Sleep 800ms
Enter
Sleep 1s

# Parts: skills is ticked; add AGENTS.md instructions
Down 3
Sleep 500ms
Space
Sleep 1s
Enter
Sleep 5s
