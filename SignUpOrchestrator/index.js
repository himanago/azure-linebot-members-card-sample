const df = require("durable-functions");

module.exports = df.orchestrator(function* (context) {
  // 会員登録フロー開始を待機
  yield context.df.waitForExternalEvent('StartSignUpEvent');

  // 会員名の送信を待機
  const data = yield context.df.waitForExternalEvent('AccountNameEvent');

  // DB登録アクティビティを呼び出し
  yield context.df.callActivity('SignUpActivity', data);
});