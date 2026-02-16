import { App, type Receiver, type ReceiverEvent } from "@slack/bolt";
import { SocketModeClient } from "@slack/socket-mode";
import { env } from "./env.js";

const {
  SLACK_BOT_TOKEN: botToken,
  SLACK_APP_TOKEN: appToken,
  SLACK_SIGNING_SECRET: signingSecret,
} = env;

/**
 * Custom Socket Mode receiver with configurable ping timeouts.
 * Bolt's built-in SocketModeReceiver does not forward clientPingTimeout
 * to the underlying SocketModeClient, causing pong timeout errors on
 * cloud deployments where latency exceeds the 5s default.
 */
class CustomSocketModeReceiver implements Receiver {
  client: SocketModeClient;
  private app?: { processEvent(event: ReceiverEvent): Promise<void> };

  constructor(opts: {
    appToken: string;
    clientPingTimeout?: number;
    serverPingTimeout?: number;
  }) {
    this.client = new SocketModeClient({
      appToken: opts.appToken,
      clientPingTimeout: opts.clientPingTimeout ?? 20_000,
      serverPingTimeout: opts.serverPingTimeout ?? 60_000,
    });

    this.client.on(
      "slack_event",
      async (args: {
        body: Record<string, unknown>;
        retry_num?: number;
        retry_reason?: string;
        ack: (response?: Record<string, unknown>) => Promise<void>;
      }) => {
        const { body, retry_num, retry_reason, ack } = args;
        const event: ReceiverEvent = {
          body,
          ack: async (response) => {
            await ack(response);
          },
          retryNum: retry_num,
          retryReason: retry_reason,
        };
        try {
          await this.app?.processEvent(event);
        } catch (error) {
          console.error("Error processing Slack event:", error);
        }
      },
    );
  }

  init(app: { processEvent(event: ReceiverEvent): Promise<void> }) {
    this.app = app;
  }

  async start() {
    await this.client.start();
  }

  async stop() {
    await this.client.disconnect();
  }
}

const receiver = new CustomSocketModeReceiver({ appToken });

export const app = new App({
  token: botToken,
  signingSecret,
  receiver,
});

app.error(async (error) => {
  console.error("Slack app error:", error);
});

// Socket Mode: SDK auto-reconnects on disconnect — no notification needed.
// Only notify when reconnection is impossible.
receiver.client.on("unable_to_socket_mode_start", () => {
  console.error("Slack Socket Mode unable to start");
  notifyViaWebAPI(
    ":rotating_light: *Slack Bot failed to start Socket Mode*. Manual intervention needed.",
  );
});

/**
 * Direct Slack Web API notification (bypasses Bolt/Socket Mode).
 * Used when the bot itself is having connection issues.
 */
async function notifyViaWebAPI(text: string): Promise<void> {
  const channel = env.SLACK_NOTIFICATION_CHANNEL;
  if (!channel) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel, text }),
    });
  } catch {
    // Last resort - can't send notification either
    console.error("[Slack Bot] Failed to send error notification via Web API");
  }
}
