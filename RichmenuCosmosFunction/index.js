'use strict';

const line = require('@line/bot-sdk');
const QRCode = require('qrcode');
const Jimp = require('jimp');

const richMenuWidth = 2500;
const richMenuHeight = 1686;

module.exports = async function (context, documents) {
  const client = new line.Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
  });

  // 登録のあった会員情報ごとに処理
  for (const item of documents) {
    // 論理削除されていたらリッチメニューを外す
    if (item.isDeleted) {
      await client.unlinkRichMenuFromUser(item.lineUserId);
      continue;
    }

    // 会員名でQRコード生成
    const qr = await QRCode.toBuffer(item.accountName, { width: richMenuHeight });
    
    // リサイズ
    const image = await Jimp.read(qr);
    image.contain(richMenuWidth, richMenuHeight);
    
    // リッチメニュー作成
    const richMenuId = await client.createRichMenu({
      "size": {
        "width": richMenuWidth,
        "height": richMenuHeight
      },
      "selected": false,
      "name": "members_card",
      "chatBarText": "会員証",
      "areas": [
        {
          "bounds": {
            "x": 0,
            "y": 0,
            "width": 2500,
            "height": 1686
          },
          "action": {
            "type": "postback",
            "data": "registered_member"
          }
        }
      ]
    });

    // リッチメニュー画像を登録
    const buffer = await image.getBufferAsync(Jimp.MIME_PNG);
    await client.setRichMenuImage(richMenuId, buffer);

    // ユーザーにリンク
    await client.linkRichMenuToUser(item.lineUserId, richMenuId);

    // 保持しておいたリプライトークンを使って完了メッセージを返信
    await client.replyMessage(item.replyToken,{
      type: 'text',
      text: '会員登録が完了しました。会員証はリッチメニューから使用できます。'
    });
  }
}