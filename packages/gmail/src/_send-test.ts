import { google } from "googleapis";
import { getAuthenticatedClient } from "./auth.js";

async function main() {
  const auth = await getAuthenticatedClient();
  const gmail = google.gmail({ version: "v1", auth });

  // Get own email address
  const profile = await gmail.users.getProfile({ userId: "me" });
  const myEmail = profile.data.emailAddress!;

  const subject = "テスト: 日本語件名の文字化け修正確認";
  const body = "これはテストメールです。日本語の件名が正しく表示されるか確認します。";

  // RFC 2047 encode the subject
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

  const messageParts = [
    `To: ${myEmail}`,
    `Subject: ${encodedSubject}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ];
  const raw = Buffer.from(messageParts.join("\r\n")).toString("base64url");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  console.log("Test email sent to", myEmail);
}

main().catch(console.error);
