# 教師側セットアップ手順

生徒がアプリから「📨 教師に送信」を押すと、自動で教師の Google Sheet と Drive に保存される仕組みのセットアップ手順です。所要 **約30分**、1回だけ。

## 完成形

- 生徒: アプリで試合終了 → 「📨 教師に送信」をワンタップ → 送信完了
- 教師: Google Sheet に全試合のデータが1行=1シュートで蓄積 → ピボットテーブルで即分析
- 同じ生徒が同じ試合を再送信した場合は **古いデータが自動で置換** される

## 手順

### 1. Google Sheet を作成

1. https://sheets.google.com を開いて新規作成
2. 名前を「ハンドボール試合データ」など、わかりやすく
3. URL から **Sheet ID** をコピー：
   - URL の `https://docs.google.com/spreadsheets/d/【ここがSheet ID】/edit`
   - 例: `1aBcD2eFgH3iJkLmNoPqRsTuVwXyZ`

### 2. Drive フォルダを作成

1. https://drive.google.com で新規フォルダ作成
2. 名前を「ハンドボールCSVアーカイブ」など
3. フォルダを開いた状態で URL から **Folder ID** をコピー：
   - URL の `https://drive.google.com/drive/folders/【ここがFolder ID】`
   - 例: `1XyZ2aBcD3eFgH4iJkLmNoPqRsTuV`

### 3. Apps Script プロジェクトを作成

1. https://script.google.com を開く
2. 「新しいプロジェクト」をクリック
3. 表示されたエディタに、`handball-submit.gs` の中身を**全部コピーして貼り付け**
4. ファイル冒頭の2行を、ステップ1〜2でコピーしたIDに書き換える：

```javascript
const SHEET_ID  = '1aBcD2eFgH3iJkLmNoPqRsTuVwXyZ';   // ← ステップ1のID
const FOLDER_ID = '1XyZ2aBcD3eFgH4iJkLmNoPqRsTuV';   // ← ステップ2のID
```

5. プロジェクト名を「ハンドボール送信エンドポイント」など、わかりやすく
6. 💾 保存 (Ctrl+S)

### 4. デプロイ（公開）

1. 右上の「**デプロイ**」→「**新しいデプロイ**」
2. 「種類の選択」歯車アイコン → 「**ウェブアプリ**」
3. 設定:
   - **説明**: 「ハンドボール送信v1」など
   - **次のユーザーとして実行**: **自分（教師のメールアドレス）**
   - **アクセスできるユーザー**: **全員**（URLを知っている人だけが送れる）
4. 「**デプロイ**」をクリック
5. 初回はアクセス権の確認が出る:
   - 「**アクセスを承認**」→ 自分のアカウントを選択
   - 「Google で確認されていません」が出たら「**詳細**」→「ハンドボール送信v1（安全ではないページ）に移動」
   - 「**許可**」をクリック
6. **ウェブアプリのURL** が表示される → コピー
   - 例: `https://script.google.com/macros/s/AKfycb.../exec`

### 5. URL を生徒に共有

このURLが生徒のアプリに必要です。

- メール、Classroom、LINE等で生徒に配布
- 各生徒は、アプリの ⚙設定 →「📨 教師への送信」→「送信先URL」に貼り付け
- 自分の名前/番号も同じく設定で入力

## 動作確認

1. 生徒のアプリで適当な試合を記録
2. 設定で URL と名前を入れたあと、「📨 教師に送信」を押す
3. 教師の Google Sheet を開く → 行が追加されていればOK
4. Drive フォルダにも CSV ファイルが入っているか確認

## データ集計のヒント

Sheet 列構成:

| 列 | 意味 |
|---|---|
| submitted_at | 送信時刻（自動） |
| student_name | 生徒名 |
| date | 試合日 |
| opponent | 対戦相手 |
| period | 1=前半, 2=後半 |
| time_s | 試合経過秒数 |
| mode | attack=自チーム攻撃, defense=守備 |
| result | goal / save / miss / turnover |
| attack_type | set / fast / 7m |
| course | TL/TR/ML/MR/BL/BR（コース） |
| player | シュート選手名 |
| gk | 出場GK |
| to_reason | TO理由（pass/dribble/foul/passive/other） |
| x, y | コート座標（%） |

**Sheet のメニュー → 挿入 → ピボットテーブル** で:
- 行: player、列: result → 選手別ゴール/ミス/セーブ
- 行: course、値: countif(result="goal") → コース別決定数
- フィルタ: attack_type=fast → 速攻時だけの集計
- 等が即座にできます

## トラブル時

- **送信できない**: URLが正しいか、デプロイの「アクセス権」が「全員」になっているか確認
- **再デプロイした場合**: URLが変わるので生徒に再周知
- **データがおかしい**: Sheetを直接編集してOK（次回送信で同一キーは置換される）
