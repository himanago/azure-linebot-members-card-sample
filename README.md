# LINE Bot × Azure サーバーレスで作る会員証システム

## 概要

LINE Bot との対話で会員登録を行いデジタル会員証（QRコード）をリッチメニューとして発行するサンプルアプリです。


## 技術

- Durable Functions による複数の関数の組み合わせにより、Bot サーバー側で会員登録フローがどこまで進んでいるかを覚えておくことができます。
- 会員データは Cosmos DB に格納され、そのデータが登録・変更されたタイミングで呼び出される関数（Change Feed・Cosmos DBトリガー）が、画像の生成やリッチメニュー作成・切替を担当しています。

## 出典

本サンプルは、以下のリポジトリのサンプルコード追加分として提供させていただいた会員証機能を切り出したものです。

https://github.com/mochan-tk/Handson-LINE-Bot-Azure-template/tree/advanced-richmenu