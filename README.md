# 🤖 Project Manager Telegram Bot

A Telegram bot that integrates with GitHub to help you manage issues, assignments, and daily commit summaries right from your chat.

---

## 🚀 Features

- 📝 Create issues using `#todo <title>`
- 🔒 Close issues using `#close <issue number>`
- ♻️ Reopen issues using `#reopen <issue number>`
- 👤 Assign issues interactively with `#assign`
- 📅 Get daily commit summaries from your GitHub repository (auto + `/summary` command)
- ⚠️ Robust error handling for both GitHub and Telegram API issues

---

## 🔧 Setup

### 1. Clone the Repository

```bash
git clone https://github.com/Priyanshi1908/project-manager.git
cd project-manager
````

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file and fill in:

```env
BOT_TOKEN=your_telegram_bot_token
GITHUB_PAT=your_github_personal_access_token
GITHUB_OWNER=your_github_username_or_org
GITHUB_REPO=your_repository_name
TARGET_CHAT_ID=telegram_chat_id_for_summary
RUN_MANUAL_SUMMARY_ON_STARTUP=true  # Optional
```

### 4. Start the Bot

```bash
node index.js
```

> 💡 Make sure your bot is added to the chat group and has permissions to send messages.

---

## 📚 Commands

| Command    | Description                                |
| ---------- | ------------------------------------------ |
| `/start`   | Start the bot                              |
| `/help`    | Show available commands                    |
| `/summary` | Trigger daily commit summary manually      |
| `#todo`    | Create a new GitHub issue                  |
| `#close`   | Close a GitHub issue                       |
| `#reopen`  | Reopen a closed GitHub issue               |
| `#assign`  | Begin interactive issue assignment process |

---

## 🛡️ Error Handling

The bot includes detailed contextual responses and logs for:

* Missing or misconfigured GitHub credentials
* Telegram chat permission issues (e.g. closed topics)
* Invalid user inputs or API limits

---

## 🕰️ Scheduling

A cron job automatically sends a **daily commit summary** to the target Telegram chat at **7:00 AM IST**.

---

## 🛠️ Tech Stack

* [Grammy](https://grammy.dev/) – Telegram Bot Framework
* [Octokit](https://github.com/octokit/octokit.js) – GitHub API Client
* [Node-cron](https://www.npmjs.com/package/node-cron) – Job scheduling
* [dotenv](https://www.npmjs.com/package/dotenv) – Environment variable management

---

## 📌 Project Roadmap

### ✅ MVP (Completed)

* Basic Telegram command handling (`/start`, `/help`, `/summary`)
* Create/close/reopen issues with `#todo`, `#close`, `#reopen`
* Interactive flow for `#assign` (issue assignment)
* GitHub API integration with proper error responses
* Daily commit summary with cron scheduling
* Markdown-safe message formatting for Telegram

### 🔜 Upcoming Features

* 🧠 Conversation context for more natural inputs (e.g. "close last issue")
* 📎 Attach issue labels or milestones
* ⏱️ Custom time scheduling for summaries via bot commands
* 📦 Docker support for easy deployment
* 🔐 Admin access control (restrict bot usage to specific users/groups)
* 🧪 Unit tests & integration testing with mocked GitHub API
* 🌐 Web dashboard for live monitoring & logs (optional)

---

## 📄 License

MIT © Pri 2025