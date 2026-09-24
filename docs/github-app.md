# The GitHub App

A workflow's built-in `GITHUB_TOKEN` can only touch the repo it runs in. The GitHub App is the bot that pushes the release commit and tag to your content repo and opens PRs in consumer repos. You create it once per org.

## 1. Create it

Org: *Org settings → Developer settings → GitHub Apps → New GitHub App*.
Personal account: *Settings → Developer settings → GitHub Apps → New GitHub App*.

| Field | Value |
|---|---|
| GitHub App name | anything unique on GitHub, e.g. `<org>-agentspread`; it is the bot's display name |
| Homepage URL | required; `https://github.com/<org>/ai-config` is fine |
| Webhook | untick *Active* |
| Repository permissions | *Contents* → Read and write, *Pull requests* → Read and write (*Metadata* → Read-only is added automatically) |
| Where can this GitHub App be installed? | *Only on this account* |

Click **Create GitHub App**.

## 2. Copy the App ID and generate a key

- **App ID:** on the App's *General* page under *About*, a number like `1234567`. Not the *Client ID* (`Iv23li…`), and you don't need a client secret.
- **Private key:** same page, bottom, *Private keys → Generate a private key*. A `.pem` file downloads.

## 3. Store them in a `release` environment

In the content repo: *Settings → Environments → New environment* named `release`. Under *Deployment branches*, choose *Selected branches* and add your release branch (`main`). Then store both values as **environment** secrets and delete the `.pem`:

```bash
gh secret set AGENTSPREAD_APP_ID --repo <org>/ai-config --env release --body 1234567
gh secret set AGENTSPREAD_APP_PRIVATE_KEY --repo <org>/ai-config --env release < path/to/the.private-key.pem
```

The App can write to every repo it is installed on. Keeping its key in an environment limited to the release branch stops a workflow on any other branch from using it.

## 4. Install it

Creating the App does not install it. On the App's page: *Install App* → *Install* next to your org → *All repositories*, or *Only select repositories* with the content repo and every consumer repo.

When you add consumer repos later, give the App access to them too: *Settings → GitHub Apps* (org) or *Settings → Applications* (personal) → your App → *Configure* → *Repository access*.

A run that fails with `Not Found … get-a-user-installation` means the App is not installed where it needs to be.

## 5. Protect the release branch and tags

- If the content repo's release branch has a ruleset or branch protection, add the App to its bypass list: it pushes the release commit and tag.
- Add a ruleset that stops `v*` tags from being deleted or moved. Consumers roll out whatever a tag points to.
