# The GitHub App

A workflow's built-in `GITHUB_TOKEN` can only touch the repo it runs in. The GitHub App is the bot that pushes the release commit and tag to your content repo and opens PRs in consumer repos. You create it once per org.

## 1. Create it

1. Open the App settings:
   - For an organization: the org's **Settings**, then **Developer settings** in the left menu, then **GitHub Apps**.
   - For a personal account: your profile's **Settings**, then **Developer settings**, then **GitHub Apps**.
2. Click **New GitHub App** and fill in:

| Field | Value |
|---|---|
| GitHub App name | anything unique on GitHub, e.g. `<org>-agentspread`; it is the bot's display name |
| Homepage URL | required; `https://github.com/<org>/agentspread-config` is fine |
| Webhook | untick *Active* |
| Repository permissions | **Contents**: Read and write. **Pull requests**: Read and write. (**Metadata**: Read-only is added automatically.) |
| Where can this GitHub App be installed? | *Only on this account* |

3. Click **Create GitHub App**.

## 2. Copy the App ID and generate a key

- **App ID:** on the App's *General* page under *About*, a number like `1234567`. Not the *Client ID* (`Iv23li…`), and you don't need a client secret.
- **Private key:** at the bottom of the same page, under **Private keys**, click **Generate a private key**. A `.pem` file downloads.

## 3. Store them in a `release` environment

1. In the content repo, open **Settings**, then **Environments**, and click **New environment**. Name it `release`.
2. Under **Deployment branches**, choose **Selected branches** and add your release branch (`main`).
3. Store both values as **environment** secrets, then delete the `.pem`:

```bash
gh secret set AGENTSPREAD_APP_ID --repo <org>/agentspread-config --env release --body 1234567
gh secret set AGENTSPREAD_APP_PRIVATE_KEY --repo <org>/agentspread-config --env release < path/to/the.private-key.pem
```

The App can write to every repo it is installed on. Keeping its key in an environment limited to the release branch stops a workflow on any other branch from using it.

## 4. Install it

Creating the App does not install it.

1. On the App's page, click **Install App** in the left menu.
2. Click **Install** next to your org or account.
3. Choose **All repositories**, or **Only select repositories** and pick the content repo and every consumer repo.

When you add consumer repos later, give the App access to them too: open the org's **Settings** and then **GitHub Apps** (for a personal account: **Settings**, then **Applications**), click **Configure** next to your App, and add the repos under **Repository access**.

A run that fails with `Not Found … get-a-user-installation` means the App is not installed where it needs to be.

## 5. Protect the release branch and tags

- If the content repo's release branch has a ruleset or branch protection, add the App to its bypass list: it pushes the release commit and tag.
- Add a ruleset that stops `v*` tags from being deleted or moved. Consumers roll out whatever a tag points to.
