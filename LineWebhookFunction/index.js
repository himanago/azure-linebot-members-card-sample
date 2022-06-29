'use strict';

const line = require('@line/bot-sdk');
const createHandler = require("azure-function-express").createHandler;
const express = require('express');
const CosmosClient = require("@azure/cosmos").CosmosClient;
const df = require('durable-functions');

const cosmosDBConfig = {
  endpoint: process.env.COSMOSDB_ACCOUNT,
  key: process.env.COSMOSDB_KEY,
  databaseId: process.env.COSMOSDB_DATABASENAME,
  containerId: process.env.COSMOSDB_CONTAINERNAME
};

const { endpoint, key, databaseId, containerId } = cosmosDBConfig;

const cosmosDBClient = new CosmosClient({ endpoint, key });
const database = cosmosDBClient.database(databaseId);
const cosmosDBContainer = database.container(containerId);

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

const client = new line.Client(config);
const app = express();

app.post('/api/LineWebhookFunction', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(e => handleEvent(e, req.context)))
    .then((result) => res.json(result))
    .catch((err) => {
      req.context.log.error(err);
      res.status(500).end();
    });
});

async function handleEvent(event, context) {
  const userId = event.source.userId;

  // 会員登録フローの制御
  const durableClient = df.getClient(context);
  const orchestrationStatus = await durableClient.getStatus(userId);

  if (event.type === 'message') {
    if (event.message.type === 'text') {
      if (event.message.text === '会員登録') {
        // すでに会員登録されていないかチェック
        const query = {
          query: 'SELECT * from c WHERE c.lineUserId = @lineUserId AND (NOT IS_DEFINED(c.isDeleted) OR c.isDeleted = false)',
          parameters: [
            { name: "@lineUserId", value: userId }
          ]
        };
        
        const { resources: items } = await cosmosDBContainer.items
          .query(query)
          .fetchAll();

        if (items.length) {
          return client.replyMessage(event.replyToken,{
            type: 'text',
            text: 'すでに会員登録されています。'
          });
        }

        // 会員登録でオーケストレータースタート
        await durableClient.startNew('SignUpOrchestrator', userId);
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '会員登録を行います。よろしいですか？',
          "quickReply": {
            "items": [
              {
                "type": "action",
                "action": {
                  "type":"postback",
                  "label":"Yes",
                  "data": "signup",
                  "displayText":"はい"
                }
              },
              {
                "type": "action",
                "action": {
                  "type":"postback",
                  "label":"No",
                  "data": "signup_cancel",
                  "text":"いいえ"
                }
              }
            ]
          }
        });
        
      } else if (!!orchestrationStatus && (orchestrationStatus.runtimeStatus === 'Running' || orchestrationStatus.runtimeStatus === 'Pending')) {
        // 会員名待機中に送られたテキストを会員名としてDB登録するため、テキストを投げる
        await durableClient.raiseEvent(userId, 'AccountNameEvent', {
          lineUserId: userId,
          accountName: event.message.text,
          replyToken: event.replyToken
        });
        return;

      } else if (event.message.text === '退会') {
        const query = {
          query: 'SELECT * from c WHERE c.lineUserId = @lineUserId',
          parameters: [
            { name: "@lineUserId", value: userId }
          ]
        };
        
        const { resources: items } = await cosmosDBContainer.items
          .query(query)
          .fetchAll();
        
        for (const item of items) {
          // データ論理削除
          item.isDeleted = true;

          const { resource: updatedItem } = await cosmosDBContainer
            .item(item.id)
            .replace(item);
        }

        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: '退会しました。'
        });

      } else {
        // その他はテキストをオウム返し
        return client.replyMessage(event.replyToken, {
          type: 'text',
          text: event.message.text
        });
      }
    }

  } else if (event.type === 'postback') {
    if (event.postback.data === 'signup') {
      // オーケストレーターに会員名を待機させる
      await durableClient.raiseEvent(userId, 'StartSignUpEvent', null);

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '会員名を送信してください。'
      });

    } else if (event.postback.data === 'signup_cancel') {
      // オーケストレーター停止
      await durableClient.terminate(userId, 'User Canceled');

      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '会員登録をキャンセルしました。'
      });

    } else if (event.postback.data === 'registered_member') {
      return client.replyMessage(event.replyToken, {
        type: 'text',
        text: '会員証を提示してください！'
      });
    }

  } else {
    // message・postback 以外のイベントは無視
    return Promise.resolve(null);  
  }
}

module.exports = createHandler(app);