import { createServer } from "node:http";
import { URL } from "node:url";

export interface WaitForCallbackOptions {
  port: number;
  callbackPath: string;
  codeParam?: string;
}

/**
 * ローカル HTTP サーバーを起動して OAuth コールバックを待機する。
 * 認証コード（code パラメータ）を受信したら resolve する。
 */
export function waitForCallback(
  options: WaitForCallbackOptions,
): Promise<string> {
  const { port, callbackPath, codeParam = "code" } = options;

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const reqUrl = new URL(req.url || "/", `http://localhost:${port}`);

      if (reqUrl.pathname === callbackPath) {
        const code = reqUrl.searchParams.get(codeParam);
        if (code) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h1>認証成功</h1><p>このタブを閉じてください。</p>");
          console.log("認証コードを受信しました。");
          server.close();
          resolve(code);
        } else {
          const error = reqUrl.searchParams.get("error") || "unknown";
          res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<h1>認証失敗</h1><p>${error}</p>`);
          server.close();
          reject(new Error(`OAuth auth error: ${error}`));
        }
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    server.listen(port, () => {
      console.log(`ローカルサーバー起動: http://localhost:${port}`);
    });

    server.on("error", (err) => {
      reject(new Error(`サーバー起動失敗: ${err.message}`));
    });
  });
}
