# Jobcan UI Enhancer

Jobcan（勤怠管理）の画面を見やすく・使いやすくする Chrome 拡張機能（Manifest V3）。
機能の詳細と変更履歴は [changings.md](changings.md) を参照してください。

対象ドメイン: `ssl.jobcan.jp/employee/*`, `id.jobcan.jp/users/sign_in*`

---

## インストール（開発版）

ビルド不要。ソースをそのまま読み込みます。

1. Chrome で `chrome://extensions/` を開く
2. 右上の「デベロッパーモード」をオン
3. 「パッケージ化されていない拡張機能を読み込む」→ このディレクトリを選択

コードを変更したら、同じ画面の拡張機能カードにある **リロードボタン（⟳）** を押してから
Jobcan のページを再読み込みしてください。CSS の変更にもリロードが必要です。

## 開発

```bash
npm install
npm run lint      # 0 件になることを維持してください
npm run lint:fix
```

ビルドステップもテストもありません。`scripts/*.js` がそのままブラウザで動きます。

## 構成

```
manifest.json          コンテンツスクリプトの読み込み順を定義（＝実質の依存順）
background.js          Service Worker: ログイン代行 / html2canvas の遅延注入
popup.js, popup.html   ツールバーのポップアップ（設定・クイックリンク・ログイン）
scripts/               コンテンツスクリプト（下記）
css/                   variables → base → styles → responsive → manHourRebuild の順で適用
icons/                 拡張機能アイコン
html2canvas.min.js     スクリーンショット用。初回利用時に動的注入（常時読み込みはしない）
confetti.min.js        打刻時の演出
```

### scripts/ の役割

| ファイル | 役割 |
| --- | --- |
| `main.js` | エントリポイント。URL を見て各機能を呼び分ける。共有リソース管理レジストリもここ |
| `utils.js` | `showNotification`（トースト）※唯一の定義元 |
| `ui.js` | ヘッダー・サイドメニュー・ダークモードなど全体的なUI調整 |
| `clock.js` | フリップ時計・勤務進捗バー・サマリータイル・時計カードの背景アニメーション |
| `punchCard.js` | トップページの打刻カード（枠の除去・状態ピル・打刻詳細設定の折りたたみ・確認件数／お知らせの移設） |
| `screenshot.js` | フローティングアクションメニュー（FAB）とスクリーンショット |
| `overlay.js` | 「労働データ」オーバーレイ |
| `dataExtraction.js` | 出勤簿・打刻一覧から勤怠データを抽出（`fetch` + `DOMParser`） |
| `formEnhancer.js` | `#collapseInfo` サマリーカードの整形 |
| `draggable.js` | タブコンテナの横ドラッグスクロール |
| `requestStatus.js` | 申請一覧のステータスバッジ |
| `emptyState.js` | 申請一覧の空状態表示 |
| `manHourApi.js` | 工数管理 REST API クライアント |
| `manHourEdit.js` | 工数実績入力ページ（見出しの日付・サマリーヘッダー・日付ナビ・プロジェクト名マスク） |
| `manHourList.js` | 工数実績一覧ページ（フィルタ・不一致ハイライト・レポート） |
| `attendanceChart.js` | 出勤簿ページの労働時間バーチャート（ページ内の表から集計） |
| `manHourEditSearch.js` | プロジェクト検索の部分一致対応（**MAIN ワールド**で実行） |
| `loginInjector.js` | ログインページへの資格情報入力 |

## デバッグ

「以下の項目の確認」の件数は通常0件、「管理者からのお知らせ」も普段は空なので、
移設後の見た目を確認する手段がありません。トップページのコンソール（ページ側の
コンテキストでOK）から次を実行するとダミーで再現できます。

```js
const jbePreview = (o) => window.dispatchEvent(new CustomEvent('jbe:preview', { detail: o }));

jbePreview();                                   // 警告2件＋お知らせ1件
jbePreview({ alerts: 1, notices: 2 });          // 件数を指定
jbePreview({ items: [{ label: '打刻エラー', count: 3 }] });
jbePreview({ notices: ['メンテナンスのお知らせ'] });
jbePreview({ reset: true });                    // 実データに戻す
```

プレビュー中はロックがかかり、1秒ごとの再適用で上書きされません。`reset` でロックを
外して実際のカードを読み直します。

## 設計上の注意点

拡張機能を触る前に知っておくべき、直感に反する制約です。

**モジュールではなくグローバル共有**
バンドラも `import` もありません。マニフェストが `scripts/*.js` を単一のグローバルスコープに
連結します。あるファイルの `function foo()` は他のファイルからそのまま呼べます。
そのため、**同名の関数を2ファイルで定義すると、読み込み順で勝敗が決まり静かに壊れます**。
公開する関数は ESLint の `/* exported */` と `eslint.config.js` の `crossFileGlobals` の
両方に登録してください（詳細は `eslint.config.js` 冒頭のコメント）。

**`manHourEditSearch.js` だけ MAIN ワールド**
ページ自身の jQuery / jQuery-UI オートコンプリートに触る必要があるため、
このファイルだけ分離世界ではなくページ世界で動きます。他のスクリプトの
グローバル（`window.__jbe_*` など）には**アクセスできません**。

**工数の入力欄は置き換えない**
プロジェクト／タスクの入力欄は Jobcan 標準のオートコンプリートのままにしてください。
独自ピッカーで値を入れると Jobcan の内部モデルを経由しないため「未入力」と判定され、
保存できません。拡張するのは検索（`_search`）だけです。

**`applyEnhancements()` は繰り返し呼ばれる**
`document.body` 全体を監視する MutationObserver から、DOM が変化するたび
（デバウンス後、およそ1秒に1回）再実行されます。ここから呼ばれる処理は
必ず冪等にし、ガード（`data-*` 属性か `window.__jbe_*Inited`）を付けてください。

**Bootstrap 4 との `!important` 合戦**
Jobcan のスタイルシートには `!important` が約1,300個あります（大半は Bootstrap 4 の
ユーティリティクラス）。詳細度をいくら上げても `!important` には勝てないため、
`css/` 内の `!important` の約9割は必要があって付いています。安易に外さないでください。

**タイマーと Observer はレジストリ経由で**
`window.__jbe_startManagedInterval(key, ...)` と
`window.__jbe_registerManagedObserver(key, observer, onCleanup)` を使ってください。
`watch:` で始まるキーは SPA 遷移時に破棄されます（`onCleanup` で初期化フラグを戻せます）。
`core:` で始まるキーは破棄されません。

## 既知の課題

- ログインパスワードを `chrome.storage.local` に平文保存しています（端末内のみ）。
  Chrome のパスワードマネージャーに任せる方が安全です。
- `activeTab` パーミッションは未使用（`scripting` は html2canvas の注入で使用中）。
- 工数実績入力ページの「前日をコピー」は未実装。Jobcan の入力欄には hidden input が
  なく、選択状態が不透明な JS モデルに保持されているため、値を安全に流し込む方法が
  未確定です（詳細は CLAUDE.md）。
- テストなし。
