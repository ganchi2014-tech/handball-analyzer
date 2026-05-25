# 次にやることは これだけ

Sheet と Drive は既に作成済み。あとは **Apps Script を貼り付けてデプロイ** するだけです。所要 **5分**。

## 用意済み

- **Sheet**: <https://docs.google.com/spreadsheets/d/1j3sbt8hohug2wOTynup6w3NQ3qw-n8nvNQBEwKOp954/edit>
- **Drive フォルダ**: <https://drive.google.com/drive/folders/1TTKZz6JJLSFNFf64PAE87O3VtW-T-IAT>
- **コード**: `apps-script/handball-submit.gs` （IDセット済）

## 手順（5分）

### 1. Apps Script でプロジェクト作成

1. <https://script.google.com> を開く（**Sheetを作ったのと同じGoogleアカウント** でログイン）
2. 「**新しいプロジェクト**」をクリック

### 2. コードを貼り付け

1. Apps Script エディタ画面に最初から書かれている `function myFunction() {...}` を全部消す
2. `apps-script/handball-submit.gs` の中身を**全文コピーして貼り付け**
3. プロジェクト名を「ハンドボール送信」など、わかりやすく
4. 💾 保存（Ctrl+S）

### 3. デプロイ

1. 画面右上の青い「**デプロイ**」→「**新しいデプロイ**」
2. ⚙ 歯車（種類の選択）→「**ウェブアプリ**」を選ぶ
3. 設定:
   - **説明**: 「v1」など
   - **次のユーザーとして実行**: **自分（あなたのメール）**
   - **アクセスできるユーザー**: 「**全員**」
4. 「**デプロイ**」をクリック
5. 初回のみ:
   - 「アクセスを承認」→ 自分のアカウント選択
   - 「Google で確認されていません」の警告 → 「**詳細**」→「**ハンドボール送信（安全ではないページ）に移動**」
   - 「**許可**」をクリック
6. **ウェブアプリのURL** が表示される → **コピー**
   - 形式: `https://script.google.com/macros/s/AKfycb.../exec`

### 4. アプリの設定にURLを貼り付け

1. アプリを開く → ⚙ 設定
2. 「📨 教師への送信」セクション
3. 「送信先URL」に **コピーしたURL** を貼り付け
4. 「自分の名前/番号」も入力（例: 教師なら「教師テスト」）

### 5. 動作確認

1. アプリで適当に1〜2シュート記録
2. ⚙ 設定 →「📨 現在試合を教師に送信」
3. 緑のステータス「✅ 送信完了」が出れば成功
4. <https://docs.google.com/spreadsheets/d/1j3sbt8hohug2wOTynup6w3NQ3qw-n8nvNQBEwKOp954/edit> を開く → 行が追加されていればOK
5. <https://drive.google.com/drive/folders/1TTKZz6JJLSFNFf64PAE87O3VtW-T-IAT> → CSVファイルが入っていればOK

## 完了したら

生徒には:
- **コピーしたURL**
- アプリ自体（GitHub Pages等で公開する場合）

の2つを共有すればOK。

## URLを知っている人は誰でも送れる仕様

URL自体が秘密鍵。他のクラスに漏らさないようにご注意を。 

もしURLが流出した、または無効化したくなったら:
1. Apps Script → 「デプロイ」→「デプロイを管理」
2. 既存のデプロイを **アーカイブ** （= 無効化）
3. 「新しいデプロイ」で再デプロイ → 新URL を生徒に再周知
