import { Bot, session, GrammyError, HttpError } from "grammy";

// Utility to escape Markdown special characters for Telegram
function escapeMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/([_\*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

import { Octokit } from "octokit";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

// Create bot instance
const bot = new Bot(process.env.BOT_TOKEN);

console.log("ready to rock..!");

// IMPORTANT: Register essential command handlers first, before any other middleware
bot.command("start", async (ctx) => {
  console.log("START command received");
  return ctx.reply("Welcome to Project Manager Bot! I am working now.");
});

bot.command("help", async (ctx) => {
  console.log("HELP command received");
  return ctx.reply("Here are my commands:\n/start - Start the bot\n/help - Show this help message");
});

// Catch all other messages
bot.on("message", (ctx) => {
  console.log("Got message:", ctx.message.text);
  return ctx.reply("I received your message. Try /start or /help");
});

// Initialize Octokit only if GITHUB_PAT is present
let octokit;
if (process.env.GITHUB_PAT) {
  octokit = new Octokit({ auth: process.env.GITHUB_PAT });
} else {
  console.warn(
    "WARNING: GITHUB_PAT is not defined. GitHub related features will fail."
  );
}

const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const TARGET_CHAT_ID = process.env.TARGET_CHAT_ID;

const initialSession = () => ({
  step: "idle",
  issueNumber: null,
  assignee: null,
});

bot.use(session({ initial: initialSession }));

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(
    `Error caught by bot.catch (Update ID: ${ctx?.update?.update_id || "N/A"}):`
  );

  const e = err.error;

  if (e instanceof GrammyError) {
    console.error("GrammyError:", e.description);
    if (ctx?.reply && e.description?.includes("TOPIC_CLOSED")) {
      ctx.reply(
        "⚠️ Telegram Error: Cannot send message because the target topic is closed or I'm not allowed there. Please check the group's topic settings or the bot's TARGET_CHAT_ID configuration."
      );
    } else if (ctx?.reply && e.description?.includes("CHAT_NOT_FOUND")) {
        ctx.reply("⚠️ Telegram Error: Chat not found. Is TARGET_CHAT_ID correct and is the bot a member of the chat?");
    }
  } else if (
    e instanceof HttpError &&
    e.request &&
    e.request.url.includes("api.github.com")
  ) {
    console.error(`GitHub API Error: ${e.status} ${e.message}`);
    console.error("Request URL:", e.request.url);
    console.error("Response data:", e.response?.data);
    if (ctx?.reply) {
      if (e.status === 401) {
        ctx.reply(
          "❌ GitHub Error: Bad credentials. Please check the bot's GITHUB_PAT."
        );
      } else if (e.status === 403) {
        ctx.reply(
          "❌ GitHub Error: Permission denied. The GITHUB_PAT lacks necessary scopes/permissions for the repository. Please check token settings on GitHub."
        );
      } else if (e.status === 404) {
        ctx.reply(
          "❌ GitHub Error: Resource not found. The repository or item might not exist, or GITHUB_OWNER/GITHUB_REPO is incorrect."
        );
      } else {
        ctx.reply(`❌ GitHub API Error: ${e.status}. Check bot logs for details.`);
      }
    }
  } else if (e instanceof Error) {
    console.error("Unknown Error:", e.message);
    console.error(e.stack);
    // if (ctx?.reply) {
    //   ctx.reply("An unexpected internal error occurred. Please check the bot logs.");
    // }
  } else {
    console.error("Unknown error object:", e);
  }
});

const getHelpMessage = () => `🚀 *Project Manager Bot*
➕ *Create Issue:* \`#todo <Your issue>\`
📌 *Close Issue:* \`#close <Issue Number>\`
🔁 *Reopen Issue:* \`#reopen <Issue Number>\`
👤 *Assign User:* \`#assign\` and I’ll guide you
_Example:_
#todo Fix login
#close 12`;

// Wrapper for GitHub interactions to check if octokit is initialized
const ensureOctokit = () => {
  if (!octokit) {
    const error = new Error(
      "GitHub PAT (Personal Access Token) is not configured. Cannot perform GitHub operations."
    );
    error.isConfigurationError = true;
    throw error;
  }
  if (!GITHUB_OWNER || !GITHUB_REPO) {
    const error = new Error(
        "GITHUB_OWNER or GITHUB_REPO is not configured. Cannot perform GitHub operations."
      );
    error.isConfigurationError = true;
    throw error;
  }
  return octokit;
};

const githubIssue = {
  create: (title) => {
    const currentOctokit = ensureOctokit();
    return currentOctokit.rest.issues.create({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      title,
      body: "Created via Telegram Bot",
    });
  },
  updateState: (issue_number, state) => {
    const currentOctokit = ensureOctokit();
    return currentOctokit.rest.issues.update({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number,
      state,
    });
  },
  assign: (issue_number, assignee) => {
    const currentOctokit = ensureOctokit();
    return currentOctokit.rest.issues.addAssignees({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      issue_number,
      assignees: [assignee],
    });
  },
};

const parseNumber = (text) => {
  const num = parseInt(text.trim(), 10);
  return isNaN(num) ? null : num;
};

const createGitHubErrorHandler = (ctx, action) => (error) => {
    console.error(`Error during GitHub ${action}:`, error.message);
    let replyMsg;
    if (error.isConfigurationError) {
        replyMsg = `❌ Configuration Error: ${error.message}`;
    } else if (error.status === 401) {
        replyMsg = `❌ GitHub Error (${action}): Bad credentials. Check GITHUB_PAT.`;
    } else if (error.status === 403) {
        replyMsg = `❌ GitHub Error (${action}): Permission denied. Check GITHUB_PAT scopes for ${GITHUB_OWNER}/${GITHUB_REPO}.`;
    } else if (error.status === 404) {
        replyMsg = `❌ GitHub Error (${action}): Resource not found (repository, issue, or user). Check GITHUB_OWNER/REPO and input.`;
    } else if (error.status === 422 && action.toLowerCase().includes("assign")) {
        replyMsg = `❌ GitHub Error (${action}): Could not assign user. They might not be a collaborator or the username is incorrect.`;
    }
     else {
        replyMsg = `❌ Couldn't ${action.toLowerCase()}. Error: ${error.message || "Unknown GitHub API error"}`;
    }
    ctx.reply(escapeMarkdown(replyMsg), {parse_mode: "Markdown"});
};


const issueCommandHandlers = {
  "#todo": async (ctx, value) => {
    if (!value) return ctx.reply("❗ Please provide a title.");
    try {
      const res = await githubIssue.create(value.trim());
      ctx.reply(escapeMarkdown(`✅ Created Issue:\n*#${res.data.number} - ${res.data.title}*`), {
        parse_mode: "Markdown",
      });
    } catch (error) {
      createGitHubErrorHandler(ctx, "issue creation")(error);
    }
  },
  "#close": async (ctx, value) => {
    const number = parseNumber(value);
    if (!number) return ctx.reply("❗ Invalid issue number.");
    try {
      const res = await githubIssue.updateState(number, "closed");
      ctx.reply(`🔒 Closed Issue #${number} - *${res.data.title}*`, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      createGitHubErrorHandler(ctx, `closing issue #${number}`)(error);
    }
  },
  "#reopen": async (ctx, value) => {
    const number = parseNumber(value);
    if (!number) return ctx.reply("❗ Invalid issue number.");
    try {
      const res = await githubIssue.updateState(number, "open");
      ctx.reply(escapeMarkdown(`♻️ Reopened Issue #${number} - *${res.data.title}*`), {
        parse_mode: "Markdown",
      });
    } catch (error) {
      createGitHubErrorHandler(ctx, `reopening issue #${number}`)(error);
    }
  },
};

const parseCommand = (text) => {
  const command = Object.keys(issueCommandHandlers).find((cmd) =>
    text.toLowerCase().startsWith(cmd) // Made commands case-insensitive
  );
  return command ? { command, value: text.substring(command.length).trim() } : null;
};

const handleAssignFlow = {
  begin: async (ctx) => {
    ctx.session.step = "awaiting_issue_number";
    ctx.reply("📝 Which issue number do you want to assign?");
  },

  issueNumber: async (ctx) => {
    const number = parseNumber(ctx.message.text);
    if (!number) return ctx.reply("❗ Please enter a valid number.");
    ctx.session.issueNumber = number;
    ctx.session.step = "awaiting_assignee";
    ctx.reply(`👤 Who should I assign to issue #${number}? (GitHub username)`);
  },

  assignee: async (ctx) => {
    const username = ctx.message.text.trim();
    try {
      await githubIssue.assign(ctx.session.issueNumber, username);
      ctx.reply(
        escapeMarkdown(`✅ Assigned *${username}* to issue #${ctx.session.issueNumber}`),
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      createGitHubErrorHandler(ctx, `assigning ${username} to issue #${ctx.session.issueNumber}`)(error);
    }
    ctx.session = initialSession();
  },
};

const sendDailyCommitSummary = async () => {
  if (!TARGET_CHAT_ID) {
    console.error("TARGET_CHAT_ID not set. Cannot send daily commit summary.");
    return;
  }
  let currentOctokit;
  try {
    currentOctokit = ensureOctokit(); // This will throw if PAT, OWNER, or REPO is missing
  } catch (configError) {
    console.error("Configuration error for daily summary:", configError.message);
     try {
        await bot.api.sendMessage(TARGET_CHAT_ID, `⚠️ Cannot generate daily commit summary: ${configError.message}`);
    } catch (telegramError) {
        console.error("Failed to send configuration error notification to TARGET_CHAT_ID:", telegramError.message);
    }
    return;
  }

  try {
    const twentyFourHoursAgo = new Date();
    twentyFourHoursAgo.setDate(twentyFourHoursAgo.getDate() - 1);
    const sinceISO = twentyFourHoursAgo.toISOString();

    console.log(
      `Fetching commits since ${sinceISO} for ${GITHUB_OWNER}/${GITHUB_REPO}`
    );

    const { data: commits } = await currentOctokit.rest.repos.listCommits({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      since: sinceISO,
    });

    let summaryMessage = "🗓️ *Daily Commit Summary (Last 24 Hours)*\n\n";

    if (commits.length === 0) {
      summaryMessage += "No new commits in the last 24 hours. 😴";
    } else {
      commits.forEach((commitData) => {
        const sha = commitData.sha.substring(0, 7);
        const message = commitData.commit.message.split("\n")[0];
        const authorName =
          commitData.commit.author?.name ||
          commitData.author?.login ||
          "Unknown Author";
        const commitDateStr =
          commitData.commit.author?.date || commitData.commit.committer?.date;
        let formattedTime = "";
        if (commitDateStr) {
          const commitDate = new Date(commitDateStr);
          formattedTime = ` (at ${commitDate.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Kolkata",
          })})`;
        }
        summaryMessage += `🔨 \`[${sha}]\` *${message}* - _${authorName}_${formattedTime}\n`;
      });
    }

    await bot.api.sendMessage(TARGET_CHAT_ID, summaryMessage, {
      parse_mode: "Markdown",
    });
    console.log(
      "Daily commit summary sent successfully to chat:",
      TARGET_CHAT_ID
    );
  } catch (error) {
    console.error(
      "Error fetching or sending daily commit summary:",
      error.message
    );
    let adminMessage = `Failed to send daily summary for ${GITHUB_OWNER}/${GITHUB_REPO}: ${error.message}`;
    if (error.status === 401) {
      adminMessage = `Failed to send daily summary for ${GITHUB_OWNER}/${GITHUB_REPO}: Bad GitHub credentials.`;
    } else if (error.status === 403) {
      adminMessage = `Failed to send daily summary for ${GITHUB_OWNER}/${GITHUB_REPO}: GitHub permission denied.`;
    } else if (error.status === 404) {
      adminMessage = `Failed to send daily summary: GitHub Repository ${GITHUB_OWNER}/${GITHUB_REPO} not found.`;
    } else if (error.description?.includes("TOPIC_CLOSED")) {
        adminMessage = `Failed to send daily summary to ${TARGET_CHAT_ID}: Telegram topic is closed or chat issue.`;
    } else if (error.description?.includes("CHAT_NOT_FOUND")) {
        adminMessage = `Failed to send daily summary to ${TARGET_CHAT_ID}: Telegram chat not found.`;
    }

    try {
      await bot.api.sendMessage(
        TARGET_CHAT_ID, // Or a dedicated admin chat
        `⚠️ Error generating daily commit summary. Details: ${adminMessage}`
      );
    } catch (telegramError) {
      console.error(
        "Failed to send error notification about daily summary to TARGET_CHAT_ID:",
        telegramError.message
      );
    }
  }
};

// Handler for text messages that implement GitHub issue commands
bot.on("message:text", async (ctx) => {
  // Skip commands - they're handled by command handlers
  if (ctx.message?.text.startsWith('/')) return;
  
  if (!ctx.message?.text) return; // Ignore messages without text
  const text = ctx.message.text.trim();

  const stepMap = {
    idle: async () => {
      const parsed = parseCommand(text);
      if (parsed) {
        return issueCommandHandlers[parsed.command](ctx, parsed.value);
      }
      if (text.toLowerCase().startsWith("#assign")) {
        return handleAssignFlow.begin(ctx);
      }
    },
    awaiting_issue_number: () => handleAssignFlow.issueNumber(ctx),
    awaiting_assignee: () => handleAssignFlow.assignee(ctx),
  };

  const handler = stepMap[ctx.session.step];
  if (handler) {
    await handler();
  }
});

// Add a summary command separately
bot.command("summary", async (ctx) => {
  await ctx.reply("Generating commit summary for the last 24 hours...");
  await sendDailyCommitSummary();
});

// Bot will be started in the IIFE at the bottom of the file
console.log("Commands registered successfully...");

cron.schedule(
  "0 7 * * *", // 7:00 AM IST
  async () => {
    console.log("Cron job triggered: Sending daily commit summary...");
    await sendDailyCommitSummary();
  },
  {
    scheduled: true,
    timezone: "Asia/Kolkata",
  }
);

(async () => {
  try {
    if (!process.env.BOT_TOKEN) {
      console.error("FATAL: BOT_TOKEN is not defined in .env file. Exiting.");
      process.exit(1);
    }
    
    // Warning for GitHub PAT moved to octokit initialization
    if (!GITHUB_OWNER || !GITHUB_REPO) {
      console.warn(
        "WARNING: GITHUB_OWNER or GITHUB_REPO is not defined. GitHub features might fail or target the wrong repository."
      );
    }
    
    if (!TARGET_CHAT_ID) {
      console.warn(
        "WARNING: TARGET_CHAT_ID is not defined. Daily summaries will not be sent automatically."
      );
    }

    console.log("Starting bot...");
    await bot.start();
    console.log("Bot is running! Press Ctrl+C to stop.");

    // Optional: Manually trigger for testing during development
    // Set an env var like `RUN_MANUAL_SUMMARY_ON_STARTUP=true` to enable this
    if (process.env.RUN_MANUAL_SUMMARY_ON_STARTUP === 'true') {
      console.log("Manually triggering daily commit summary for testing on startup...");
      try {
        await sendDailyCommitSummary();
      } catch (error) {
        console.error("Error during manual startup trigger of sendDailyCommitSummary:", error.message);
        if (error.status && error.request && error.request.url.includes("api.github.com")) {
          console.error(`GitHub API Error (${error.status}) during manual trigger: ${error.message}`);
          console.error("Response data:", error.response?.data);
        } else if (error.message?.includes("TOPIC_CLOSED") || error.description?.includes("TOPIC_CLOSED")) {
          console.error("Telegram API Error during manual trigger: TOPIC_CLOSED. Check TARGET_CHAT_ID and group topic settings.");
        }
      }
    }
  } catch (error) {
    console.error("Failed to start the bot:", error);
    process.exit(1);
  }
})();